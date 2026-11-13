/**
 * Client-side Firestore operations
 * Replaces Server Actions with direct Firestore calls from browser
 * This eliminates Cloud Run costs - only Firebase Hosting (free) + Firestore reads/writes
 */

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch,
  runTransaction,
  type DocumentSnapshot,
  type DocumentData,
  deleteField
} from "firebase/firestore";
import type {
  Booking,
  BookingFormData,
  BookingStatus,
  Passenger,
  PreparedAccount,
  TrainClass,
  RefundDetails,
  BookingGroup,
  BookingCancellation,
  IrctcRefundLeg,
  CustomerRefundLeg,
  RefundRecipientType,
} from "@/types/booking";
import { LEGACY_CLASS_MAP } from "@/types/booking";
import {
  LEGACY_CANCELLATION_ID,
  buildLegacyCancellation,
  computeWalletCredit,
  ensurePassengerPids,
  generateLocalId,
  normalizeCustomerLeg,
  normalizeIrctcLeg,
  roundMoney,
  splitAmountByCounts,
  stripUndefined,
  type CancellationSource,
} from "@/lib/cancellations";

// Helper to convert Firestore timestamps
const toISOStringSafe = (value: any, fieldName: string, bookingId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Booking ID ${bookingId}: Field '${fieldName}' is invalid: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}'`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  console.error(`[DataFormatError] Booking ID ${bookingId}: Unexpected type for '${fieldName}':`, value);
  throw new Error(`Unexpected format for '${fieldName}'`);
};

// Normalize legacy class names to new format
const normalizeClassType = (classType: string): TrainClass => {
  // Check if it's a legacy class name and map it to the new format
  if (classType in LEGACY_CLASS_MAP) {
    return LEGACY_CLASS_MAP[classType as keyof typeof LEGACY_CLASS_MAP];
  }
  // Return as-is if it's already a valid new class name
  return classType as TrainClass;
};

// Map Firestore document to Booking type
const mapDocToBooking = (document: DocumentSnapshot<DocumentData>, id: string): Booking => {
  const data = document.data();
  if (!data) {
    throw new Error(`No data found for document with id ${id}`);
  }

  return {
    id,
    source: data.source as string,
    destination: data.destination as string,
    journeyDate: data.journeyDate as string,
    userName: data.userName as string,
    passengers: Array.isArray(data.passengers) ? data.passengers as Passenger[] : [],
    bookingDate: data.bookingDate as string,
    classType: normalizeClassType(data.classType),
    bookingType: data.bookingType || "Tatkal",
    trainPreference: data.trainPreference as string | undefined,
    upgradePreferred: data.upgradePreferred as boolean | undefined,
    remarks: (data.remarks || data.timePreference) as string | undefined,
    status: data.status as BookingStatus,
    statusReason: data.statusReason as string | undefined,
    statusHandler: data.statusHandler as string | undefined,
    createdAt: toISOStringSafe(data.createdAt, "createdAt", id),
    updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", id),
    preparedAccounts: Array.isArray(data.preparedAccounts) ? (data.preparedAccounts as PreparedAccount[]) : undefined,
    paymentReceived: data.paymentReceived as boolean | undefined,
    amountSettled: data.amountSettled as boolean | undefined,
    refundDetails: data.refundDetails as RefundDetails | undefined,
    cancellations: Array.isArray(data.cancellations) && data.cancellations.length > 0
      ? (data.cancellations as BookingCancellation[])
      : undefined,
    groupId: data.groupId as string | undefined,
  };
};

// ============= BOOKING OPERATIONS =============

export async function getBookings(): Promise<Booking[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const bookings = querySnapshot.docs
      .map(doc => {
        try {
          return mapDocToBooking(doc, doc.id);
        } catch (error) {
          console.error(`Failed to map document ${doc.id}:`, error);
          return null;
        }
      })
      .filter(booking => booking !== null) as Booking[];

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] getBookings:", error);
    return [];
  }
}

export async function getPendingBookings(): Promise<Booking[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, where("status", "==", "Requested"));
    const querySnapshot = await getDocs(q);

    const bookings = querySnapshot.docs
      .map(doc => {
        try {
          return mapDocToBooking(doc, doc.id);
        } catch (error) {
          console.error(`Failed to map document ${doc.id}:`, error);
          return null;
        }
      })
      .filter(booking => booking !== null) as Booking[];

    // Sort by journey date
    bookings.sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] getPendingBookings:", error);
    return [];
  }
}

export async function getBookingById(id: string): Promise<Booking | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const docRef = doc(db, "bookings", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return mapDocToBooking(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] getBookingById (${id}):`, error);
    return null;
  }
}

export async function getDistinctBookingDates(): Promise<string[]> {
  try {
    const allBookings = await getBookings();
    const dateSet = new Set<string>();
    allBookings.forEach(booking => {
      dateSet.add(booking.bookingDate);
    });
    return Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  } catch (error) {
    console.error("[Firestore Error] getDistinctBookingDates:", error);
    return [];
  }
}

export async function addBooking(formData: BookingFormData): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const bookingData: Record<string, any> = {
      ...formData,
      status: "Requested" as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "bookings"), bookingData);

    const now = new Date().toISOString();
    const newBooking: Booking = {
      ...formData,
      passengers: formData.passengers.map(p => ({ ...p, age: Number(p.age) })),
      id: docRef.id,
      status: "Requested",
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, booking: newBooking };
  } catch (error: any) {
    console.error("[Firestore Error] addBooking:", error);
    return { success: false, error: error.message || "Failed to add booking" };
  }
}

export async function updateBookingById(id: string, formData: BookingFormData): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);

    // Cancellations point at passengers by their stable `pid`. Keep those ids
    // through the edit (the form may have been opened before they were
    // assigned) and refuse an edit that would drop a cancelled passenger.
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : undefined;
    const existingPassengers: Passenger[] = Array.isArray(existingData?.passengers) ? existingData!.passengers : [];
    const takenPids = new Set(formData.passengers.map(p => p.pid).filter(Boolean));
    const passengers = formData.passengers.map((p, index) => {
      const next: Passenger = { ...p, age: Number(p.age) };
      const previous = existingPassengers[index];
      if (!next.pid && previous?.pid && previous.name === next.name && !takenPids.has(previous.pid)) {
        next.pid = previous.pid;
        takenPids.add(previous.pid);
      }
      if (!next.pid) delete next.pid;
      return next;
    });

    const cancelledPids = new Set<string>();
    if (Array.isArray(existingData?.cancellations)) {
      (existingData!.cancellations as BookingCancellation[]).forEach(c => {
        if (c.kind === "cancellation") c.passengerPids.forEach(pid => cancelledPids.add(pid));
      });
    }
    const keptPids = new Set(passengers.map(p => p.pid).filter(Boolean));
    const droppedCancelled = [...cancelledPids].some(pid => !keptPids.has(pid));
    if (droppedCancelled) {
      return {
        success: false,
        error: "A cancelled passenger cannot be removed from the booking. Undo the cancellation first.",
      };
    }

    const bookingData: Record<string, any> = {
      ...formData,
      passengers,
      updatedAt: serverTimestamp(),
    };

    if (!formData.trainPreference) {
      bookingData.trainPreference = deleteField();
    }
    if (!formData.upgradePreferred) {
      bookingData.upgradePreferred = deleteField();
    }
    if (!formData.remarks) {
      bookingData.remarks = deleteField();
    }

    await updateDoc(docRef, bookingData);

    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) {
      return { success: false, error: "Failed to retrieve booking after update" };
    }

    const updatedBooking = mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    return { success: true, booking: updatedBooking };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingById (${id}):`, error);
    return { success: false, error: error.message || "Failed to update booking" };
  }
}

export async function deleteBooking(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBooking (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete booking" };
  }
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  reason?: string,
  handler?: string
): Promise<Booking | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const docRef = doc(db, "bookings", id);
    const updateData: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (reason !== undefined && reason.trim() !== '') {
      updateData.statusReason = reason.trim();
    } else if (reason === '') {
      updateData.statusReason = deleteField();
    }

    if (handler !== undefined && handler.trim() !== "") {
      updateData.statusHandler = handler.trim();
    } else if (handler === "") {
      updateData.statusHandler = deleteField();
    }

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] updateBookingStatus (${id}):`, error);
    return null;
  }
}

/**
 * Update status for multiple bookings in a group
 */
export async function updateGroupBookingStatus(
  bookingIds: string[],
  status: BookingStatus,
  reason?: string,
  handler?: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return { success: false, error: "Database not initialized" };
  }

  try {
    const promises = bookingIds.map(id => updateBookingStatus(id, status, reason, handler));
    await Promise.all(promises);
    return { success: true };
  } catch (error: any) {
    console.error("[Firestore Error] updateGroupBookingStatus:", error);
    return { success: false, error: error.message || "Failed to update group status" };
  }
}

export async function updateBookingRequirements(
  id: string,
  preparedAccounts: PreparedAccount[]
): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    
    if (preparedAccounts.length === 0) {
      updateData.preparedAccounts = deleteField();
    } else {
      updateData.preparedAccounts = preparedAccounts;
    }

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      const updatedBooking = mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
      return { success: true, booking: updatedBooking };
    }
    
    return { success: false, error: "Failed to retrieve booking after update" };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingRequirements (${id}):`, error);
    return { success: false, error: error.message || "Failed to update booking requirements" };
  }
}

