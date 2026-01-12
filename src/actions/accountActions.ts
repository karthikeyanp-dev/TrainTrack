
"use server";

import type { IrctcAccount, AccountFormData } from "@/types/account";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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
  type DocumentSnapshot,
  type DocumentData
} from "firebase/firestore";

const AccountFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  walletAmount: z.number().min(0, "Wallet amount must be non-negative"),
  lastBookedDate: z.string().optional(),
});

const toISOStringSafe = (value: any, fieldName: string, accountId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Account ID ${accountId}: Field '${fieldName}' is a string but not a valid date: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for account ${accountId}`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Account ID ${accountId}: Field '${fieldName}' is a number but not a valid date timestamp: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for account ${accountId}`);
  }
  console.error(`[DataFormatError] Account ID ${accountId}: Unexpected type or invalid value for timestamp field '${fieldName}':`, value);
  throw new Error(`Unexpected or invalid format for '${fieldName}' in account ${accountId}`);
};

const mapDocToAccount = (document: DocumentSnapshot<DocumentData>, id: string): IrctcAccount => {
  const data = document.data();
  if (!data) {
    console.error(`[DataError] No data found for account document with id ${id}`);
    throw new Error(`No data found for account document with id ${id}`);
  }

  return {
    id,
    username: data.username as string,
    password: data.password as string,
    walletAmount: data.walletAmount as number,
    lastBookedDate: data.lastBookedDate as string || "",
    createdAt: toISOStringSafe(data.createdAt, 'createdAt', id),
    updatedAt: toISOStringSafe(data.updatedAt, 'updatedAt', id),
  };
};

export async function addAccount(formData: AccountFormData): Promise<{ 
  success: boolean; 
  errors?: z.ZodError<AccountFormData>["formErrors"]; 
  account?: IrctcAccount 
}> {
  const validationResult = AccountFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In addAccount:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.flatten() as any };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In addAccount: Firestore db instance is not available");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly"],
          fieldErrors: {}
        } as any
      };
    }

    const accountDataForFirestore = {
      ...validationResult.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "irctcAccounts"), accountDataForFirestore);

    const now = new Date().toISOString();
    const newAccount: IrctcAccount = {
      ...validationResult.data,
      lastBookedDate: validationResult.data.lastBookedDate || "",
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn("[Revalidation Warning] Failed to revalidate paths after adding account:", 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, account: newAccount };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Firestore/Server Error] In addAccount:", errorMessage);

    let specificMessage = "An unexpected server error occurred. Failed to save account.";
    if (error instanceof Error) {
      const firebaseErrorCode = (error as any)?.code;
      if (firebaseErrorCode === "permission-denied" || error.message.includes("permission-denied")) {
        specificMessage = "Permission denied when trying to save the account. Please check Firestore security rules.";
      } else if (firebaseErrorCode === "unavailable") {
        specificMessage = "The Firestore service is currently unavailable. Please try again later.";
      } else if (errorMessage.trim().length > 0) {
        specificMessage = errorMessage;
      }
    }

    return { 
      success: false, 
      errors: {
        formErrors: [specificMessage],
        fieldErrors: {}
      } as any
    };
  }
}

export async function getAccounts(): Promise<IrctcAccount[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getAccounts: Firestore db instance is not available");
      return [];
    }

    const accountsCollection = collection(db, "irctcAccounts");
    const q = query(accountsCollection, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const accounts = querySnapshot.docs.map(doc => {
      try {
        return mapDocToAccount(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map account document ${doc.id}:`, 
          mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(account => account !== null) as IrctcAccount[];

    return accounts;
  } catch (error) {
    console.error("[Firestore Error] In getAccounts:", 
      error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function getAccountById(id: string): Promise<IrctcAccount | null> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getAccountById: Firestore db instance is not available");
      return null;
    }

    const docRef = doc(db, "irctcAccounts", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return mapDocToAccount(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] In getAccountById (ID: ${id}):`, 
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function updateAccount(id: string, formData: AccountFormData): Promise<{ 
  success: boolean; 
  errors?: z.ZodError<AccountFormData>["formErrors"]; 
  account?: IrctcAccount 
}> {
  const validationResult = AccountFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In updateAccount:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.flatten() as any };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In updateAccount: Firestore db instance is not available");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly"],
          fieldErrors: {}
        } as any
      };
    }

    const docRef = doc(db, "irctcAccounts", id);
    const accountDataForFirestore = {
      ...validationResult.data,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, accountDataForFirestore);

    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) {
      return { 
        success: false, 
        errors: { 
          formErrors: ["Failed to retrieve account after update"], 
          fieldErrors: {} 
        } as any 
      };
    }

    const updatedAccount = mapDocToAccount(updatedDocSnap, updatedDocSnap.id);

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after updating account ${id}:`, 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, account: updatedAccount };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore/Server Error] In updateAccount (ID: ${id}):`, errorMessage);
    
    return { 
      success: false, 
      errors: {
        formErrors: [errorMessage || "Failed to update account"],
        fieldErrors: {}
      } as any
    };
  }
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      console.error("[Firestore Error] In deleteAccount: Firestore db instance is not available");
      return { success: false, error: "Firestore database is not configured correctly" };
    }

    const docRef = doc(db, "irctcAccounts", id);
    await deleteDoc(docRef);

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after deleting account ${id}:`, 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore Error] In deleteAccount (ID: ${id}):`, errorMessage);
    return { success: false, error: `Failed to delete account: ${errorMessage}` };
  }
}

export interface AccountStats {
  accountId: string;
  username: string;
  bookingsCount: number;
}

export async function getAccountStats(): Promise<AccountStats[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getAccountStats: Firestore db instance is not available");
      return [];
    }

    const accountsCollection = collection(db, "irctcAccounts");
    const bookingRecordsCollection = collection(db, "bookingRecords");
    
    const [accountsSnapshot, bookingRecordsSnapshot] = await Promise.all([
      getDocs(query(accountsCollection, orderBy("createdAt", "desc"))),
      getDocs(bookingRecordsCollection)
    ]);

    const accounts = accountsSnapshot.docs.map(doc => {
      try {
        return mapDocToAccount(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map account document ${doc.id}:`, 
          mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(account => account !== null) as IrctcAccount[];

    // Calculate date from 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats: AccountStats[] = accounts.map(account => {
      let bookingsCount = 0;

      bookingRecordsSnapshot.docs.forEach(recordDoc => {
        const recordData = recordDoc.data();
        if (recordData.bookedAccountUsername === account.username) {
          // Only count bookings from the last 30 days
          const recordDate = recordData.createdAt instanceof Timestamp
            ? recordData.createdAt.toDate()
            : new Date(recordData.createdAt);

          if (recordDate >= thirtyDaysAgo) {
            bookingsCount++;
          }
        }
      });

      return {
        accountId: account.id,
        username: account.username,
        bookingsCount
      };
    });

    return stats;
  } catch (error) {
    console.error("[Firestore Error] In getAccountStats:", 
      error instanceof Error ? error.message : String(error));
    return [];
  }
}
