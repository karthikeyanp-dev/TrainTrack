
"use server";

import type { Booking, BookingFormData, BookingStatus, TrainClass } from "@/types/booking";
import { ALL_TRAIN_CLASSES } from "@/types/booking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, Timestamp, type DocumentSnapshot, type DocumentData } from "firebase/firestore";

const ServerBookingFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  destination: z.string().min(1, "Destination is required"),
  journeyDate: z.string().min(1, "Journey date is required"), // Expects YYYY-MM-DD string
  userName: z.string().min(1, "User name is required"),
  passengerDetails: z.string().min(1, "Passenger details are required"),
  bookingDate: z.string().min(1, "Booking date is required"), // Expects YYYY-MM-DD string
  classType: z.enum(ALL_TRAIN_CLASSES, { errorMap: () => ({ message: "Invalid train class selected." }) }),
  trainPreference: z.string().optional(),
  timePreference: z.string().optional(),
});

const toISOStringSafe = (value: any, fieldName: string, bookingId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Booking ID ${bookingId}: Field '${fieldName}' is a string but not a valid date: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for booking ${bookingId}. Expected valid date string, got ${value}`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Booking ID ${bookingId}: Field '${fieldName}' is a number but not a valid date timestamp: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for booking ${bookingId}. Expected valid epoch milliseconds, got ${value}`);
  }
  console.error(`[DataFormatError] Booking ID ${bookingId}: Unexpected type or invalid value for timestamp field '${fieldName}':`, value);
  throw new Error(`Unexpected or invalid format for '${fieldName}' in booking ${bookingId}. Received type ${typeof value}`);
};

const mapDocToBooking = (document: DocumentSnapshot<DocumentData>, id: string): Booking => {
  const data = document.data();
  if (!data) {
    console.error(`[DataError] No data found for document with id ${id} during mapping.`);
    throw new Error(`No data found for document with id ${id}`);
  }

  return {
    id,
    source: data.source as string,
    destination: data.destination as string,
    journeyDate: data.journeyDate as string,
    userName: data.userName as string,
    passengerDetails: data.passengerDetails as string,
    bookingDate: data.bookingDate as string,
    classType: data.classType as TrainClass,
    trainPreference: data.trainPreference as string | undefined,
    timePreference: data.timePreference as string | undefined,
    status: data.status as BookingStatus,
    createdAt: toISOStringSafe(data.createdAt, 'createdAt', id),
    updatedAt: toISOStringSafe(data.updatedAt, 'updatedAt', id),
  };
};


export async function addBooking(formData: BookingFormData): Promise<{ success: boolean; errors?: z.ZodError<BookingFormData>["formErrors"]; booking?: Booking }> {
  const validationResult = ServerBookingFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In addBooking:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.formErrors };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In addBooking: Firestore db instance is not available. Check Firebase configuration and .env variables.");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly. Please contact support or check server logs."],
          fieldErrors: {}
        }
      };
    }

    const bookingDataForFirestore: Record<string, any> = {
      ...validationResult.data,
      status: "Requested" as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    // Remove undefined optional fields so they are not written to Firestore
    if (validationResult.data.trainPreference === undefined) delete bookingDataForFirestore.trainPreference;
    if (validationResult.data.timePreference === undefined) delete bookingDataForFirestore.timePreference;


    const docRef = await addDoc(collection(db, "bookings"), bookingDataForFirestore);

    const now = new Date().toISOString();
    const newBooking: Booking = {
      ...validationResult.data,
      id: docRef.id,
      status: "Requested",
      createdAt: now,
      updatedAt: now,
    };

    try {
      revalidatePath("/");
      revalidatePath("/suggestions");
    } catch (revalidationError) {
      console.warn("[Revalidation Warning] Failed to revalidate paths after adding booking:", revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, booking: newBooking };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Firestore/Server Error] In addBooking:", errorMessage);

    let specificMessage = "An unexpected server error occurred. Failed to save booking request.";

    if (error instanceof Error) {
        const firebaseErrorCode = (error as any)?.code;
        if (firebaseErrorCode === "permission-denied" || error.message.includes("permission-denied")) {
            specificMessage = "Permission denied when trying to save the booking. Please check Firestore security rules or API permissions.";
        } else if (firebaseErrorCode === "unavailable") {
            specificMessage = "The Firestore service is currently unavailable. Please try again later.";
        } else if (errorMessage.trim().length > 0) {
           specificMessage = errorMessage;
        }
    } else if (typeof error === 'string' && error.trim().length > 0) {
        specificMessage = error;
    }

    const errorsPayload: z.ZodError<BookingFormData>["formErrors"] = {
        formErrors: [specificMessage],
        fieldErrors: {}
    };

    return { success: false, errors: errorsPayload };
  }
}