export async function updateBookingPaymentTracking(
  id: string,
  paymentTracking: Pick<Booking, "paymentReceived" | "amountSettled">
): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);

    await updateDoc(docRef, {
      ...paymentTracking,
      updatedAt: serverTimestamp(),
    });

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return { success: true, booking: mapDocToBooking(updatedDocSnap, updatedDocSnap.id) };
    }

    return { success: false, error: "Failed to retrieve booking after update" };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingPaymentTracking (${id}):`, error);
    return { success: false, error: error.message || "Failed to update payment tracking" };
  }
}
// ============= CANCELLATION & REFUND OPERATIONS =============
//
// A booking's `cancellations` array holds one entry per cancellation event
// (full or partial), each with an IRCTC refund leg and a customer payback leg.
// Every write below runs in a transaction over the booking doc — and the IRCTC
// account doc when a wallet balance changes — so a refund can never be saved
// without its wallet credit (or the reverse).

/** Passengers picked from one booking for cancellation. */
export interface CancellationSelection {
  bookingId: string;
  /** Indexes into the booking's stored `passengers` array. */
  passengerIndexes: number[];
  /** Names at those indexes, used to detect a booking edited in the meantime. */
  expectedNames: string[];
}

/**
 * Details captured when passengers are cancelled. Amounts are totals for the
 * whole cancellation; when it spans several bookings (a group PNR) they are
 * split by the number of passengers cancelled in each booking.
 */
export interface NewCancellationDetails {
  cancelledOn: string;
  cancelledBy?: string;
  reason?: string;
  fareCancelled?: number;
  cancellationCharge?: number;
  irctcRefund: {
    status: "Pending" | "No Refund";
    recipientType: RefundRecipientType;
    recipientName?: string;
    accountId?: string;
    expectedAmount?: number;
  };
  customerRefund: {
    status: "Pending" | "Not Applicable";
    recipientName?: string;
    amount?: number;
  };
}

/** Changes to an existing cancellation. A leg, when given, replaces the stored leg. */
export interface CancellationPatch {
  cancelledOn?: string;
  cancelledBy?: string;
  reason?: string;
  fareCancelled?: number | null;
  cancellationCharge?: number | null;
  irctcRefund?: Omit<IrctcRefundLeg, "walletCredited">;
  customerRefund?: CustomerRefundLeg;
}

export interface CancellationResult {
  success: boolean;
  error?: string;
  /** Set when the refund was saved but a wallet balance could not be adjusted. */
  warning?: string;
  /** Bookings left with no travelling passengers (now "CNF & Cancelled"). */
  fullyCancelledBookingIds?: string[];
}

const isoOrNow = (value: any): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && value) return value;
  return new Date().toISOString();
};

const toCancellationSource = (data: DocumentData): CancellationSource => ({
  status: data.status as BookingStatus,
  passengers: Array.isArray(data.passengers) ? (data.passengers as Passenger[]) : [],
  userName: data.userName as string | undefined,
  statusReason: data.statusReason as string | undefined,
  statusHandler: data.statusHandler as string | undefined,
  createdAt: isoOrNow(data.createdAt),
  updatedAt: isoOrNow(data.updatedAt),
  refundDetails: data.refundDetails as RefundDetails | undefined,
  cancellations: Array.isArray(data.cancellations) ? (data.cancellations as BookingCancellation[]) : undefined,
});

/**
 * Stored cancellation entries for a booking doc. Bookings cancelled before this
 * feature have none, so their single legacy entry is synthesised; `isLegacy`
 * tells the caller to persist it (and drop `refundDetails`) on write.
 */
const loadCancellationEntries = (data: DocumentData): { entries: BookingCancellation[]; isLegacy: boolean } => {
  if (Array.isArray(data.cancellations) && data.cancellations.length > 0) {
    return { entries: data.cancellations as BookingCancellation[], isLegacy: false };
  }
  const legacy = buildLegacyCancellation(toCancellationSource(data));
  return { entries: legacy ? [legacy] : [], isLegacy: !!legacy };
};

const MISSING_ACCOUNT_WARNING =
  "The IRCTC account for this refund no longer exists, so no wallet balance was changed.";

/**
 * Cancel one or more passengers of booked ticket(s). The booking stays
 * "Booked" while anyone is still travelling and becomes "CNF & Cancelled" once
 * the last passenger is cancelled. Booking records are not touched: commission
 * is kept and the fare stays attributed to the handler/account that booked it.
 */
export async function cancelBookingPassengers(input: {
  selections: CancellationSelection[];
  details: NewCancellationDetails;
}): Promise<CancellationResult> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }
  const database = db;
  const { details } = input;
  const selections = input.selections.filter(s => s.passengerIndexes.length > 0);
  if (selections.length === 0) {
    return { success: false, error: "Select at least one passenger to cancel" };
  }

  try {
    const fullyCancelledBookingIds = await runTransaction(database, async (tx) => {
      const refs = selections.map(s => doc(database, "bookings", s.bookingId));
      const snaps: DocumentSnapshot<DocumentData>[] = [];
      for (const ref of refs) {
        snaps.push(await tx.get(ref));
      }

      const counts = selections.map(s => new Set(s.passengerIndexes).size);
      const split = (total?: number) =>
        typeof total === "number" && !Number.isNaN(total) ? splitAmountByCounts(total, counts) : undefined;
      const fareParts = split(details.fareCancelled);
      const chargeParts = split(details.cancellationCharge);
      const expectedParts = split(details.irctcRefund.expectedAmount);
      const customerParts = split(details.customerRefund.amount);

      const now = new Date().toISOString();
      const linkId = selections.length > 1 ? generateLocalId("cg") : undefined;
      const fullyCancelled: string[] = [];

      selections.forEach((selection, i) => {
        const snap = snaps[i];
        if (!snap.exists()) {
          throw new Error("Booking not found. It may have been deleted.");
        }
        const data = snap.data();
        if (data.status !== "Booked") {
          throw new Error(`Only booked tickets can be cancelled (the booking for ${data.userName} is "${data.status}").`);
        }

        const { passengers } = ensurePassengerPids(
          Array.isArray(data.passengers) ? (data.passengers as Passenger[]) : []
        );
        const existing: BookingCancellation[] = Array.isArray(data.cancellations) ? data.cancellations : [];
        const alreadyCancelled = new Set<string>();
        existing.forEach(c => {
          if (c.kind === "cancellation") c.passengerPids.forEach(pid => alreadyCancelled.add(pid));
        });

        const pickedPids: string[] = [];
        const pickedNames: string[] = [];
        selection.passengerIndexes.forEach((index, k) => {
          const passenger = passengers[index];
          if (!passenger || passenger.name !== selection.expectedNames[k]) {
            throw new Error("This booking was changed on another device. Close the dialog and try again.");
          }
          const pid = passenger.pid as string;
          if (alreadyCancelled.has(pid)) {
            throw new Error(`${passenger.name} is already cancelled.`);
          }
          if (pickedPids.includes(pid)) return;
          pickedPids.push(pid);
          pickedNames.push(passenger.name);
        });

        const remaining = passengers.filter(
          p => !alreadyCancelled.has(p.pid as string) && !pickedPids.includes(p.pid as string)
        ).length;
        const becomesFullyCancelled = remaining === 0;

        const entry: BookingCancellation = stripUndefined({
          id: generateLocalId("c"),
          kind: "cancellation" as const,
          passengerPids: pickedPids,
          passengerNames: pickedNames,
          cancelledOn: details.cancelledOn,
          cancelledBy: details.cancelledBy?.trim(),
          reason: details.reason?.trim(),
          fareCancelled: fareParts?.[i],
          cancellationCharge: chargeParts?.[i],
          cancellationGroupId: linkId,
          // Remembered so undoing this cancellation can restore who booked it.
          previousStatusHandler: becomesFullyCancelled ? (data.statusHandler as string | undefined) : undefined,
          irctcRefund: normalizeIrctcLeg({
            status: details.irctcRefund.status,
            recipientType: details.irctcRefund.recipientType,
            recipientName: details.irctcRefund.recipientName?.trim(),
            accountId: details.irctcRefund.accountId,
            expectedAmount: expectedParts?.[i],
          }),
          customerRefund: normalizeCustomerLeg({
            status: details.customerRefund.status,
            recipientName: details.customerRefund.recipientName?.trim() || (data.userName as string | undefined),
            amount: customerParts?.[i],
          }),
          createdAt: now,
          updatedAt: now,
        });

        const update: Record<string, any> = {
          passengers,
          cancellations: [...existing, entry],
          updatedAt: serverTimestamp(),
        };
        if (becomesFullyCancelled) {
          update.status = "CNF & Cancelled";
          update.statusReason = details.reason?.trim() ? details.reason.trim() : deleteField();
          if (details.cancelledBy?.trim()) {
            update.statusHandler = details.cancelledBy.trim();
          }
          fullyCancelled.push(selection.bookingId);
        }
        tx.update(refs[i], update);
      });

      return fullyCancelled;
    });

    return { success: true, fullyCancelledBookingIds };
  } catch (error: any) {
    console.error("[Firestore Error] cancelBookingPassengers:", error);
    return { success: false, error: error.message || "Failed to cancel passengers" };
  }
}

/**
 * Update a cancellation's details or either refund leg.
 *
 * Wallet rule: a refund of a real cancellation that is "Received" by an IRCTC
 * wallet is added to that account's `walletAmount`. The amount applied is kept
 * on the entry (`irctcRefund.walletCredited`), so any later change — amount,
 * status, recipient — applies only the difference, and an undo reverses exactly
 * what was credited.
 */
export async function updateBookingCancellation(
  bookingId: string,
  cancellationId: string,
  patch: CancellationPatch
): Promise<CancellationResult> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }
  const database = db;

  try {
    const warning = await runTransaction(database, async (tx) => {
      const bookingRef = doc(database, "bookings", bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new Error("Booking not found. It may have been deleted.");
      }
      const data = bookingSnap.data();
      const { entries, isLegacy } = loadCancellationEntries(data);
      const current = entries.find(e => e.id === cancellationId);
      if (!current) {
        throw new Error("This cancellation no longer exists. Refresh and try again.");
      }

      const { irctcRefund: irctcPatch, customerRefund: customerPatch, ...fields } = patch;
      const next: BookingCancellation = {
        ...current,
        ...(fields.cancelledOn !== undefined ? { cancelledOn: fields.cancelledOn } : {}),
        ...(fields.cancelledBy !== undefined ? { cancelledBy: fields.cancelledBy.trim() } : {}),
        ...(fields.reason !== undefined ? { reason: fields.reason.trim() } : {}),
        ...(fields.fareCancelled !== undefined ? { fareCancelled: fields.fareCancelled ?? undefined } : {}),
        ...(fields.cancellationCharge !== undefined ? { cancellationCharge: fields.cancellationCharge ?? undefined } : {}),
        irctcRefund: normalizeIrctcLeg({ ...(irctcPatch ?? current.irctcRefund) }),
        customerRefund: normalizeCustomerLeg({ ...(customerPatch ?? current.customerRefund) }),
        // A synthesised legacy entry gets a real id once it is stored.
        id: current.id === LEGACY_CANCELLATION_ID ? generateLocalId("c") : current.id,
        updatedAt: new Date().toISOString(),
      };

      const previousCredit = Number(current.irctcRefund.walletCredited) || 0;
      const previousAccountId = current.irctcRefund.accountId;
      let nextCredit = computeWalletCredit(next);
      const nextAccountId = next.irctcRefund.accountId;

      const deltas = new Map<string, number>();
      if (previousCredit > 0 && previousAccountId) {
        deltas.set(previousAccountId, roundMoney((deltas.get(previousAccountId) || 0) - previousCredit));
      }
      if (nextCredit > 0 && nextAccountId) {
        deltas.set(nextAccountId, roundMoney((deltas.get(nextAccountId) || 0) + nextCredit));
      }

      // Transactions need every read before the first write.
      let missingAccount = false;
      const accountWrites: Array<{ ref: ReturnType<typeof doc>; walletAmount: number }> = [];
      for (const [accountId, delta] of deltas) {
        const accountRef = doc(database, "irctcAccounts", accountId);
        const accountSnap = await tx.get(accountRef);
        if (!accountSnap.exists()) {
          if (accountId === nextAccountId && nextCredit > 0) {
            nextCredit = 0;
            missingAccount = true;
          }
          continue;
        }
        if (delta === 0) continue;
        const currentWallet = Number(accountSnap.data().walletAmount) || 0;
        accountWrites.push({ ref: accountRef, walletAmount: roundMoney(currentWallet + delta) });
      }

      if (nextCredit > 0) {
        next.irctcRefund.walletCredited = nextCredit;
      } else {
        delete next.irctcRefund.walletCredited;
      }

      accountWrites.forEach(({ ref, walletAmount }) => {
        tx.update(ref, { walletAmount, updatedAt: serverTimestamp() });
      });

      const nextEntries = entries.map(e => (e.id === cancellationId ? stripUndefined(next) : e));
      const bookingUpdate: Record<string, any> = {
        cancellations: nextEntries,
        updatedAt: serverTimestamp(),
      };
      if (isLegacy || data.refundDetails !== undefined) {
        bookingUpdate.refundDetails = deleteField();
      }
      tx.update(bookingRef, bookingUpdate);

      return missingAccount ? MISSING_ACCOUNT_WARNING : undefined;
    });

    return { success: true, warning };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingCancellation (${bookingId}):`, error);
    return { success: false, error: error.message || "Failed to update refund" };
  }
}

