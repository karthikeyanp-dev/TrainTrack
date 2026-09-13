/**
 * Client-side Firestore operations for handlers
 */

import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  where,
  Timestamp,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import type { Handler, HandlerPaymentRecord, HandlerPaymentType } from "@/types/handler";

/**
 * Handler payment tracking starts from this date as a fallback if a handler does
 * not yet have an individual trackingStartDate. Amounts paid before it are
 * ignored so existing (already settled) bookings do not inflate the totals.
 */
export const HANDLER_PAYMENT_TRACKING_START_DATE = new Date("2026-09-12T22:00:00.000Z");

export interface HandlerPaymentTotals {
  wallet: number;
  upi: number;
  others: number;
  /** wallet + upi + others */
  total: number;
}

export interface HandlerStats {
  handlerId: string;
  name: string;
  bookingCount: number;
  lastAssignedDate?: string;
  /** Amount paid by this handler per payment method since trackingStartDate */
  paymentTotals: HandlerPaymentTotals;
}

const emptyPaymentTotals = (): HandlerPaymentTotals => ({
  wallet: 0,
  upi: 0,
  others: 0,
  total: 0,
});

/**
 * Amount the handler paid out of their own pocket. Wallet payments are funded by
 * the business's own IRCTC balance, so they create no debt; UPI and Others do.
 */
export function getHandlerPaidOutOfPocket(totals?: HandlerPaymentTotals): number {
  if (!totals) return 0;
  return totals.upi + totals.others;
}

/**
 * Total balance due to handler:
 * (Opening Pending) + (Total Bookings: UPI + Wallet + Others) - (Settled Repayments) - (NA Deductions)
 */
export function getHandlerOutstanding(
  totals: HandlerPaymentTotals | undefined,
  settledAmount: number | undefined,
  initialPendingAmount: number = 0,
  naAmount: number = 0
): number {
  const totalBookings = totals?.total || 0;
  return (initialPendingAmount || 0) + totalBookings - (settledAmount || 0) - (naAmount || 0);
}

export async function getHandlers(): Promise<Handler[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const handlersCollection = collection(db, "handlers");
    const q = query(handlersCollection, orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);

    const handlers = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name as string,
        initialPendingAmount: (data.initialPendingAmount as number) || 0,
        settledAmount: (data.settledAmount as number) || 0,
        naAmount: (data.naAmount as number) || 0,
        payments: (data.payments as HandlerPaymentRecord[]) || [],
        trackingStartDate: data.trackingStartDate as string | undefined,
        lastSettledDate: data.lastSettledDate as string | undefined,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });

    return handlers;
  } catch (error) {
    console.error("[Firestore Error] getHandlers:", error);
    return [];
  }
}

export async function addHandler(handlerData: Omit<Handler, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; error?: string; handler?: Handler }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const now = new Date().toISOString();
    const initialPending = Number(handlerData.initialPendingAmount) || 0;
    if (initialPending < 0) {
      return { success: false, error: "Initial pending amount cannot be negative" };
    }
    if (initialPending > 100000) {
      return { success: false, error: "Initial pending amount cannot exceed ₹1,00,000" };
    }

    // Only set an explicit trackingStartDate if an opening pending balance was specified.
    // When initialPending is 0/omitted, leave trackingStartDate undefined so existing bookings
    // can be included up to the system-wide cut-off date instead of being silently excluded.
    const trackingStartDate = handlerData.trackingStartDate || (initialPending > 0 ? now : undefined);

    const docData: Record<string, any> = {
      ...handlerData,
      initialPendingAmount: initialPending,
      settledAmount: handlerData.settledAmount || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (trackingStartDate) {
      docData.trackingStartDate = trackingStartDate;
    }

    const docRef = await addDoc(collection(db, "handlers"), docData);

    const newHandler: Handler = {
      ...handlerData,
      id: docRef.id,
      initialPendingAmount: initialPending,
      settledAmount: handlerData.settledAmount || 0,
      trackingStartDate,
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, handler: newHandler };
  } catch (error: any) {
    console.error("[Firestore Error] addHandler:", error);
    return { success: false, error: error.message || "Failed to add handler" };
  }
}