export async function updateBookingById(id: string, formData: BookingFormData): Promise<{ success: boolean; errors?: z.ZodError<BookingFormData>["formErrors"]; booking?: Booking }> {
  const validationResult = ServerBookingFormSchema.safeParse(formData);
  if (!validationResult.success) {
    console.error("[Server Validation Failed] In updateBookingById:", validationResult.error.flatten());
    return { success: false, errors: validationResult.error.formErrors };
  }

  try {
    if (!db) {
      console.error("[Firestore Error] In updateBookingById: Firestore db instance is not available.");
      return {
        success: false,
        errors: {
          formErrors: ["Firestore database is not configured correctly."],
          fieldErrors: {}
        }
      };
    }

    const docRef = doc(db, "bookings", id);
    const bookingDataForFirestore: Record<string, any> = {
      ...validationResult.data,
      updatedAt: serverTimestamp(),
    };
    // Remove undefined optional fields so they are not written to Firestore
    // Or explicitly set them to null if you want to remove them from the document
    if (validationResult.data.trainPreference === undefined) {
       delete bookingDataForFirestore.trainPreference; // Or bookingDataForFirestore.trainPreference = null;
    }
    if (validationResult.data.timePreference === undefined) {
       delete bookingDataForFirestore.timePreference; // Or bookingDataForFirestore.timePreference = null;
    }

    await updateDoc(docRef, bookingDataForFirestore);

    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) {
        return { success: false, errors: { formErrors: ["Failed to retrieve booking after update."], fieldErrors: {} } };
    }
    const updatedBooking = mapDocToBooking(updatedDocSnap, updatedDocSnap.id);


    try {
      revalidatePath("/");
      revalidatePath("/suggestions");
      revalidatePath(`/bookings/edit/${id}`);
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after updating booking ${id}:`, revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, booking: updatedBooking };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore/Server Error] In updateBookingById (ID: ${id}):`, errorMessage);
    let specificMessage = "An unexpected server error occurred. Failed to update booking.";
    if (errorMessage.trim().length > 0) {
        specificMessage = errorMessage;
    }
    const errorsPayload: z.ZodError<BookingFormData>["formErrors"] = {
        formErrors: [specificMessage],
        fieldErrors: {}
    };
    return { success: false, errors: errorsPayload };
  }
}


export async function deleteBooking(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      console.error("[Firestore Error] In deleteBooking: Firestore db instance is not available.");
      return { success: false, error: "Firestore database is not configured correctly." };
    }
    const docRef = doc(db, "bookings", id);
    await deleteDoc(docRef);

    try {
      revalidatePath("/");
      revalidatePath("/suggestions");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after deleting booking ${id}:`, revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firestore Error] In deleteBooking (ID: ${id}):`, errorMessage);
    return { success: false, error: `Failed to delete booking: ${errorMessage}` };
  }
}


export async function getBookings(): Promise<Booking[]> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getBookings: Firestore db instance is not available. Check Firebase configuration.");
      return [];
    }
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const bookings = querySnapshot.docs.map(doc => {
      try {
        return mapDocToBooking(doc, doc.id);
      } catch (mapError) {
        console.error(`[Mapping Error] Failed to map document ${doc.id}:`, mapError instanceof Error ? mapError.message : String(mapError));
        return null;
      }
    }).filter(booking => booking !== null) as Booking[];

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] In getBookings:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function getBookingById(id: string): Promise<Booking | null> {
  try {
    if (!db) {
      console.error("[Firestore Error] In getBookingById: Firestore db instance is not available.");
      return null;
    }
    const docRef = doc(db, "bookings", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapDocToBooking(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] In getBookingById (ID: ${id}):`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.message.includes("Invalid date format")) {
        throw error;
    }
    return null;
  }
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | null> {
 try {
    if (!db) {
      console.error("[Firestore Error] In updateBookingStatus: Firestore db instance is not available.");
      return null;
    }
    const docRef = doc(db, "bookings", id);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    try {
      revalidatePath("/");
      revalidatePath("/suggestions");
    } catch (revalidationError) {
      console.warn(`[Revalidation Warning] Failed to revalidate paths after updating booking ${id}:`, revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] In updateBookingStatus (ID: ${id}, Status: ${status}):`, error instanceof Error ? error.message : String(error));
     if (error instanceof Error && error.message.includes("Invalid date format")) {
        throw error;
    }
    return null;
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
      trainPreference: b.trainPreference,
      timePreference: b.timePreference,
      status: b.status,
    }));
    return JSON.stringify(simplifiedBookings);
  } catch (error) {
    console.error("[Error] In getAllBookingsAsJsonString:", error instanceof Error ? error.message : String(error));
    return JSON.stringify([]);
  }
}