/**
 * Reverse wallet credits for the given entries inside a transaction. Reads all
 * affected accounts first (transaction rule) and returns the writes to apply.
 */
async function prepareWalletReversal(
  tx: import("firebase/firestore").Transaction,
  database: NonNullable<typeof db>,
  entries: BookingCancellation[]
): Promise<Array<{ ref: ReturnType<typeof doc>; walletAmount: number }>> {
  const credits = new Map<string, number>();
  entries.forEach(entry => {
    const credited = Number(entry.irctcRefund.walletCredited) || 0;
    const accountId = entry.irctcRefund.accountId;
    if (credited > 0 && accountId) {
      credits.set(accountId, roundMoney((credits.get(accountId) || 0) + credited));
    }
  });

  const writes: Array<{ ref: ReturnType<typeof doc>; walletAmount: number }> = [];
  for (const [accountId, credited] of credits) {
    const accountRef = doc(database, "irctcAccounts", accountId);
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists()) continue; // account deleted — nothing left to reverse
    const currentWallet = Number(accountSnap.data().walletAmount) || 0;
    writes.push({ ref: accountRef, walletAmount: roundMoney(currentWallet - credited) });
  }
  return writes;
}

/**
 * Undo a cancellation: its passengers travel again, any wallet credit from its
 * refund is reversed, and a booking that had become "CNF & Cancelled" goes
 * back to "Booked".
 */
export async function deleteBookingCancellation(
  bookingId: string,
  cancellationId: string
): Promise<CancellationResult> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }
  const database = db;

  try {
    await runTransaction(database, async (tx) => {
      const bookingRef = doc(database, "bookings", bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) {
        throw new Error("Booking not found. It may have been deleted.");
      }
      const data = bookingSnap.data();
      const { entries } = loadCancellationEntries(data);
      const target = entries.find(e => e.id === cancellationId);
      if (!target) {
        throw new Error("This cancellation no longer exists. Refresh and try again.");
      }
      if (target.kind !== "cancellation") {
        throw new Error("A failed payment cannot be undone here. Change the booking status instead.");
      }

      const walletWrites = await prepareWalletReversal(tx, database, [target]);
      walletWrites.forEach(({ ref, walletAmount }) => {
        tx.update(ref, { walletAmount, updatedAt: serverTimestamp() });
      });

      const remaining = entries.filter(e => e.id !== cancellationId);
      const bookingUpdate: Record<string, any> = {
        cancellations: remaining.length > 0 ? remaining : deleteField(),
        refundDetails: deleteField(),
        updatedAt: serverTimestamp(),
      };
      if (data.status === "CNF & Cancelled") {
        bookingUpdate.status = "Booked";
        bookingUpdate.statusReason = deleteField();
        bookingUpdate.statusHandler = target.previousStatusHandler || deleteField();
      }
      tx.update(bookingRef, bookingUpdate);
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBookingCancellation (${bookingId}):`, error);
    return { success: false, error: error.message || "Failed to undo cancellation" };
  }
}

/**
 * Remove every cancellation (and the legacy `refundDetails`) from a booking,
 * reversing all wallet credits. Used before a booking goes back to "Requested":
 * deleting the booking record then returns the full fare to the wallet, so any
 * refund already credited must be taken back first or it would be counted twice.
 * Does not change the booking status.
 */
export async function clearBookingCancellations(bookingId: string): Promise<CancellationResult> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }
  const database = db;

  try {
    await runTransaction(database, async (tx) => {
      const bookingRef = doc(database, "bookings", bookingId);
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists()) return;
      const data = bookingSnap.data();
      const { entries } = loadCancellationEntries(data);
      if (entries.length === 0 && data.refundDetails === undefined && data.cancellations === undefined) return;

      const walletWrites = await prepareWalletReversal(tx, database, entries);
      walletWrites.forEach(({ ref, walletAmount }) => {
        tx.update(ref, { walletAmount, updatedAt: serverTimestamp() });
      });
      tx.update(bookingRef, {
        cancellations: deleteField(),
        refundDetails: deleteField(),
        updatedAt: serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] clearBookingCancellations (${bookingId}):`, error);
    return { success: false, error: error.message || "Failed to clear cancellations" };
  }
}

