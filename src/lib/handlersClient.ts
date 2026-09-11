/**
 * Client-side Firestore operations for handlers
 */

import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import type { Handler } from "@/types/handler";

/**
 * Handler payment tracking starts from this date. Amounts paid before it are
 * ignored so existing (already settled) bookings do not inflate the totals.
 */
export const HANDLER_PAYMENT_TRACKING_START_DATE = new Date("2026-09-11T00:00:00.000Z");

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
  /** Amount paid by this handler per payment method since HANDLER_PAYMENT_TRACKING_START_DATE */
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

/** Out-of-pocket amount still owed to the handler, after settlements. */
export function getHandlerOutstanding(
  totals: HandlerPaymentTotals | undefined,
  settledAmount: number | undefined
): number {
  return getHandlerPaidOutOfPocket(totals) - (settledAmount || 0);
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
        settledAmount: (data.settledAmount as number) || 0,
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
    const docRef = await addDoc(collection(db, "handlers"), {
      ...handlerData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const now = new Date().toISOString();
    const newHandler: Handler = {
      ...handlerData,
      id: docRef.id,
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
    
    bookingRecordsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const bookedBy = data.bookedBy;
      const createdAt = toDateSafe(data.createdAt);
      const transactionId = data.bookingTransactionId;
      const groupId = data.groupId;
      
      if (bookedBy && createdAt && createdAt >= fromDate) {
        // Payment totals start from their own (later) cut-off date so bookings
        // already settled before the feature existed are not counted.
        if (createdAt >= HANDLER_PAYMENT_TRACKING_START_DATE) {
          const amount = Number(data.amountCharged) || 0;
          if (amount > 0) {
            const totals = handlerPayments.get(bookedBy) || emptyPaymentTotals();

            if (data.methodUsed === "Wallet") {
              totals.wallet += amount;
            } else if (data.methodUsed === "UPI") {
              totals.upi += amount;
            } else {
              totals.others += amount;
            }
            totals.total += amount;

            handlerPayments.set(bookedBy, totals);
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

        const existing = handlerUsage.get(bookedBy) || { count: 0 };
        const existingDate = existing.lastDate ? new Date(existing.lastDate) : null;
        const currentDate = createdAt;
        
        handlerUsage.set(bookedBy, {
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
