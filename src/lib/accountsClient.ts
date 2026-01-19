/**
 * Client-side Firestore operations for IRCTC accounts
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
  Timestamp,
  where
} from "firebase/firestore";
import type { IrctcAccount } from "@/types/account";

export interface AccountStats {
  accountId: string;
  username: string;
  bookingCount: number;
  lastUsedDate?: string;
}

// Helper to convert Firestore timestamps
const toDateString = (value: any): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    return value;
  }
  return "";
};

export async function getAccountByUsername(username: string): Promise<IrctcAccount | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const accountsCollection = collection(db, "irctcAccounts");
    const q = query(accountsCollection, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      username: data.username as string,
      password: data.password as string,
      walletAmount: data.walletAmount as number || 0,
      lastBookedDate: toDateString(data.lastBookedDate),
      previousLastBookedDate: data.previousLastBookedDate,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Firestore Error] getAccountByUsername (${username}):`, error);
    return null;
  }
}

export async function getAccounts(): Promise<IrctcAccount[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const accountsCollection = collection(db, "irctcAccounts");
    const q = query(accountsCollection, orderBy("walletAmount", "desc"));
    const querySnapshot = await getDocs(q);

    const accounts = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username as string,
        password: data.password as string,
        walletAmount: data.walletAmount as number || 0,
        lastBookedDate: toDateString(data.lastBookedDate),
        previousLastBookedDate: data.previousLastBookedDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });

    return accounts;
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
    return { success: false, error: error.message || "Failed to add account" };
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
    return { success: false, error: error.message || "Failed to update account" };
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
    return { success: false, error: error.message || "Failed to delete account" };
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
    
    // Get booking records from the last 30 days
    const bookingRecordsCollection = collection(db, "bookingRecords");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const bookingRecordsSnapshot = await getDocs(bookingRecordsCollection);
    
    // Count bookings per account from last 30 days
    const accountUsage = new Map<string, { count: number; lastDate?: string }>();
    
    bookingRecordsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const username = data.bookedAccountUsername;
      const createdAt = data.createdAt?.toDate?.();
      
      // Only count bookings from last 30 days
      if (username && createdAt && createdAt >= thirtyDaysAgo) {
        const existing = accountUsage.get(username) || { count: 0 };
        const existingDate = existing.lastDate ? new Date(existing.lastDate) : null;
        const currentDate = createdAt;
        
        accountUsage.set(username, {
          count: existing.count + 1,
          lastDate: (!existingDate || currentDate > existingDate) 
            ? createdAt.toISOString().split('T')[0]
            : existing.lastDate,
        });
      }
    });

    // Build stats array
    const stats: AccountStats[] = accounts.map(account => ({
      accountId: account.id,
      username: account.username,
      bookingCount: accountUsage.get(account.username)?.count || 0,
      lastUsedDate: accountUsage.get(account.username)?.lastDate,
    }));

    return stats;
  } catch (error) {
    console.error("[Firestore Error] getAccountStats:", error);
    return [];
  }
}