export async function getAllBookingsAsJsonString(): Promise<string> {
  try {
    const currentBookings = await getBookings();
    const simplifiedBookings = currentBookings.map(b => ({
      source: b.source,
      destination: b.destination,
      journeyDate: b.journeyDate,
      classType: b.classType,
      bookingType: b.bookingType,
      passengers: b.passengers.map(p => `${p.name} ${p.age} ${p.gender}`).join(', '),
      trainPreference: b.trainPreference,
      remarks: b.remarks,
      status: b.status,
    }));
    return JSON.stringify(simplifiedBookings);
  } catch (error) {
    console.error("[Error] getAllBookingsAsJsonString:", error);
    return JSON.stringify([]);
  }
}

// ============= BOOKING RECORD OPERATIONS =============

export async function getBookingRecordByBookingId(bookingId: string): Promise<any | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");
    
    // First, check for direct bookingId match (individual bookings)
    const directQuery = query(recordsCollection, where("bookingId", "==", bookingId));
    const directSnapshot = await getDocs(directQuery);

    if (!directSnapshot.empty) {
      const docSnap = directSnapshot.docs[0];
      const data = docSnap.data();
      
      return {
        id: docSnap.id,
        bookingId: data.bookingId,
        bookingIds: data.bookingIds,
        groupId: data.groupId,
        bookedBy: data.bookedBy,
        bookedAccountUsername: data.bookedAccountUsername,
        amountCharged: data.amountCharged,
        bookedAmount: data.bookedAmount,
        commission: data.commission,
        commissionRate: data.commissionRate,
        passengerCount: data.passengerCount,
        bookingTransactionId: data.bookingTransactionId,
        bookingDate: data.bookingDate,
        methodUsed: data.methodUsed,
        trainName: data.trainName as string | undefined,
        createdAt: toISOStringSafe(data.createdAt, "createdAt", docSnap.id),
        updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", docSnap.id),
      };
    }

    // If not found, check if bookingId exists in any record's bookingIds array (group bookings)
    const allRecordsQuery = query(recordsCollection, where("bookingIds", "array-contains", bookingId));
    const groupSnapshot = await getDocs(allRecordsQuery);

    if (!groupSnapshot.empty) {
      const docSnap = groupSnapshot.docs[0];
      const data = docSnap.data();

      return {
        id: docSnap.id,
        bookingId: data.bookingId,
        bookingIds: data.bookingIds,
        groupId: data.groupId,
        bookedBy: data.bookedBy,
        bookedAccountUsername: data.bookedAccountUsername,
        amountCharged: data.amountCharged,
        bookedAmount: data.bookedAmount,
        commission: data.commission,
        commissionRate: data.commissionRate,
        passengerCount: data.passengerCount,
        bookingTransactionId: data.bookingTransactionId,
        bookingDate: data.bookingDate,
        methodUsed: data.methodUsed,
        trainName: data.trainName as string | undefined,
        createdAt: toISOStringSafe(data.createdAt, "createdAt", docSnap.id),
        updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", docSnap.id),
      };
    }

    return null;
  } catch (error) {
    console.error(`[Firestore Error] getBookingRecordByBookingId (${bookingId}):`, error);
    return null;
  }
}

/**
 * Compute the account update payload needed to revert a previous booking
 * record's effects on its account:
 *  - refund the wallet if the previous method was Wallet
 *  - restore lastBookedDate from previousLastBookedDate (or clear it)
 *
 * This only computes the payload; it does not write. Callers compose the
 * returned update into a `writeBatch` so the revert lands atomically with the
 * new-record and new-account writes (see `saveBookingRecord`).
 *
 * Returns `null` when the account is missing, or when there's nothing
 * meaningful to write (only `updatedAt` would change).
 */
async function computeAccountRevertUpdate(
  accountDoc: import("firebase/firestore").QueryDocumentSnapshot<DocumentData> | null,
  previousRecord: any
): Promise<Record<string, any> | null> {
  if (!accountDoc || !previousRecord) return null;

  const accountData = accountDoc.data();
  const updateData: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (previousRecord.methodUsed === "Wallet") {
    const refundAmount = typeof previousRecord.bookedAmount === "number" ? previousRecord.bookedAmount : (previousRecord.amountCharged || 0);
    if (refundAmount > 0) {
      const currentWalletAmount = accountData.walletAmount || 0;
      updateData.walletAmount = currentWalletAmount + refundAmount;
    }
  }

  const currentLastBookedDate = accountData.lastBookedDate || "";
  const recordMarker = previousRecord.bookingTransactionId || "";

  // Revert lastBookedDate only if this record was the one that last set it.
  //
  // Primary path (new data): compare `lastBookedRecordId` (on account) against
  // `bookingTransactionId` (on record). This is a best-effort heuristic —
  // bookingDate is not unique across records, and bookingTransactionId is
  // generated client-side via Date.now()+Math.random() (not a UUID). It is
  // sufficient for the single-account sequential case the revert targets.
  //
  // Fallback path (legacy data): when `lastBookedRecordId` is absent, fall
  // back to comparing `account.lastBookedDate === record.bookingDate`. This
  // catches older records that were created before the marker field existed.
  // This fallback is best-effort: nothing guarantees a date is unique across
  // records, so if multiple legacy records share the same `bookingDate` a
  // date-only match could revert the wrong record's effects. The marker field
  // was introduced precisely to disambiguate that case for newer records.
  const lastBookedRecordId = accountData.lastBookedRecordId || "";
  const markerMatches =
    lastBookedRecordId
      ? lastBookedRecordId === recordMarker
      : currentLastBookedDate && currentLastBookedDate === previousRecord.bookingDate;

  if (markerMatches) {
    if (accountData.previousLastBookedDate) {
      updateData.lastBookedDate = accountData.previousLastBookedDate;
      updateData.previousLastBookedDate = deleteField();
    } else {
      updateData.lastBookedDate = deleteField();
    }
    // Clear the marker so subsequent reverts don't accidentally match.
    updateData.lastBookedRecordId = deleteField();
  }

  // Skip the write if nothing meaningful changed (only updatedAt would be written).
  const fieldCount = Object.keys(updateData).length;
  return fieldCount > 1 ? updateData : null;
}

