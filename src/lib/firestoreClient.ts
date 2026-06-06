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
  BookingGroup
} from "@/types/booking";
import { LEGACY_CLASS_MAP } from "@/types/booking";

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
    const bookingData: Record<string, any> = {
      ...formData,
      passengers: formData.passengers.map(p => ({ ...p, age: Number(p.age) })),
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
export async function updateBookingRefundDetails(
  id: string,
  refundDetails: RefundDetails
): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    const updateData: Record<string, any> = {
      refundDetails,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return { success: true, booking: mapDocToBooking(updatedDocSnap, updatedDocSnap.id) };
    }
    return { success: false, error: "Failed to retrieve booking after update" };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingRefundDetails (${id}):`, error);
    return { success: false, error: error.message || "Failed to update refund details" };
  }
}

export async function deleteBookingRefundDetails(
  id: string
): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    const updateData: Record<string, any> = {
      refundDetails: deleteField(),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return { success: true, booking: mapDocToBooking(updatedDocSnap, updatedDocSnap.id) };
    }
    return { success: false, error: "Failed to retrieve booking after delete" };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBookingRefundDetails (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete refund details" };
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
 * Revert the effects a previous booking record had on its account:
 *  - refund the wallet if the previous method was Wallet
 *  - restore lastBookedDate from previousLastBookedDate (or clear it)
 *
 * Best-effort for missing accounts: if the account is not found we log and
 * continue, mirroring the tolerance of deleteBookingRecord. Other failures
 * (permission, network, etc.) are rethrown so the caller fails fast instead of
 * silently charging the new account while leaving the old one un-reverted.
 * Used when an edit reassigns a record from one account to another so the
 * prior account is cleaned up before the new account is charged.
 */
async function revertAccountBookingEffects(
  username: string | undefined,
  previousRecord: any
): Promise<void> {
  if (!db || !username || !previousRecord) return;

  try {
    const accountsCollection = collection(db, "irctcAccounts");
    const accountQuery = query(accountsCollection, where("username", "==", username));
    const accountSnapshot = await getDocs(accountQuery);

    if (accountSnapshot.empty) {
      console.warn(`[revertAccountBookingEffects] Account "${username}" not found; skipping revert`);
      return;
    }

    const accountDoc = accountSnapshot.docs[0];
    const accountData = accountDoc.data();
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (previousRecord.methodUsed === "Wallet") {
      const refundAmount = previousRecord.amountCharged || 0;
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
    // `bookingTransactionId` (on record). Both fields are guaranteed unique, so
    // this is unambiguous.
    //
    // Fallback path (legacy data): when `lastBookedRecordId` is absent, fall
    // back to comparing `account.lastBookedDate === record.bookingDate`. This
    // catches older records that were created before the marker field existed.
    // Using `bookingDate` as a fallback is acceptable because legacy accounts
    // without `lastBookedRecordId` can only have one record per date — the marker
    // was introduced precisely to handle the case of multiple records sharing
    // a date, which is a newer problem.
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
    if (fieldCount > 1) {
      await updateDoc(doc(db, "irctcAccounts", accountDoc.id), updateData);
    }
  } catch (error) {
    console.error(`[revertAccountBookingEffects] Failed for "${username}":`, error);
    // Rethrow so callers (e.g., saveBookingRecord on cross-account edits) fail
    // fast instead of silently charging the new account while leaving the
    // old one un-reverted. Missing-account cases are handled above via
    // accountSnapshot.empty and never reach this catch.
    throw error;
  }
}

export async function saveBookingRecord(data: {
  bookingId: string;
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: number;
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
    // is attributed to. We must revert the old account's wallet/lastBookedDate,
    // but only after the new account has been successfully updated — otherwise
    // a partial failure (record write or new-account update fails) would leave
    // the old account refunded while the booking still points to it.
    const accountChanged =
      isUpdate &&
      !!previousRecord &&
      previousRecord.bookedAccountUsername !== data.bookedAccountUsername;

    // Capture revert context; will be called only after new-account update succeeds.
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

    // Compute account updates (wallet + date) but don't apply them yet.
    // We write them only after the record document is successfully saved so
    // that a failed record write leaves the account untouched.
    const accountUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    // Wallet deduction / refund logic
    if (data.methodUsed === "Wallet") {
      if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
        const refundAmount = previousRecord.amountCharged || 0;
        const newWalletAfterRefund = currentWalletAmount + refundAmount;
        if (newWalletAfterRefund < data.amountCharged) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${newWalletAfterRefund.toFixed(2)}, Required: ₹${data.amountCharged.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = newWalletAfterRefund - data.amountCharged;
      } else {
        if (currentWalletAmount < data.amountCharged) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${currentWalletAmount.toFixed(2)}, Required: ₹${data.amountCharged.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = currentWalletAmount - data.amountCharged;
      }
    } else if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
      const refundAmount = previousRecord.amountCharged || 0;
      accountUpdateData.walletAmount = currentWalletAmount + refundAmount;
    }

    // lastBookedDate update — only if the date actually changed (or is new)
    const currentLastBookedDate = accountData.lastBookedDate || "";
    if (treatAsNew || currentLastBookedDate !== bookingDate) {
      accountUpdateData.lastBookedDate = bookingDate;
      accountUpdateData.previousLastBookedDate = currentLastBookedDate || deleteField();
      // Marker so revert paths can identify which record last set lastBookedDate.
      // bookingDate alone is not unique across records.
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

    recordData.bookingTransactionId = bookingTransactionId;

    // Only set trainName when provided; never use deleteField() until we know it's an update
    if (data.trainName && data.trainName.trim() !== "") {
      recordData.trainName = data.trainName.trim();
    }

    let docId: string;

    if (isUpdate) {
      // Update existing record
      const existingDoc = querySnapshot.docs[0];
      docId = existingDoc.id;
      
      // For updates, use deleteField() to remove trainName if it was cleared
      if (!data.trainName || data.trainName.trim() === "") {
        recordData.trainName = deleteField();
      }
      
      await updateDoc(doc(db, "bookingRecords", docId), recordData);
    } else {
      // Create new record - deleteField() must NOT be used here
      const docRef = await addDoc(recordsCollection, {
        ...recordData,
        createdAt: serverTimestamp(),
      });
      docId = docRef.id;
    }

    // Retrieve the saved record
    const savedDoc = await getDoc(doc(db, "bookingRecords", docId));
    if (!savedDoc.exists()) {
      return { success: false, error: "Failed to retrieve saved record" };
    }

    const savedData = savedDoc.data();

    // Now that the record is safely written, apply account updates.
    // Only touch the account document when there is something meaningful
    // to change (wallet or date), so we don't stamp updatedAt unnecessarily.
    const accountFieldCount = Object.keys(accountUpdateData).length;
    if (accountFieldCount > 1) {
      await updateDoc(doc(db, "irctcAccounts", accountDoc.id), accountUpdateData);

      // New account updated successfully — now safely revert the old account.
      // If this throws, the caller will see a partial failure (new-account
      // updated, old-account revert failed). We let it propagate since the
      // data state is now recoverable by retrying the full operation.
      if (revertContext) {
        await revertAccountBookingEffects(revertContext.username, revertContext.record);
      }
    } else if (revertContext) {
      // No meaningful new-account update, but we still need to revert the old
      // account since the record now points to the new account. The record
      // write already committed, so the booking is attributed to the new
      // account even though the old account's state was never changed.
      await revertAccountBookingEffects(revertContext.username, revertContext.record);
    }

    const record = {
      id: savedDoc.id,
      bookingId: savedData.bookingId,
      bookedBy: savedData.bookedBy,
      bookedAccountUsername: savedData.bookedAccountUsername,
      amountCharged: savedData.amountCharged,
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
  methodUsed: string;
  trainName?: string;
}): Promise<{ success: boolean; error?: string; record?: any }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");
    
    // Check if a record already exists for this group (by groupId or any of the bookingIds)
    const groupQuery = query(recordsCollection, where("groupId", "==", data.groupId));
    const groupSnapshot = await getDocs(groupQuery);
    
    const isUpdate = !groupSnapshot.empty;
    let previousRecord = null;
    
    if (isUpdate) {
      const existingDoc = groupSnapshot.docs[0];
      previousRecord = existingDoc.data();
    }

    // Detect cross-account edit: the record now points to a different account.
    // We defer the revert until after the new-account update succeeds so that
    // a partial failure cannot leave the old account refunded while the booking
    // record still points to it.
    const accountChanged =
      isUpdate &&
      !!previousRecord &&
      previousRecord.bookedAccountUsername !== data.bookedAccountUsername;

    // Capture revert context; will be called only after new-account update succeeds.
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

    // Compute account updates (wallet + date) but don't apply them yet.
    // We write them only after the record document is successfully saved so
    // that a failed record write leaves the account untouched.
    const accountUpdateData: Record<string, any> = { updatedAt: serverTimestamp() };

    // Wallet deduction / refund logic
    if (data.methodUsed === "Wallet") {
      if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
        const refundAmount = previousRecord.amountCharged || 0;
        const newWalletAfterRefund = currentWalletAmount + refundAmount;
        if (newWalletAfterRefund < data.totalAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${newWalletAfterRefund.toFixed(2)}, Required: ₹${data.totalAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = newWalletAfterRefund - data.totalAmount;
      } else {
        if (currentWalletAmount < data.totalAmount) {
          return { success: false, error: `Insufficient wallet balance. Available: ₹${currentWalletAmount.toFixed(2)}, Required: ₹${data.totalAmount.toFixed(2)}` };
        }
        accountUpdateData.walletAmount = currentWalletAmount - data.totalAmount;
      }
    } else if (!treatAsNew && previousRecord?.methodUsed === "Wallet") {
      const refundAmount = previousRecord.amountCharged || 0;
      accountUpdateData.walletAmount = currentWalletAmount + refundAmount;
    }

    // lastBookedDate update — only if the date actually changed (or is new)
    const currentLastBookedDate = accountData.lastBookedDate || "";
    if (treatAsNew || currentLastBookedDate !== bookingDate) {
      accountUpdateData.lastBookedDate = bookingDate;
      accountUpdateData.previousLastBookedDate = currentLastBookedDate || deleteField();
      // Marker so revert paths can identify which record last set lastBookedDate.
      // bookingDate alone is not unique across records.
      accountUpdateData.lastBookedRecordId = bookingTransactionId;
    }

    // Create single record for the entire group
    const recordData: Record<string, any> = {
      bookingId: data.bookingIds[0], // Primary booking ID (first one)
      bookingIds: data.bookingIds,   // All booking IDs in the group
      groupId: data.groupId,         // Reference to the group
      bookedBy: data.bookedBy,
      bookedAccountUsername: data.bookedAccountUsername,
      amountCharged: data.totalAmount, // Total amount for entire group
      methodUsed: data.methodUsed,
      bookingTransactionId,          // Track this booking transaction
      bookingDate,                   // Store the booking's 'Book by' date for stats queries
      updatedAt: serverTimestamp(),
    };

    if (data.trainName && data.trainName.trim() !== "") {
      recordData.trainName = data.trainName.trim();
    }

    let docId: string;

    if (isUpdate) {
      const existingDoc = groupSnapshot.docs[0];
      docId = existingDoc.id;
      
      // For updates, use deleteField() to remove trainName if it was cleared
      if (!data.trainName || data.trainName.trim() === "") {
        recordData.trainName = deleteField();
      }
      
      await updateDoc(doc(db, "bookingRecords", docId), recordData);
    } else {
      // Create new record - deleteField() must NOT be used here
      const docRef = await addDoc(recordsCollection, {
        ...recordData,
        createdAt: serverTimestamp(),
      });
      docId = docRef.id;
    }

    // Retrieve the saved record
    const savedDoc = await getDoc(doc(db, "bookingRecords", docId));
    if (!savedDoc.exists()) {
      return { success: false, error: "Failed to retrieve saved record" };
    }

    const savedData = savedDoc.data();

    // Now that the record is safely written, apply account updates.
    // Only touch the account document when there is something meaningful
    // to change (wallet or date), so we don't stamp updatedAt unnecessarily.
    const accountFieldCount = Object.keys(accountUpdateData).length;
    if (accountFieldCount > 1) {
      await updateDoc(doc(db, "irctcAccounts", accountDoc.id), accountUpdateData);

      // New account updated successfully — now safely revert the old account.
      if (revertContext) {
        await revertAccountBookingEffects(revertContext.username, revertContext.record);
      }
    } else if (revertContext) {
      // No meaningful new-account update, but we still need to revert the old
      // account since the record now points to the new account.
      await revertAccountBookingEffects(revertContext.username, revertContext.record);
    }

    const record = {
      id: savedDoc.id,
      bookingId: savedData.bookingId,
      bookingIds: savedData.bookingIds,
      groupId: savedData.groupId,
      bookedBy: savedData.bookedBy,
      bookedAccountUsername: savedData.bookedAccountUsername,
      amountCharged: savedData.amountCharged,
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
        if (methodUsed === "Wallet" && amountCharged) {
          const currentWalletAmount = accountData.walletAmount || 0;
          updateData.walletAmount = currentWalletAmount + amountCharged;
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
       const methodUsed = groupRecordData.methodUsed;
       const bookedBy = groupRecordData.bookedBy;
       const bookedAccountUsername = groupRecordData.bookedAccountUsername;
       const trainName = groupRecordData.trainName;
       const bookingTransactionId = groupRecordData.bookingTransactionId; // Preserve transaction ID
      const groupRecordCreatedAt = groupRecordData.createdAt;

       // Calculate total passengers across all bookings
       const totalPassengers = bookingsData.reduce((sum, booking: any) => 
         sum + (booking.passengers?.length || 0), 0
       );

       // Calculate amount per passenger
       const amountPerPassenger = totalAmount / totalPassengers;

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
           updatedAt: serverTimestamp(),
         } as Record<string, any>;

         if (trainName) {
           baseRecordData.trainName = trainName;
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



