/**
 * Client-side Firestore operations for IRCTC accounts
 */

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { accountsStore, bookingRecordsStore } from "@/lib/dataStores";
import { describeFirestoreError } from "@/lib/firestoreErrors";
import type { IrctcAccount } from "@/types/account";

export interface AccountStats {
  accountId: string;
  username: string;
  bookingCount: number;
  previousMonthBookingCount: number;
  lastUsedDate?: string;
}

const toDate = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
};

/**
 * Accounts are read from the app-wide accounts listener (`accountsStore`), so
 * these lookups cost no Firestore reads after the first load of the session.
 */
export async function getAccountByUsername(username: string): Promise<IrctcAccount | null> {
  const accounts = await getAccounts();
  return accounts.find(account => account.username === username) ?? null;
}

/** Every IRCTC account, highest wallet balance first. */
export async function getAccounts(): Promise<IrctcAccount[]> {
  try {
    const accounts = await accountsStore.whenReady();
    return [...accounts];
  } catch (error) {
    console.error("[Firestore Error] getAccounts:", error);
    return [];
  }
}

export async function addAccount(accountData: Omit<IrctcAccount, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; error?: string; account?: IrctcAccount }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = await addDoc(collection(db, "irctcAccounts"), {
      ...accountData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const now = new Date().toISOString();
    const newAccount: IrctcAccount = {
      ...accountData,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, account: newAccount };
  } catch (error: any) {
    console.error("[Firestore Error] addAccount:", error);
    return { success: false, error: describeFirestoreError(error, "Failed to add account") };
  }
}

export async function updateAccount(id: string, accountData: Partial<IrctcAccount>): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "irctcAccounts", id);
    await updateDoc(docRef, {
      ...accountData,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] updateAccount (${id}):`, error);
    return { success: false, error: describeFirestoreError(error, "Failed to update account") };
  }
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "irctcAccounts", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteAccount (${id}):`, error);
    return { success: false, error: describeFirestoreError(error, "Failed to delete account") };
  }
}

export async function getAccountStats(): Promise<AccountStats[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    // Get all accounts
    const accounts = await getAccounts();
    
    // Booking records come from the shared store (cached on the device), not a
    // read of the whole collection. Bucketed by current vs previous month below.
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    await bookingRecordsStore.whenReady();
    const bookingRecords = bookingRecordsStore.getDocs();
    
    // Count unique booking transactions per account per bucket (current / previous month)
    const currentMonthUsage = new Map<string, { count: number; lastDate?: string }>();
    const previousMonthUsage = new Map<string, { count: number }>();
    
    // Track processed transactions per bucket using different strategies
    const currentProcessedTransactionIds = new Set<string>();
    const currentProcessedGroupIds = new Set<string>();
    const currentProcessedDocIds = new Set<string>();
    const previousProcessedTransactionIds = new Set<string>();
    const previousProcessedGroupIds = new Set<string>();
    const previousProcessedDocIds = new Set<string>();
    
    bookingRecords.forEach(doc => {
      const data = doc.data;
      const username = data.bookedAccountUsername;
      const createdAt = toDate(data.createdAt);
      const bookingDateStr = data.bookingDate as string | undefined; // "YYYY-MM-DD" stored in record
      const transactionId = data.bookingTransactionId;
      const groupId = data.groupId;
      
      // Use bookingDate (Book by date) if stored; fall back to createdAt for older records
      const effectiveDateStr = bookingDateStr || (createdAt ? createdAt.toISOString().split('T')[0] : null);
      const effectiveDate = effectiveDateStr ? new Date(effectiveDateStr) : null;
      
      if (!username || !effectiveDate) return;
      
      // Determine bucket: current month, previous month, or skip
      let bucket: "current" | "previous" | null = null;
      if (effectiveDate >= startOfCurrentMonth) {
        bucket = "current";
      } else if (effectiveDate >= startOfPreviousMonth) {
        bucket = "previous";
      }
      if (!bucket) return;
      
      const processedTransactionIds = bucket === "current" ? currentProcessedTransactionIds : previousProcessedTransactionIds;
      const processedGroupIds = bucket === "current" ? currentProcessedGroupIds : previousProcessedGroupIds;
      const processedDocIds = bucket === "current" ? currentProcessedDocIds : previousProcessedDocIds;
      
      let shouldCount = false;
      
      // Priority 1: Use transaction ID if available (new system)
      if (transactionId) {
        if (!processedTransactionIds.has(transactionId)) {
          processedTransactionIds.add(transactionId);
          shouldCount = true;
        }
      } 
      // Priority 2: Use groupId for old group bookings without transaction ID
      else if (groupId) {
        if (!processedGroupIds.has(groupId)) {
          processedGroupIds.add(groupId);
          shouldCount = true;
        }
      } 
      // Priority 3: Fall back to document ID for old individual bookings
      else {
        if (!processedDocIds.has(doc.id)) {
          processedDocIds.add(doc.id);
          shouldCount = true;
        }
      }
      
      if (!shouldCount) return;
      
      if (bucket === "current") {
        const existing = currentMonthUsage.get(username) || { count: 0 };
        const existingDate = existing.lastDate ? new Date(existing.lastDate) : null;
        currentMonthUsage.set(username, {
          count: existing.count + 1,
          lastDate: (!existingDate || effectiveDate > existingDate)
            ? effectiveDateStr!
            : existing.lastDate,
        });
      } else {
        const existing = previousMonthUsage.get(username) || { count: 0 };
        previousMonthUsage.set(username, { count: existing.count + 1 });
      }
    });

    // Build stats array
    const stats: AccountStats[] = accounts.map(account => ({
      accountId: account.id,
      username: account.username,
      bookingCount: currentMonthUsage.get(account.username)?.count || 0,
      previousMonthBookingCount: previousMonthUsage.get(account.username)?.count || 0,
      lastUsedDate: currentMonthUsage.get(account.username)?.lastDate,
    }));

    return stats;
  } catch (error) {
    console.error("[Firestore Error] getAccountStats:", error);
    return [];
  }
}