export async function saveBookingRecord(data: {
  bookingId: string;
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: number;
  bookedAmount?: number;
  commission?: number;
  commissionRate?: number;
  passengerCount?: number;
  methodUsed: string;
  trainName?: string;
}): Promise<{ success: boolean; error?: string; record?: any; errors?: any }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");
    
    // Check if a record already exists for this booking
    const q = query(recordsCollection, where("bookingId", "==", data.bookingId));
    const querySnapshot = await getDocs(q);

    const isUpdate = !querySnapshot.empty;
    let previousRecord = null;
    
    if (isUpdate) {
      const existingDoc = querySnapshot.docs[0];
      previousRecord = existingDoc.data();
    }

    // Detect a cross-account edit: the user changed which account this booking
    // is attributed to. The old account's wallet/lastBookedDate must be
    // reverted. The revert is composed into the same writeBatch as the
    // new-record and new-account writes (see below) so all three land
    // atomically — a partial failure can never leave the old account refunded
    // while the booking record still points to it.
    const accountChanged =
      isUpdate &&
      !!previousRecord &&
      previousRecord.bookedAccountUsername !== data.bookedAccountUsername;

    // Capture revert context for the old account; consumed when building the batch.
    const revertContext = accountChanged
      ? { username: previousRecord!.bookedAccountUsername, record: previousRecord! }
      : null;

    // When the account changes, the new account should be treated as if this
    // booking were brand new — no "refund the previous amount" logic against
    // it, since it was never charged in the first place.
    const treatAsNew = !isUpdate || accountChanged;

    // Find the account by username
    const accountsCollection = collection(db, "irctcAccounts");
    const accountQuery = query(accountsCollection, where("username", "==", data.bookedAccountUsername));
    const accountSnapshot = await getDocs(accountQuery);

    if (accountSnapshot.empty) {
      return { success: false, error: `Account with username "${data.bookedAccountUsername}" not found` };
    }

    const accountDoc = accountSnapshot.docs[0];
    const accountData = accountDoc.data();
    const currentWalletAmount = accountData.walletAmount || 0;

    // Fetch the booking to get its 'Book by' date (bookingDate), not today's date
    const bookingForDate = await getBookingById(data.bookingId);
    const bookingDate = bookingForDate?.bookingDate || new Date().toISOString().split('T')[0];

    // Generate or preserve transaction ID for consistent booking tracking.
    const bookingTransactionId = isUpdate && previousRecord?.bookingTransactionId
      ? previousRecord.bookingTransactionId
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Compute account updates (wallet + date) but don't apply them yet. They
    // are committed in the same `writeBatch` as the record write (see below),
    // so the record and account changes land atomically together — either all
    // writes succeed or none do, leaving the account untouched on failure.
    const accountUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    const effectiveBookedAmount = typeof data.bookedAmount === "number" ? data.bookedAmount : data.amountCharged;
    const prevEffectiveBookedAmount = previousRecord
      ? (typeof previousRecord.bookedAmount === "number" ? previousRecord.bookedAmount : (previousRecord.amountCharged || 0))
      : 0;

    // Wallet deduction / refund logic - wallet only covers the actual ticket fare (bookedAmount)
    if (data.methodUsed === "Wallet") {
      if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
        const refundAmount = prevEffectiveBookedAmount;
        const newWalletAfterRefund = currentWalletAmount + refundAmount;
        if (newWalletAfterRefund < effectiveBookedAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${newWalletAfterRefund.toFixed(2)}, Required: ₹${effectiveBookedAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = newWalletAfterRefund - effectiveBookedAmount;
      } else {
        if (currentWalletAmount < effectiveBookedAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${currentWalletAmount.toFixed(2)}, Required: ₹${effectiveBookedAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = currentWalletAmount - effectiveBookedAmount;
      }
    } else if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
      const refundAmount = prevEffectiveBookedAmount;
      accountUpdateData.walletAmount = currentWalletAmount + refundAmount;
    }

    // lastBookedDate update — only when the date actually changes. Writing it
    // when it's already equal to bookingDate would stamp updatedAt for no
    // reason. When the date changes we also persist `previousLastBookedDate`
    // and the `lastBookedRecordId` marker, so we never overwrite the "previous"
    // slot with the current date and never rebind the marker to a record that
    // didn't actually move the account's most-recent-booking pointer.
    const currentLastBookedDate = accountData.lastBookedDate || "";
    if (currentLastBookedDate !== bookingDate) {
      accountUpdateData.lastBookedDate = bookingDate;
      accountUpdateData.previousLastBookedDate = currentLastBookedDate || deleteField();
      // Marker so revert paths can identify which record last set lastBookedDate.
      // This is a best-effort heuristic — bookingDate is not unique across
      // records, and bookingTransactionId is generated client-side via
      // Date.now()+Math.random() (not a UUID). It is sufficient for the
      // single-account sequential case the revert logic targets.
      accountUpdateData.lastBookedRecordId = bookingTransactionId;
    }

    const recordData: Record<string, any> = {
      bookingId: data.bookingId,
      bookedBy: data.bookedBy,
      bookedAccountUsername: data.bookedAccountUsername,
      amountCharged: data.amountCharged,
      methodUsed: data.methodUsed,
      bookingDate,   // Store the booking's 'Book by' date for stats queries
      updatedAt: serverTimestamp(),
    };

    if (typeof data.bookedAmount === "number") {
      recordData.bookedAmount = data.bookedAmount;
    }
    if (typeof data.commission === "number") {
      recordData.commission = data.commission;
    }
    if (typeof data.commissionRate === "number") {
      recordData.commissionRate = data.commissionRate;
    }
    if (typeof data.passengerCount === "number") {
      recordData.passengerCount = data.passengerCount;
    }

    recordData.bookingTransactionId = bookingTransactionId;

    // Only set trainName when provided; never use deleteField() until we know it's an update
    if (data.trainName && data.trainName.trim() !== "") {
      recordData.trainName = data.trainName.trim();
    }

    let docId: string;
    let newRecordRef: ReturnType<typeof doc>;

    if (isUpdate) {
      // Update existing record
      const existingDoc = querySnapshot.docs[0];
      docId = existingDoc.id;
      newRecordRef = doc(db, "bookingRecords", docId);

      // For updates, use deleteField() to remove trainName if it was cleared
      if (!data.trainName || data.trainName.trim() === "") {
        recordData.trainName = deleteField();
      }
    } else {
      // Generate a new doc id upfront so the record write can be composed
      // into a writeBatch (which can't auto-generate ids).
      newRecordRef = doc(recordsCollection);
      docId = newRecordRef.id;
      recordData.createdAt = serverTimestamp();
    }

    // Look up the old account (when this is a cross-account edit) so we can
    // compose its revert into the same writeBatch as the new-record and
    // new-account writes. This makes the three writes atomic: either all of
    // them land, or none do, so the record can never end up attributed to the
    // new account while the old account still reflects the previous charge.
    //
    // Note: this is `writeBatch`, not `runTransaction` — the reads above are
    // best-effort. A concurrent edit to the old account between this read and
    // the commit could still produce a stale revert. Acceptable for the
    // single-user booking flow, which doesn't have concurrent writers.
    let oldAccountDoc: import("firebase/firestore").QueryDocumentSnapshot<DocumentData> | null = null;
    if (revertContext) {
      const oldAccountQuery = query(
        collection(db, "irctcAccounts"),
        where("username", "==", revertContext.username)
      );
      const oldAccountSnapshot = await getDocs(oldAccountQuery);
      if (!oldAccountSnapshot.empty) {
        oldAccountDoc = oldAccountSnapshot.docs[0];
      } else {
        console.warn(`[saveBookingRecord] Old account "${revertContext.username}" not found; revert will be skipped`);
      }
    }

    const oldAccountRevert = oldAccountDoc
      ? await computeAccountRevertUpdate(oldAccountDoc, revertContext!.record)
      : null;

    // Compose all writes into a single batch and commit atomically.
    const batch = writeBatch(db);

    if (isUpdate) {
      batch.update(newRecordRef, recordData);
    } else {
      batch.set(newRecordRef, recordData);
    }

    // Only touch the new-account document when there is something meaningful
    // to change (wallet or date), so we don't stamp updatedAt unnecessarily.
    const accountFieldCount = Object.keys(accountUpdateData).length;
    if (accountFieldCount > 1) {
      batch.update(doc(db, "irctcAccounts", accountDoc.id), accountUpdateData);
    }

    if (oldAccountRevert) {
      batch.update(doc(db, "irctcAccounts", oldAccountDoc!.id), oldAccountRevert);
    }

    await batch.commit();

    // Retrieve the saved record (post-commit, for the response payload).
    const savedDoc = await getDoc(newRecordRef);
    if (!savedDoc.exists()) {
      return { success: false, error: "Failed to retrieve saved record" };
    }

    const savedData = savedDoc.data();

    const record = {
      id: savedDoc.id,
      bookingId: savedData.bookingId,
      bookedBy: savedData.bookedBy,
      bookedAccountUsername: savedData.bookedAccountUsername,
      amountCharged: savedData.amountCharged,
      bookedAmount: savedData.bookedAmount,
      commission: savedData.commission,
      commissionRate: savedData.commissionRate,
      passengerCount: savedData.passengerCount,
      methodUsed: savedData.methodUsed,
      bookingTransactionId: savedData.bookingTransactionId,
      trainName: savedData.trainName as string | undefined,
      createdAt: toISOStringSafe(savedData.createdAt, "createdAt", savedDoc.id),
      updatedAt: toISOStringSafe(savedData.updatedAt, "updatedAt", savedDoc.id),
    };

    return { success: true, record };
  } catch (error: any) {
    console.error("[Firestore Error] saveBookingRecord:", error);
    return { success: false, error: error.message || "Failed to save booking record" };
  }
}

/**
 * Save a single booking record for a group of bookings
 * This creates ONE record for the entire group, so account count increments by +1
 */