export async function updateHandler(id: string, handlerData: Partial<Handler>): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      ...handlerData,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] updateHandler (${id}):`, error);
    return { success: false, error: error.message || "Failed to update handler" };
  }
}

/**
 * Update a handler's name and migrate all existing booking records from oldName
 * to newName so historical bookings and statistics stay intact.
 */
export async function renameHandlerAndMigrateRecords(
  id: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; error?: string; updatedRecordsCount?: number }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  const trimmedNew = newName.trim();
  const trimmedOld = oldName.trim();

  if (!trimmedNew) {
    return { success: false, error: "Handler name cannot be empty" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      name: trimmedNew,
      updatedAt: serverTimestamp(),
    });

    // Query and migrate existing booking records where bookedBy was the old name
    const recordsCollection = collection(db, "bookingRecords");
    const q = query(recordsCollection, where("bookedBy", "==", trimmedOld));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const docs = snapshot.docs;
      const chunkSize = 400; // Batch size safety limit
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(d => {
          batch.update(d.ref, {
            bookedBy: trimmedNew,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    return { success: true, updatedRecordsCount: snapshot.docs.length };
  } catch (error: any) {
    console.error(`[Firestore Error] renameHandlerAndMigrateRecords (${id}):`, error);
    return { success: false, error: error.message || "Failed to rename handler and migrate records" };
  }
}

/**
 * Record a repayment to a handler. `amount` is added to the handler's running
 * settled total; pass a negative amount to correct an over-recorded settlement.
 * Returns the new settled total so callers can update local state without a refetch.
 */
export async function recordHandlerSettlement(
  id: string,
  amount: number,
  currentSettledAmount: number
): Promise<{ success: boolean; error?: string; settledAmount?: number; lastSettledDate?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  if (!Number.isFinite(amount) || amount === 0) {
    return { success: false, error: "Enter a valid non-zero amount" };
  }

  const newSettledAmount = Number(((currentSettledAmount || 0) + amount).toFixed(2));

  if (newSettledAmount < 0) {
    return { success: false, error: "Settled total cannot go below zero" };
  }

  const lastSettledDate = new Date().toISOString().split("T")[0];

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      settledAmount: newSettledAmount,
      lastSettledDate,
      updatedAt: serverTimestamp(),
    });

    return { success: true, settledAmount: newSettledAmount, lastSettledDate };
  } catch (error: any) {
    console.error(`[Firestore Error] recordHandlerSettlement (${id}):`, error);
    return { success: false, error: error.message || "Failed to record settlement" };
  }
}

/**
 * Record a payment transaction for a handler.
 * - If type === "settlement": business repaid handler out-of-pocket, increments settledAmount, updates lastSettledDate.
 * - If type === "na": booking was made using business-loaded wallet, increments naAmount.
 * Both types reduce the balance due to the handler.
 */
export async function recordHandlerPayment(
  id: string,
  paymentData: {
    type: HandlerPaymentType;
    amount: number;
    notes?: string;
    date?: string;
  }
): Promise<{ success: boolean; error?: string; payment?: HandlerPaymentRecord; settledAmount?: number; naAmount?: number }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  const { type, amount, notes, date } = paymentData;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Enter a valid positive amount" };
  }

  if (amount > 100000) {
    return { success: false, error: "Amount cannot exceed ₹1,00,000" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, error: "Handler not found" };
    }

    const currentData = snap.data();
    const currentSettled = Number(currentData.settledAmount || 0);
    const currentNa = Number(currentData.naAmount || 0);
    const existingPayments: HandlerPaymentRecord[] = currentData.payments || [];

    const newPayment: HandlerPaymentRecord = {
      id: docRef.id + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      type,
      amount: Number(amount.toFixed(2)),
      notes: notes?.trim() || undefined,
      date: date || new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    };

    let newSettled = currentSettled;
    let newNa = currentNa;
    const updates: Record<string, any> = {
      payments: [...existingPayments, newPayment],
      updatedAt: serverTimestamp(),
    };

    if (type === "settlement") {
      newSettled = Math.max(0, Number((currentSettled + amount).toFixed(2)));
      updates.settledAmount = newSettled;
      updates.lastSettledDate = newPayment.date;
    } else {
      newNa = Math.max(0, Number((currentNa + amount).toFixed(2)));
      updates.naAmount = newNa;
    }

    await updateDoc(docRef, updates);
    return { success: true, payment: newPayment, settledAmount: newSettled, naAmount: newNa };
  } catch (error: any) {
    console.error(`[Firestore Error] recordHandlerPayment (${id}):`, error);
    return { success: false, error: error.message || "Failed to record payment" };
  }
}

/**
 * Delete a previously recorded payment transaction for a handler.
 * Readjusts settledAmount or naAmount accordingly.
 */
export async function deleteHandlerPayment(
  handlerId: string,
  paymentId: string
): Promise<{ success: boolean; error?: string; settledAmount?: number; naAmount?: number }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", handlerId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, error: "Handler not found" };
    }

    const currentData = snap.data();
    const existingPayments: HandlerPaymentRecord[] = currentData.payments || [];
    const paymentToDelete = existingPayments.find(p => p.id === paymentId);
    if (!paymentToDelete) {
      return { success: false, error: "Payment record not found" };
    }

    const remainingPayments = existingPayments.filter(p => p.id !== paymentId);
    let newSettled = Number(currentData.settledAmount || 0);
    let newNa = Number(currentData.naAmount || 0);

    const updates: Record<string, any> = {
      payments: remainingPayments,
      updatedAt: serverTimestamp(),
    };

    if (paymentToDelete.type === "settlement") {
      newSettled = Math.max(0, Number((newSettled - paymentToDelete.amount).toFixed(2)));
      updates.settledAmount = newSettled;
      const remainingSettlements = remainingPayments.filter(p => p.type === "settlement");
      const lastSettlement = remainingSettlements.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
      if (lastSettlement) {
        updates.lastSettledDate = lastSettlement.date;
      } else {
        updates.lastSettledDate = deleteField();
      }
    } else {
      newNa = Math.max(0, Number((newNa - paymentToDelete.amount).toFixed(2)));
      updates.naAmount = newNa;
    }

    await updateDoc(docRef, updates);
    return { success: true, settledAmount: newSettled, naAmount: newNa };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteHandlerPayment (${handlerId}, ${paymentId}):`, error);
    return { success: false, error: error.message || "Failed to delete payment" };
  }
}

