
"use server";

import type { BookingRecord, BookingRecordFormData, PaymentMethod } from "@/types/bookingRecord";
import { ALL_PAYMENT_METHODS } from "@/types/bookingRecord";
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
  where,
  Timestamp,
  type DocumentSnapshot,
  type DocumentData
} from "firebase/firestore";

const BookingRecordFormSchema = z.object({
  bookingId: z.string().min(1, "Booking ID is required"),
  bookedBy: z.string().min(1, "Booked By is required"),
  bookedAccountUsername: z.string().min(1, "Booked Account is required"),
  amountCharged: z.number().min(0, "Amount must be non-negative"),
  methodUsed: z.enum(ALL_PAYMENT_METHODS, { errorMap: () => ({ message: "Invalid payment method" }) }),
});

const toISOStringSafe = (value: any, fieldName: string, recordId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] BookingRecord ID ${recordId}: Field '${fieldName}' is invalid: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for record ${recordId}`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  console.error(`[DataFormatError] BookingRecord ID ${recordId}: Unexpected value for '${fieldName}':`, value);
  throw new Error(`Invalid format for '${fieldName}' in record ${recordId}`);
};

const mapDocToBookingRecord = (document: DocumentSnapshot<DocumentData>, id: string): BookingRecord => {
  const data = document.data();
  if (!data) {
    console.error(`[DataError] No data found for booking record document with id ${id}`);
    throw new Error(`No data found for booking record document with id ${id}`);
  }

  return {
    id,
    bookingId: data.bookingId as string,
    bookedBy: data.bookedBy as string,
    bookedAccountUsername: data.bookedAccountUsername as string,
    amountCharged: data.amountCharged as number,
    methodUsed: data.methodUsed as PaymentMethod,
    createdAt: toISOStringSafe(data.createdAt, 'createdAt', id),
    updatedAt: toISOStringSafe(data.updatedAt, 'updatedAt', id),
  };
};

export async function saveBookingRecord(formData: BookingRecordFormData): Promise<{ 
  success: boolean; 
  errors?: z.ZodError<BookingRecordFormData>["formErrors"]; 
  record?: BookingRecord 
}> {
  const validationResult = BookingRecordFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In saveBookingRecord:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.flatten() as any };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In saveBookingRecord: Firestore db instance is not available");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly"],
          fieldErrors: {}
        } as any
      };
    }

    // Check if a record already exists for this booking
    const existingRecord = await getBookingRecordByBookingId(validationResult.data.bookingId);

    if (existingRecord) {
      // Update existing record
      const docRef = doc(db, "bookingRecords", existingRecord.id);
      const updateData = {
        ...validationResult.data,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(docRef, updateData);

      try {
        const oldUser = existingRecord.bookedAccountUsername;
        const oldMethod = existingRecord.methodUsed;
        const oldAmount = existingRecord.amountCharged;

        const newUser = validationResult.data.bookedAccountUsername;
        const newMethod = validationResult.data.methodUsed;
        const newAmount = validationResult.data.amountCharged;

        const adjustments: Record<string, number> = {};

        // 1. Refund logic: If previously paid by Wallet, add amount back to old user
        if (oldMethod === 'Wallet' && oldUser) {
          adjustments[oldUser] = (adjustments[oldUser] || 0) + oldAmount;
        }

        // 2. Debit logic: If now paying by Wallet, subtract amount from new user
        if (newMethod === 'Wallet' && newUser) {
          adjustments[newUser] = (adjustments[newUser] || 0) - newAmount;
        }

        // Apply adjustments
        for (const [username, amount] of Object.entries(adjustments)) {
          if (amount === 0) continue;

          const accountsCollection = collection(db, "irctcAccounts");
          const qAcc = query(accountsCollection, where("username", "==", username));
          const accSnap = await getDocs(qAcc);

          if (!accSnap.empty) {
            const accDoc = accSnap.docs[0];
            const currentWallet = (accDoc.data().walletAmount as number) || 0;
            const newWallet = currentWallet + amount;
            const accDocRef = doc(db, "irctcAccounts", accDoc.id);
            await updateDoc(accDocRef, { walletAmount: newWallet, updatedAt: serverTimestamp() });
          }
        }
      } catch (walletError) {
        console.error("Failed to update wallet balances:", walletError);
      }

      const updatedDocSnap = await getDoc(docRef);
      if (!updatedDocSnap.exists()) {
        return { 
          success: false, 
          errors: { 
            formErrors: ["Failed to retrieve record after update"], 
            fieldErrors: {} 
          } as any 
        };
      }

      const updatedRecord = mapDocToBookingRecord(updatedDocSnap, updatedDocSnap.id);

      try {
        revalidatePath("/");
      } catch (revalidationError) {
        console.warn("[Revalidation Warning] Failed to revalidate after updating record");
      }

      return { success: true, record: updatedRecord };
    } else {
      // Create new record
      const recordDataForFirestore = {
        ...validationResult.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "bookingRecords"), recordDataForFirestore);

      try {
        if (validationResult.data.methodUsed === 'Wallet') {
          const username = validationResult.data.bookedAccountUsername;
          const accountsCollection = collection(db, "irctcAccounts");
          const qAcc = query(accountsCollection, where("username", "==", username));
          const accSnap = await getDocs(qAcc);
          if (!accSnap.empty) {
            const accDoc = accSnap.docs[0];
            const currentWallet = (accDoc.data().walletAmount as number) || 0;
            const newWallet = currentWallet - validationResult.data.amountCharged;
            const accDocRef = doc(db, "irctcAccounts", accDoc.id);
            await updateDoc(accDocRef, { walletAmount: newWallet, updatedAt: serverTimestamp() });
          }
        }
      } catch {}

      const now = new Date().toISOString();
      const newRecord: BookingRecord = {
        ...validationResult.data,
        id: docRef.id,
        createdAt: now,
        updatedAt: now,
      };

      try {
        revalidatePath("/");
      } catch (revalidationError) {
        console.warn("[Revalidation Warning] Failed to revalidate after adding record");
      }

      return { success: true, record: newRecord };
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Firestore/Server Error] In saveBookingRecord:", errorMessage);

    let specificMessage = "An unexpected server error occurred. Failed to save booking record.";
    if (error instanceof Error) {
      const firebaseErrorCode = (error as any)?.code;
      if (firebaseErrorCode === "permission-denied" || error.message.includes("permission-denied")) {
        specificMessage = "Permission denied when trying to save the record. Please check Firestore security rules.";
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

export async function getBookingRecordByBookingId(bookingId: string): Promise<BookingRecord | null> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getBookingRecordByBookingId: Firestore db instance is not available");
      return null;
    }

    const recordsCollection = collection(db, "bookingRecords");
    const q = query(recordsCollection, where("bookingId", "==", bookingId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    // Should only be one record per booking
    const docSnap = querySnapshot.docs[0];
    return mapDocToBookingRecord(docSnap, docSnap.id);

  } catch (error) {
    console.error(`[Firestore Error] In getBookingRecordByBookingId (bookingId: ${bookingId}):`, 
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function getAllBookingRecords(): Promise<BookingRecord[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getAllBookingRecords: Firestore db instance is not available");
      return [];
    }

    const recordsCollection = collection(db, "bookingRecords");
    const querySnapshot = await getDocs(recordsCollection);

    const records = querySnapshot.docs.map(doc => {
      try {
        return mapDocToBookingRecord(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map booking record document ${doc.id}:`, 
          mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(record => record !== null) as BookingRecord[];

    return records;
  } catch (error) {
    console.error("[Firestore Error] In getAllBookingRecords:", 
      error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function deleteBookingRecord(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      console.error("[Firestore Error] In deleteBookingRecord: Firestore db instance is not available");
      return { success: false, error: "Firestore database is not configured correctly" };
    }

    const docRef = doc(db, "bookingRecords", id);
    
    // 1. Fetch the record to check for wallet refund
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
       return { success: false, error: "Record not found" };
    }
    const data = docSnap.data();
    const methodUsed = data.methodUsed;
    const amountCharged = data.amountCharged;
    const bookedAccountUsername = data.bookedAccountUsername;

    // 2. Refund logic: If previously paid by Wallet, add amount back to user
    if (methodUsed === 'Wallet' && bookedAccountUsername && amountCharged > 0) {
        try {
            const accountsCollection = collection(db, "irctcAccounts");
            const qAcc = query(accountsCollection, where("username", "==", bookedAccountUsername));
            const accSnap = await getDocs(qAcc);

            if (!accSnap.empty) {
                const accDoc = accSnap.docs[0];
                const currentWallet = (accDoc.data().walletAmount as number) || 0;
                const newWallet = currentWallet + amountCharged;
                const accDocRef = doc(db, "irctcAccounts", accDoc.id);
                await updateDoc(accDocRef, { walletAmount: newWallet, updatedAt: serverTimestamp() });
            }
        } catch (walletError) {
             console.error("Failed to refund wallet balance:", walletError);
             return { success: false, error: "Failed to refund wallet amount. Record was not deleted." };
        }
    }

    await deleteDoc(docRef);

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after deleting record ${id}`);
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore Error] In deleteBookingRecord (ID: ${id}):`, errorMessage);
    return { success: false, error: `Failed to delete record: ${errorMessage}` };
  }
}