export async function saveGroupBookingRecords(data: {
  bookingIds: string[];
  groupId: string;
  bookedBy: string;
  bookedAccountUsername: string;
  totalAmount: number;
  bookedAmount?: number;
  commission?: number;
  commissionRate?: number;
  passengerCount?: number;
  methodUsed: string;
  trainName?: string;
}): Promise<{ success: boolean; error?: string; record?: any }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");

    // Clear any stray individual records belonging to member bookings. A booking
    // can pick up its own record before it was grouped (or via the individual
    // booking card inside a group), and that record would otherwise survive
    // alongside the group record written below — double counting the amount in
    // handler payment totals and inflating account/handler booking counts.
    //
    // These go through deleteBookingRecord() so each one's wallet refund and
    // lastBookedDate revert are applied, and they run *before* the account is
    // read below so the group charge sees the refunded balance. Sequential, not
    // parallel: deleteBookingRecord does a read-modify-write on the account, so
    // concurrent deletes against the same account would lose refunds.
    const strayRecordLookups = await Promise.all(
      data.bookingIds.map(async (memberBookingId) => {
        const memberQuery = query(recordsCollection, where("bookingId", "==", memberBookingId));
        const memberSnapshot = await getDocs(memberQuery);
        // Records carrying a groupId are group records, not strays.
        return memberSnapshot.docs.filter(memberDoc => !memberDoc.data().groupId);
      })
    );

    for (const strayDoc of strayRecordLookups.flat()) {
      const strayResult = await deleteBookingRecord(strayDoc.id);
      if (!strayResult.success) {
        return {
          success: false,
          error: `Failed to clear an existing individual booked-details record: ${strayResult.error}`,
        };
      }
    }

    // Check if a record already exists for this group
    const groupQuery = query(recordsCollection, where("groupId", "==", data.groupId));
    const groupSnapshot = await getDocs(groupQuery);
    
    const isUpdate = !groupSnapshot.empty;
    let previousRecord = null;
    
    if (isUpdate) {
      const existingDoc = groupSnapshot.docs[0];
      previousRecord = existingDoc.data();
    }

    // Detect cross-account edit: the record now points to a different account.
    // The old account's revert is composed into the same writeBatch as the
    // new-record and new-account writes (see below) so all three land
    // atomically — a partial failure can never leave the old account refunded
    // while the booking record still points to it.
    const accountChanged =
      isUpdate &&
      !!previousRecord &&
      previousRecord.bookedAccountUsername !== data.bookedAccountUsername;

    // Capture revert context for the old account; consumed when building the batch.
    const revertContext = accountChanged
      ? { username: previousRecord!.bookedAccountUsername, record: previousRecord! }
      : null;

    const treatAsNew = !isUpdate || accountChanged;

    // Find the account by username
    const accountsCollection = collection(db, "irctcAccounts");
    const accountQuery = query(accountsCollection, where("username", "==", data.bookedAccountUsername));
    const accountSnapshot = await getDocs(accountQuery);

    if (accountSnapshot.empty) {
      return { success: false, error: `Account with username "${data.bookedAccountUsername}" not found` };
    }

    const accountDoc = accountSnapshot.docs[0];
    const accountData = accountDoc.data();
    const currentWalletAmount = accountData.walletAmount || 0;

    // Fetch a booking to get its 'Book by' date (bookingDate), not today's date
    const bookingForDate = data.bookingIds.length > 0 ? await getBookingById(data.bookingIds[0]) : null;
    const bookingDate = bookingForDate?.bookingDate || new Date().toISOString().split('T')[0];

    // Generate or preserve transaction ID for consistent booking tracking.
    const bookingTransactionId = isUpdate && previousRecord?.bookingTransactionId
      ? previousRecord.bookingTransactionId
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Compute account updates (wallet + date) but don't apply them yet. They
    // are committed in the same `writeBatch` as the record write (see below),
    // so the record and account changes land atomically together — either all
    // writes succeed or none do, leaving the account untouched on failure.
    const accountUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    const effectiveBookedAmount = typeof data.bookedAmount === "number" ? data.bookedAmount : data.totalAmount;
    const prevEffectiveBookedAmount = previousRecord
      ? (typeof previousRecord.bookedAmount === "number" ? previousRecord.bookedAmount : (previousRecord.amountCharged || 0))
      : 0;

    // Wallet deduction / refund logic - wallet only covers the actual ticket fare (bookedAmount)
    if (data.methodUsed === "Wallet") {
      if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
        const refundAmount = prevEffectiveBookedAmount;
        const newWalletAfterRefund = currentWalletAmount + refundAmount;
        if (newWalletAfterRefund < effectiveBookedAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${newWalletAfterRefund.toFixed(2)}, Required: ₹${effectiveBookedAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = newWalletAfterRefund - effectiveBookedAmount;
      } else {
        if (currentWalletAmount < effectiveBookedAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${currentWalletAmount.toFixed(2)}, Required: ₹${effectiveBookedAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = currentWalletAmount - effectiveBookedAmount;
      }
    } else if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
      const refundAmount = prevEffectiveBookedAmount;
      accountUpdateData.walletAmount = currentWalletAmount + refundAmount;
    }

    // lastBookedDate update — only when the date actually changes. Writing it
    // when it's already equal to bookingDate would stamp updatedAt for no
    // reason. When the date changes we also persist `previousLastBookedDate`
    // and the `lastBookedRecordId` marker, so we never overwrite the "previous"
    // slot with the current date and never rebind the marker to a record that
    // didn't actually move the account's most-recent-booking pointer.
    const currentLastBookedDate = accountData.lastBookedDate || "";
    if (currentLastBookedDate !== bookingDate) {
      accountUpdateData.lastBookedDate = bookingDate;
      accountUpdateData.previousLastBookedDate = currentLastBookedDate || deleteField();
      // Marker so revert paths can identify which record last set lastBookedDate.
      // This is a best-effort heuristic — bookingDate is not unique across
      // records, and bookingTransactionId is generated client-side via
      // Date.now()+Math.random() (not a UUID). It is sufficient for the
      // single-account sequential case the revert logic targets.
      accountUpdateData.lastBookedRecordId = bookingTransactionId;
    }

    // Create single record for the entire group
    const recordData: Record<string, any> = {
      bookingId: data.bookingIds[0], // Primary booking ID (first one)
      bookingIds: data.bookingIds,   // All booking IDs in the group
      groupId: data.groupId,         // Reference to the group
      bookedBy: data.bookedBy,
      bookedAccountUsername: data.bookedAccountUsername,
      amountCharged: data.totalAmount, // Total amount for entire group (bookedAmount + commission)
      methodUsed: data.methodUsed,
      bookingTransactionId,          // Track this booking transaction
      bookingDate,                   // Store the booking's 'Book by' date for stats queries
      updatedAt: serverTimestamp(),
    };

    if (typeof data.bookedAmount === "number") {
      recordData.bookedAmount = data.bookedAmount;
    }
    if (typeof data.commission === "number") {
      recordData.commission = data.commission;
    }
    if (typeof data.commissionRate === "number") {
      recordData.commissionRate = data.commissionRate;
    }
    if (typeof data.passengerCount === "number") {
      recordData.passengerCount = data.passengerCount;
    }

    if (data.trainName && data.trainName.trim() !== "") {
      recordData.trainName = data.trainName.trim();
    }

    let docId: string;
    let newRecordRef: ReturnType<typeof doc>;

    if (isUpdate) {
      const existingDoc = groupSnapshot.docs[0];
      docId = existingDoc.id;
      newRecordRef = doc(db, "bookingRecords", docId);

      // For updates, use deleteField() to remove trainName if it was cleared
      if (!data.trainName || data.trainName.trim() === "") {
        recordData.trainName = deleteField();
      }
    } else {
      // Generate a new doc id upfront so the record write can be composed
      // into a writeBatch (which can't auto-generate ids).
      newRecordRef = doc(recordsCollection);
      docId = newRecordRef.id;
      recordData.createdAt = serverTimestamp();
    }

    // Look up the old account (when this is a cross-account edit) so we can
    // compose its revert into the same writeBatch as the new-record and
    // new-account writes — atomic: all three land or none do. The read here
    // is best-effort; concurrent writes between this read and the commit
    // are not protected (would require runTransaction).
    let oldAccountDoc: import("firebase/firestore").QueryDocumentSnapshot<DocumentData> | null = null;
    if (revertContext) {
      const oldAccountQuery = query(
        collection(db, "irctcAccounts"),
        where("username", "==", revertContext.username)
      );
      const oldAccountSnapshot = await getDocs(oldAccountQuery);
      if (!oldAccountSnapshot.empty) {
        oldAccountDoc = oldAccountSnapshot.docs[0];
      } else {
        console.warn(`[saveGroupBookingRecords] Old account "${revertContext.username}" not found; revert will be skipped`);
      }
    }

    const oldAccountRevert = oldAccountDoc
      ? await computeAccountRevertUpdate(oldAccountDoc, revertContext!.record)
      : null;

    // Compose all writes into a single batch and commit atomically.
    const batch = writeBatch(db);

    if (isUpdate) {
      batch.update(newRecordRef, recordData);
    } else {
      batch.set(newRecordRef, recordData);
    }

    // Only touch the new-account document when there is something meaningful
    // to change (wallet or date), so we don't stamp updatedAt unnecessarily.
    const accountFieldCount = Object.keys(accountUpdateData).length;
    if (accountFieldCount > 1) {
      batch.update(doc(db, "irctcAccounts", accountDoc.id), accountUpdateData);
    }

    if (oldAccountRevert) {
      batch.update(doc(db, "irctcAccounts", oldAccountDoc!.id), oldAccountRevert);
    }

    await batch.commit();

    // Retrieve the saved record (post-commit, for the response payload).
    const savedDoc = await getDoc(newRecordRef);
    if (!savedDoc.exists()) {
      return { success: false, error: "Failed to retrieve saved record" };
    }

    const savedData = savedDoc.data();

    const record = {
      id: savedDoc.id,
      bookingId: savedData.bookingId,
      bookingIds: savedData.bookingIds,
      groupId: savedData.groupId,
      bookedBy: savedData.bookedBy,
      bookedAccountUsername: savedData.bookedAccountUsername,
      amountCharged: savedData.amountCharged,
      bookedAmount: savedData.bookedAmount,
      commission: savedData.commission,
      commissionRate: savedData.commissionRate,
      passengerCount: savedData.passengerCount,
      methodUsed: savedData.methodUsed,
      bookingTransactionId: savedData.bookingTransactionId,
      trainName: savedData.trainName as string | undefined,
      createdAt: toISOStringSafe(savedData.createdAt, "createdAt", savedDoc.id),
      updatedAt: toISOStringSafe(savedData.updatedAt, "updatedAt", savedDoc.id),
    };

    return { success: true, record };
  } catch (error: any) {
    console.error("[Firestore Error] saveGroupBookingRecords:", error);
    return { success: false, error: error.message || "Failed to save group booking records" };
  }
}