/**
 * Clear or delete the settlement history for a handler, resetting settledAmount, naAmount,
 * payments to empty and removing lastSettledDate.
 */
export async function clearHandlerSettlement(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      settledAmount: 0,
      naAmount: 0,
      payments: [],
      lastSettledDate: deleteField(),
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] clearHandlerSettlement (${id}):`, error);
    return { success: false, error: error.message || "Failed to clear settlement" };
  }
}

/**
 * Set or update the pending amount for a handler. This restarts tracking
 * from the current moment with the entered amount as the initial pending balance,
 * and resets settled amount and NA amount to 0.
 */
export async function setHandlerPendingAmount(
  id: string,
  pendingAmount: number
): Promise<{ success: boolean; error?: string; trackingStartDate?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  if (!Number.isFinite(pendingAmount) || pendingAmount < 0) {
    return { success: false, error: "Enter a valid non-negative pending amount" };
  }

  if (pendingAmount > 100000) {
    return { success: false, error: "Pending amount cannot exceed ₹1,00,000" };
  }

  const trackingStartDate = new Date().toISOString();

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      initialPendingAmount: Number(pendingAmount.toFixed(2)),
      settledAmount: 0,
      naAmount: 0,
      payments: [],
      trackingStartDate,
      lastSettledDate: deleteField(),
      updatedAt: serverTimestamp(),
    });

    return { success: true, trackingStartDate };
  } catch (error: any) {
    console.error(`[Firestore Error] setHandlerPendingAmount (${id}):`, error);
    return { success: false, error: error.message || "Failed to set pending amount" };
  }
}

/**
 * Reset all handlers' payment balances to zero. This sets initialPendingAmount to 0,
 * settledAmount to 0, naAmount to 0, payments to [], and sets trackingStartDate to now for every handler doc.
 */
export async function resetAllHandlersBalance(): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const handlersCollection = collection(db, "handlers");
    const snapshot = await getDocs(handlersCollection);
    const now = new Date().toISOString();

    const updatePromises = snapshot.docs.map(d => {
      return updateDoc(d.ref, {
        initialPendingAmount: 0,
        settledAmount: 0,
        naAmount: 0,
        payments: [],
        trackingStartDate: now,
        lastSettledDate: deleteField(),
        updatedAt: serverTimestamp(),
      });
    });

    await Promise.all(updatePromises);
    return { success: true, updatedCount: snapshot.docs.length };
  } catch (error: any) {
    console.error("[Firestore Error] resetAllHandlersBalance:", error);
    return { success: false, error: error.message || "Failed to reset all handlers" };
  }
}

export async function deleteHandler(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteHandler (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete handler" };
  }
}

export async function getHandlerStats(): Promise<HandlerStats[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const handlers = await getHandlers();
    return getHandlerStatsForHandlers(handlers);
  } catch (error) {
    console.error("[Firestore Error] getHandlerStats:", error);
    return [];
  }
}

export async function getHandlerStatsForHandlers(
  handlers: Handler[],
  options?: { fromDate?: Date }
): Promise<HandlerStats[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    // Consider only bookings made from Jan 1st 2026 (default)
    const fromDate = options?.fromDate ?? new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    
    // Get all booking records to calculate stats
    const bookingRecordsCollection = collection(db, "bookingRecords");
    const recordsQuery = query(
      bookingRecordsCollection,
      where("createdAt", ">=", Timestamp.fromDate(fromDate))
    );
    const bookingRecordsSnapshot = await getDocs(recordsQuery);
    
    // Count unique bookings per handler
    const handlerUsage = new Map<string, { count: number; lastDate?: string }>();
    // Track how much each handler has paid, per payment method. Unlike the
    // booking count this is NOT de-duplicated: an intact group record holds the
    // full group amount in one doc, while an ungrouped group holds proportional
    // slices across several docs, so summing every record is correct either way.
    const handlerPayments = new Map<string, HandlerPaymentTotals>();
    const processedTransactionIds = new Set<string>();
    const processedGroupIds = new Set<string>();
    const processedDocIds = new Set<string>();

    const toDateSafe = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Timestamp) return value.toDate();
      if (typeof value?.toDate === "function") {
        try {
          return value.toDate();
        } catch {
          return null;
        }
      }
      if (typeof value === "string") {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      if (typeof value === "number") {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    };
    
    // Lookup for per-handler tracking start date
    const handlerLookup = new Map<string, Handler>();
    handlers.forEach(h => {
      handlerLookup.set(h.name.toLowerCase().trim(), h);
    });

    bookingRecordsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const bookedBy = data.bookedBy;
      const createdAt = toDateSafe(data.createdAt);
      const transactionId = data.bookingTransactionId;
      const groupId = data.groupId;
      
      if (bookedBy && createdAt && createdAt >= fromDate) {
        const handler = handlerLookup.get(bookedBy.toLowerCase().trim());
        const key = handler ? handler.name : bookedBy;

        // Payment totals start from handler's trackingStartDate (or fallback)
        // so bookings before that date do not inflate the totals.
        const trackingCutoff = handler?.trackingStartDate
          ? new Date(handler.trackingStartDate)
          : HANDLER_PAYMENT_TRACKING_START_DATE;

        if (createdAt >= trackingCutoff) {
          const amount = Number(data.amountCharged) || 0;
          if (amount > 0) {
            const totals = handlerPayments.get(key) || emptyPaymentTotals();

            if (data.methodUsed === "Wallet") {
              totals.wallet += amount;
            } else if (data.methodUsed === "UPI") {
              totals.upi += amount;
            } else {
              totals.others += amount;
            }
            totals.total += amount;

            handlerPayments.set(key, totals);
          }
        }

        let shouldCount = false;

        if (transactionId) {
          if (!processedTransactionIds.has(transactionId)) {
            processedTransactionIds.add(transactionId);
            shouldCount = true;
          }
        } else if (groupId) {
          if (!processedGroupIds.has(groupId)) {
            processedGroupIds.add(groupId);
            shouldCount = true;
          }
        } else if (!processedDocIds.has(doc.id)) {
          processedDocIds.add(doc.id);
          shouldCount = true;
        }

        if (!shouldCount) {
          return;
        }

        const existing = handlerUsage.get(key) || { count: 0 };
        const existingDate = existing.lastDate ? new Date(existing.lastDate) : null;
        const currentDate = createdAt;
        
        handlerUsage.set(key, {
          count: existing.count + 1,
          lastDate: (!existingDate || currentDate > existingDate)
            ? currentDate.toISOString().split('T')[0]
            : existing.lastDate,
        });
      }
    });

    // Build stats array
    const stats: HandlerStats[] = handlers.map(handler => ({
      handlerId: handler.id,
      name: handler.name,
      bookingCount: handlerUsage.get(handler.name)?.count || 0,
      lastAssignedDate: handlerUsage.get(handler.name)?.lastDate,
      paymentTotals: handlerPayments.get(handler.name) || emptyPaymentTotals(),
    }));

    return stats;
  } catch (error) {
    console.error("[Firestore Error] getHandlerStatsForHandlers:", error);
    return [];
  }
}
