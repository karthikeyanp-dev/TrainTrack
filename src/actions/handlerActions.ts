"use server";

import type { Handler, HandlerFormData } from "@/types/handler";
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

const HandlerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const toISOStringSafe = (value: any, fieldName: string, handlerId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Handler ID ${handlerId}: Field '${fieldName}' is a string but not a valid date: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for handler ${handlerId}`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Handler ID ${handlerId}: Field '${fieldName}' is a number but not a valid date timestamp: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for handler ${handlerId}`);
  }
  // Allow null/undefined for new records that might not have timestamps yet (though they should)
  if (!value) return new Date().toISOString();
  
  console.error(`[DataFormatError] Handler ID ${handlerId}: Unexpected type or invalid value for timestamp field '${fieldName}':`, value);
  return new Date().toISOString(); // Fallback
};

const mapDocToHandler = (document: DocumentSnapshot<DocumentData>, id: string): Handler => {
  const data = document.data();
  if (!data) {
    console.error(`[DataError] No data found for handler document with id ${id}`);
    throw new Error(`No data found for handler document with id ${id}`);
  }

  return {
    id,
    name: data.name as string,
    createdAt: toISOStringSafe(data.createdAt, 'createdAt', id),
    updatedAt: toISOStringSafe(data.updatedAt, 'updatedAt', id),
  };
};

export async function addHandler(formData: HandlerFormData): Promise<{ 
  success: boolean; 
  errors?: z.ZodError<HandlerFormData>["formErrors"]; 
  handler?: Handler 
}> {
  const validationResult = HandlerFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In addHandler:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.flatten() as any };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In addHandler: Firestore db instance is not available");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly"],
          fieldErrors: {}
        } as any
      };
    }

    const handlerDataForFirestore = {
      ...validationResult.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "handlers"), handlerDataForFirestore);

    const now = new Date().toISOString();
    const newHandler: Handler = {
      ...validationResult.data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn("[Revalidation Warning] Failed to revalidate paths after adding handler:", 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, handler: newHandler };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Firestore/Server Error] In addHandler:", errorMessage);

    let specificMessage = "An unexpected server error occurred. Failed to save handler.";
    if (error instanceof Error) {
      const firebaseErrorCode = (error as any)?.code;
      if (firebaseErrorCode === "permission-denied" || error.message.includes("permission-denied")) {
        specificMessage = "Permission denied when trying to save the handler. Please check Firestore security rules.";
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

export async function getHandlers(): Promise<Handler[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getHandlers: Firestore db instance is not available");
      return [];
    }

    const handlersCollection = collection(db, "handlers");
    const q = query(handlersCollection, orderBy("createdAt", "asc"));
    const querySnapshot = await getDocs(q);

    const handlers = querySnapshot.docs.map(doc => {
      try {
        return mapDocToHandler(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map handler document ${doc.id}:`, 
          mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(handler => handler !== null) as Handler[];

    return handlers;
  } catch (error) {
    console.error("[Firestore Error] In getHandlers:", 
      error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function updateHandler(id: string, formData: HandlerFormData): Promise<{ 
  success: boolean; 
  errors?: z.ZodError<HandlerFormData>["formErrors"]; 
  handler?: Handler 
}> {
  const validationResult = HandlerFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In updateHandler:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.flatten() as any };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In updateHandler: Firestore db instance is not available");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly"],
          fieldErrors: {}
        } as any
      };
    }

    const docRef = doc(db, "handlers", id);
    const handlerDataForFirestore = {
      ...validationResult.data,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, handlerDataForFirestore);

    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) {
      return { 
        success: false, 
        errors: { 
          formErrors: ["Failed to retrieve handler after update"], 
          fieldErrors: {} 
        } as any 
      };
    }

    const updatedHandler = mapDocToHandler(updatedDocSnap, updatedDocSnap.id);

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after updating handler ${id}:`, 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, handler: updatedHandler };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore/Server Error] In updateHandler (ID: ${id}):`, errorMessage);
    
    return { 
      success: false, 
      errors: {
        formErrors: [errorMessage || "Failed to update handler"],
        fieldErrors: {}
      } as any
    };
  }
}

export async function deleteHandler(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      console.error("[Firestore Error] In deleteHandler: Firestore db instance is not available");
      return { success: false, error: "Firestore database is not configured correctly" };
    }

    const docRef = doc(db, "handlers", id);
    await deleteDoc(docRef);

    try {
      revalidatePath("/");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after deleting handler ${id}:`, 
        revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore Error] In deleteHandler (ID: ${id}):`, errorMessage);
    return { success: false, error: `Failed to delete handler: ${errorMessage}` };
  }
}

export interface HandlerStats {
  handlerId: string;
  handlerName: string;
  mappedBookings: number;
  bookedByHandler: number;
}

export async function getHandlerStats(): Promise<HandlerStats[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getHandlerStats: Firestore db instance is not available");
      return [];
    }

    const handlersCollection = collection(db, "handlers");
    const bookingsCollection = collection(db, "bookings");
    const bookingRecordsCollection = collection(db, "bookingRecords");
    
    const [handlersSnapshot, bookingsSnapshot, bookingRecordsSnapshot] = await Promise.all([
      getDocs(query(handlersCollection, orderBy("createdAt", "asc"))),
      getDocs(bookingsCollection),
      getDocs(bookingRecordsCollection)
    ]);

    const handlers = handlersSnapshot.docs.map(doc => {
      try {
        return mapDocToHandler(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map handler document ${doc.id}:`, 
          mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(handler => handler !== null) as Handler[];

    const stats: HandlerStats[] = handlers.map(handler => {
      let mappedBookings = 0;
      let bookedByHandler = 0;

      bookingsSnapshot.docs.forEach(bookingDoc => {
        const bookingData = bookingDoc.data();
        
        if (Array.isArray(bookingData.preparedAccounts)) {
          const hasHandlerInAccounts = bookingData.preparedAccounts.some(
            (account: any) => account.handlingBy === handler.name
          );
          if (hasHandlerInAccounts) {
            mappedBookings++;
          }
        }
      });

      bookingRecordsSnapshot.docs.forEach(recordDoc => {
        const recordData = recordDoc.data();
        if (recordData.bookedBy === handler.name) {
          bookedByHandler++;
        }
      });

      return {
        handlerId: handler.id,
        handlerName: handler.name,
        mappedBookings,
        bookedByHandler
      };
    });

    return stats;
  } catch (error) {
    console.error("[Firestore Error] In getHandlerStats:", 
      error instanceof Error ? error.message : String(error));
    return [];
  }
}