export async function deleteBookingRecord(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookingRecords", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return { success: false, error: "Booking record not found" };
    }

    const recordData = docSnap.data();
    const { bookedAccountUsername, amountCharged, methodUsed } = recordData;

    // Look up the account that was charged. We always need it to revert the
    // lastBookedDate / lastBookedRecordId bookkeeping (regardless of payment
    // method). The wallet refund is only applied for Wallet records.
    if (bookedAccountUsername) {
      const accountsCollection = collection(db, "irctcAccounts");
      const accountQuery = query(accountsCollection, where("username", "==", bookedAccountUsername));
      const accountSnapshot = await getDocs(accountQuery);

      if (!accountSnapshot.empty) {
        const accountDoc = accountSnapshot.docs[0];
        const accountData = accountDoc.data();

        const updateData: any = {
          updatedAt: serverTimestamp(),
        };

        // Wallet refund — only for records that were actually paid from the wallet.
        if (methodUsed === "Wallet") {
          const refundAmount = typeof recordData.bookedAmount === "number" ? recordData.bookedAmount : (amountCharged || 0);
          if (refundAmount > 0) {
            const currentWalletAmount = accountData.walletAmount || 0;
            updateData.walletAmount = currentWalletAmount + refundAmount;
          }
        }

        // Revert lastBookedDate / lastBookedRecordId — these are tracked for
        // every record (not just Wallet), so they must be reverted for any
        // payment method. Only run when this record was the one that last set
        // them.
        const currentLastBookedDate = accountData.lastBookedDate || "";
        const recordMarker = recordData.bookingTransactionId || "";

        // Primary: compare `lastBookedRecordId` (account) vs `bookingTransactionId` (record).
        // Fallback: when `lastBookedRecordId` is absent (legacy accounts), use
        // `bookingDate` comparison. We do not require `recordMarker` here, because
        // legacy accounts without the marker often pair with records that also
        // lack `bookingTransactionId` — gating the fallback on it would defeat
        // the very purpose of the fallback path.
        const lastBookedRecordId = accountData.lastBookedRecordId || "";
        const markerMatches =
          lastBookedRecordId
            ? lastBookedRecordId === recordMarker
            : currentLastBookedDate && currentLastBookedDate === recordData.bookingDate;

        if (markerMatches) {
          if (accountData.previousLastBookedDate) {
            updateData.lastBookedDate = accountData.previousLastBookedDate;
            updateData.previousLastBookedDate = deleteField();
          } else {
            updateData.lastBookedDate = deleteField();
          }
          // Clear the marker so subsequent reverts don't accidentally match.
          updateData.lastBookedRecordId = deleteField();
        }

        // Skip the write if nothing meaningful changed (only updatedAt would be written).
        const fieldCount = Object.keys(updateData).length;
        if (fieldCount > 1) {
          await updateDoc(doc(db, "irctcAccounts", accountDoc.id), updateData);
        }
      }
    }

    // Delete the booking record
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBookingRecord (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete booking record" };
  }
}

// ============= BOOKING GROUP OPERATIONS =============

const mapDocToBookingGroup = (document: DocumentSnapshot<DocumentData>, id: string): BookingGroup => {
  const data = document.data();
  if (!data) {
    throw new Error(`No data found for document with id ${id}`);
  }

  return {
    id,
    name: data.name || "Untitled Group",
    bookingIds: Array.isArray(data.bookingIds) ? data.bookingIds : [],
    totalAmount: data.totalAmount || 0,
    status: data.status || "Mixed",
    createdAt: toISOStringSafe(data.createdAt, "createdAt", id),
    updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", id),
  };
};

export async function createBookingGroup(bookingIds: string[], name?: string): Promise<{ success: boolean; error?: string; group?: BookingGroup }> {
  if (!db) return { success: false, error: "Database not initialized" };
  const firestore = db;

  try {
    // 1. Create the group
    const groupData = {
      name: name || `Group Booking ${new Date().toLocaleDateString()}`,
      bookingIds,
      status: "Mixed",
      totalAmount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const groupRef = await addDoc(collection(firestore, "bookingGroups"), groupData);

    // 2. Update each booking with the groupId
    const batchPromises = bookingIds.map(bookingId => 
      updateDoc(doc(firestore, "bookings", bookingId), { 
        groupId: groupRef.id,
        updatedAt: serverTimestamp() 
      })
    );

    await Promise.all(batchPromises);

    const newGroup = await getBookingGroupById(groupRef.id);
    return { success: true, group: newGroup || undefined };

  } catch (error: any) {
    console.error("[Firestore Error] createBookingGroup:", error);
    return { success: false, error: error.message };
  }
}

export async function getBookingGroups(): Promise<BookingGroup[]> {
  if (!db) return [];
  try {
    const q = query(collection(db, "bookingGroups"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => mapDocToBookingGroup(doc, doc.id));
  } catch (error) {
    console.error("[Firestore Error] getBookingGroups:", error);
    return [];
  }
}

export async function getBookingGroupById(id: string): Promise<BookingGroup | null> {
  if (!db) return null;
  try {
    const docSnap = await getDoc(doc(db, "bookingGroups", id));
    if (docSnap.exists()) {
      return mapDocToBookingGroup(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] getBookingGroupById (${id}):`, error);
    return null;
  }
}

export async function ungroupBookings(groupId: string, bookings?: any[]): Promise<{ success: boolean; error?: string }> {
   if (!db) return { success: false, error: "Database not initialized" };
   const firestore = db;
   try {
     const group = await getBookingGroupById(groupId);
     if (!group) return { success: false, error: "Group not found" };

     // Fetch bookings data if not provided (need passenger counts for amount split)
     let bookingsData = bookings || [];
     if (bookingsData.length === 0) {
       const bookingPromises = group.bookingIds.map(bid => getBookingById(bid));
       bookingsData = await Promise.all(bookingPromises);
     }

     // Fetch the group booking record to get the total amount
     const recordsCollection = collection(firestore, "bookingRecords");
     const groupRecordQuery = query(recordsCollection, where("groupId", "==", groupId));
     const groupRecordSnapshot = await getDocs(groupRecordQuery);

     // If there's a group booking record, we need to split it into individual records
     if (!groupRecordSnapshot.empty) {
       const groupRecordDoc = groupRecordSnapshot.docs[0];
       const groupRecordData = groupRecordDoc.data();
       const totalAmount = groupRecordData.amountCharged || 0;
       const totalBookedAmount = groupRecordData.bookedAmount;
       const totalCommission = groupRecordData.commission;
       const methodUsed = groupRecordData.methodUsed;
       const bookedBy = groupRecordData.bookedBy;
       const bookedAccountUsername = groupRecordData.bookedAccountUsername;
       const trainName = groupRecordData.trainName;
       const bookingTransactionId = groupRecordData.bookingTransactionId; // Preserve transaction ID
       const groupRecordCreatedAt = groupRecordData.createdAt;
       const bookingDate = groupRecordData.bookingDate;

       // Calculate total passengers across all bookings
       const totalPassengers = bookingsData.reduce((sum, booking: any) => 
         sum + (booking.passengers?.length || 0), 0
       );

       // Calculate amount per passenger
       const amountPerPassenger = totalPassengers > 0 ? totalAmount / totalPassengers : 0;
       const bookedAmountPerPassenger = typeof totalBookedAmount === "number" && totalPassengers > 0 ? totalBookedAmount / totalPassengers : undefined;
       const commissionPerPassenger = typeof totalCommission === "number" && totalPassengers > 0 ? totalCommission / totalPassengers : undefined;

       // Create individual booking records for each booking with proportional amount
       const individualRecordPromises = bookingsData.map(async (booking: any) => {
         const passengerCount = booking.passengers?.length || 0;
         const proportionalAmount = Number((amountPerPassenger * passengerCount).toFixed(2));

         const baseRecordData = {
           bookingId: booking.id,
           bookedBy,
           bookedAccountUsername,
           amountCharged: proportionalAmount,
           methodUsed,
           bookingTransactionId,
           passengerCount,
           updatedAt: serverTimestamp(),
         } as Record<string, any>;

          if (bookedAmountPerPassenger !== undefined) {
            baseRecordData.bookedAmount = Number((bookedAmountPerPassenger * passengerCount).toFixed(2));
          }
          if (commissionPerPassenger !== undefined) {
            baseRecordData.commission = Number((commissionPerPassenger * passengerCount).toFixed(2));
          }

          if (trainName) {
            baseRecordData.trainName = trainName;
          }

          if (bookingDate) {
            baseRecordData.bookingDate = bookingDate;
          }

         // Check if individual record already exists for this booking (without groupId)
         const allRecordsQuery = query(
           recordsCollection,
           where("bookingId", "==", booking.id)
         );
         const allRecordsSnapshot = await getDocs(allRecordsQuery);
         
         // Filter out any records that still have groupId (shouldn't happen but be safe)
         let existingDoc = null;
         if (!allRecordsSnapshot.empty) {
           existingDoc = allRecordsSnapshot.docs.find(docSnap => 
             !docSnap.data().groupId || docSnap.data().groupId === null
           );
         }
         
         if (!existingDoc) {
           await addDoc(recordsCollection, {
             ...baseRecordData,
            createdAt: groupRecordCreatedAt || serverTimestamp(),
           });
         } else {
           const updateData: Record<string, any> = {
             ...baseRecordData,
             groupId: deleteField(),
             bookingIds: deleteField(),
           };

           if (!trainName) {
             updateData.trainName = deleteField();
           }

           await updateDoc(doc(firestore, "bookingRecords", existingDoc.id), updateData);
         }
       });

       // Wait for all individual records to be created/updated
       await Promise.all(individualRecordPromises);

       // Delete the group booking record
       await deleteDoc(doc(firestore, "bookingRecords", groupRecordDoc.id));
     } else {
       // No group record exists. This happens when booked details were saved
       // against a single individual booking (e.g. booked via the booking card
       // inside a group, or booked before the bookings were grouped). In that
       // case only one booking ends up with booked details. Share those details
       // across ALL bookings in the group, splitting the total amount
       // proportionally by passenger count.
       const recordLookups = await Promise.all(
         bookingsData.map(async (booking: any) => {
           const recQuery = query(recordsCollection, where("bookingId", "==", booking.id));
           const recSnapshot = await getDocs(recQuery);
           const recDoc = recSnapshot.docs.find(d => !d.data().groupId);
           return recDoc ? { bookingId: booking.id, record: recDoc } : null;
         })
       );

       const existingRecords = recordLookups.filter(Boolean) as { bookingId: string; record: any }[];

       if (existingRecords.length > 0) {
         const sourceRecord = existingRecords[0].record.data();
         const totalAmount = existingRecords.reduce((sum, x) => sum + (x.record.data().amountCharged || 0), 0);

         // Calculate total passengers across all bookings
         const totalPassengers = bookingsData.reduce((sum, booking: any) =>
           sum + (booking.passengers?.length || 0), 0
         );

         if (totalAmount > 0 && totalPassengers > 0) {
           const amountPerPassenger = totalAmount / totalPassengers;
           const bookedAmountPerPassenger = typeof sourceRecord.bookedAmount === "number" && totalPassengers > 0 ? sourceRecord.bookedAmount / totalPassengers : undefined;
           const commissionPerPassenger = typeof sourceRecord.commission === "number" && totalPassengers > 0 ? sourceRecord.commission / totalPassengers : undefined;

           const sharePromises = bookingsData.map(async (booking: any) => {
             const passengerCount = booking.passengers?.length || 0;
             const proportionalAmount = Number((amountPerPassenger * passengerCount).toFixed(2));

             const sharedRecordData: Record<string, any> = {
               bookingId: booking.id,
               amountCharged: proportionalAmount,
               passengerCount,
               updatedAt: serverTimestamp(),
             };

             if (bookedAmountPerPassenger !== undefined) {
               sharedRecordData.bookedAmount = Number((bookedAmountPerPassenger * passengerCount).toFixed(2));
             }
             if (commissionPerPassenger !== undefined) {
               sharedRecordData.commission = Number((commissionPerPassenger * passengerCount).toFixed(2));
             }

             if (sourceRecord.bookedBy) sharedRecordData.bookedBy = sourceRecord.bookedBy;
             if (sourceRecord.bookedAccountUsername) sharedRecordData.bookedAccountUsername = sourceRecord.bookedAccountUsername;
             if (sourceRecord.methodUsed) sharedRecordData.methodUsed = sourceRecord.methodUsed;
             if (sourceRecord.bookingTransactionId) sharedRecordData.bookingTransactionId = sourceRecord.bookingTransactionId;
             if (sourceRecord.trainName) sharedRecordData.trainName = sourceRecord.trainName;
             if (sourceRecord.bookingDate) sharedRecordData.bookingDate = sourceRecord.bookingDate;

             const existing = existingRecords.find(x => x.bookingId === booking.id);

             if (existing) {
               // Booking already has a record — update it in place
               await updateDoc(doc(firestore, "bookingRecords", existing.record.id), sharedRecordData);
             } else {
               // Preserve the original createdAt so date-bucketed stats stay stable
               await addDoc(recordsCollection, {
                 ...sharedRecordData,
                 createdAt: sourceRecord.createdAt || serverTimestamp(),
               });
             }
           });

           await Promise.all(sharePromises);
         }
       }
     }

     // Find shared preparedAccounts from the first booking in the group that has them
     const sharedPreparedAccounts = bookingsData.find(
       (b: any) => b.preparedAccounts && b.preparedAccounts.length > 0
     )?.preparedAccounts;

     // Remove groupId from all bookings and propagate preparedAccounts to those missing them
     const promises = group.bookingIds.map((bid) => {
       const booking = bookingsData.find((b: any) => b.id === bid);
       const updateData: Record<string, any> = {
         groupId: deleteField(),
         updatedAt: serverTimestamp(),
       };

       // Copy shared preparedAccounts to bookings that don't have them
       if (
         sharedPreparedAccounts &&
         sharedPreparedAccounts.length > 0 &&
         (!booking?.preparedAccounts || booking.preparedAccounts.length === 0)
       ) {
         updateData.preparedAccounts = sharedPreparedAccounts;
       }

       return updateDoc(doc(firestore, "bookings", bid), updateData);
     });
     await Promise.all(promises);

     // Delete the group
     await deleteDoc(doc(firestore, "bookingGroups", groupId));
     
     return { success: true };
   } catch (error: any) {
     console.error("[Firestore Error] ungroupBookings:", error);
     return { success: false, error: error.message };
   }
}

export async function addToBookingGroup(groupId: string, bookingId: string): Promise<{ success: boolean; error?: string }> {
    if (!db) return { success: false, error: "Database not initialized" };
    try {
        const groupRef = doc(db, "bookingGroups", groupId);
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) return { success: false, error: "Group not found" };
        
        const currentIds = groupSnap.data().bookingIds || [];
        if (currentIds.includes(bookingId)) return { success: true };

        await updateDoc(groupRef, {
            bookingIds: [...currentIds, bookingId],
            updatedAt: serverTimestamp()
        });

        await updateDoc(doc(db, "bookings", bookingId), {
            groupId: groupId,
            updatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (error: any) {
        console.error("[Firestore Error] addToBookingGroup:", error);
        return { success: false, error: error.message };
    }
}



