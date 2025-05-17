
"use server";

import type { Booking, BookingFormData, BookingStatus } from "@/types/booking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/firebase"; // Ensure db is correctly initialized
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy, Timestamp, type DocumentSnapshot, type DocumentData } from "firebase/firestore";

// This schema is used for server-side validation within addBooking
const ServerBookingFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  destination: z.string().min(1, "Destination is required"),
  journeyDate: z.string().min(1, "Journey date is required"), // Expects YYYY-MM-DD string
  userName: z.string().min(1, "User name is required"),
  passengerDetails: z.string().min(1, "Passenger details are required"),
  bookingDate: z.string().min(1, "Booking date is required"), // Expects YYYY-MM-DD string
});

// Helper to safely convert Firestore Timestamps or other date representations to ISO string
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
    // Potentially throw, or return a default/error indicator depending on desired strictness
    // For now, re-throwing helps surface the issue.
    throw new Error(`Invalid date format in '${fieldName}' for booking ${bookingId}. Expected valid date string, got ${value}`);
  }
  if (typeof value === 'number') { // Handle milliseconds epoch
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Booking ID ${bookingId}: Field '${fieldName}' is a number but not a valid date timestamp: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}' for booking ${bookingId}. Expected valid epoch milliseconds, got ${value}`);
  }
  // If it's not a Timestamp, string, or number, or if string/number conversion failed
  console.error(`[DataFormatError] Booking ID ${bookingId}: Unexpected type or invalid value for timestamp field '${fieldName}':`, value);
  throw new Error(`Unexpected or invalid format for '${fieldName}' in booking ${bookingId}. Received type ${typeof value}`);
};


// Helper to convert Firestore document data to Booking type
const mapDocToBooking = (document: DocumentSnapshot<DocumentData>, id: string): Booking => {
  const data = document.data();
  if (!data) {
    // This case should ideally not happen if docSnap.exists() is true,
    // but good for type safety and robustness.
    console.error(`[DataError] No data found for document with id ${id} during mapping.`);
    throw new Error(`No data found for document with id ${id}`);
  }
  
  return {
    id,
    source: data.source as string,
    destination: data.destination as string,
    journeyDate: data.journeyDate as string, // Assumed string from form
    userName: data.userName as string,
    passengerDetails: data.passengerDetails as string,
    bookingDate: data.bookingDate as string, // Assumed string from form
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

    const bookingDataForFirestore = {
      ...validationResult.data,
      status: "Requested" as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "bookings"), bookingDataForFirestore);

    // For immediate feedback, we might use current client time, but Firestore timestamps are preferred for consistency.
    // The `mapDocToBooking` will handle server timestamps upon fetching.
    // For the returned booking, we can simulate what it would look like.
    // A more robust approach would be to re-fetch the document, but for add, this is often acceptable.
    const now = new Date().toISOString(); 
    const newBooking: Booking = {
      ...validationResult.data,
      id: docRef.id,
      status: "Requested",
      // These will be slightly different from serverTimestamps but okay for immediate UI update.
      // The re-fetch on page load/revalidation will get the server-generated ones.
      createdAt: now, 
      updatedAt: now,
    };

    try {
      revalidatePath("/");
      revalidatePath("/suggestions");
    } catch (revalidationError) {
      // Log revalidation errors but don't let them crash the main operation response
      console.warn("[Revalidation Warning] Failed to revalidate paths after booking:", revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, booking: newBooking };

  } catch (error: unknown) {
    // Ensure the logged error message is simple
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
    // Removed redundant else block for specificMessage

    const errorsPayload: z.ZodError<BookingFormData>["formErrors"] = {
        formErrors: [specificMessage],
        fieldErrors: {}
    };

    return { success: false, errors: errorsPayload };
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
        return null; // Or handle differently, e.g., filter out or return a placeholder
      }
    }).filter(booking => booking !== null) as Booking[]; // Filter out any nulls from mapping errors

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] In getBookings:", error instanceof Error ? error.message : String(error));
    // Optionally re-throw or return a custom error object if the client needs to know
    return []; // Return empty array on error to prevent breaking the page
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
        // Propagate specific data format errors if needed
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

    const updatedDocSnap = await getDoc(docRef); // Re-fetch to get the updated document with new server timestamp
    if (updatedDocSnap.exists()) {
      return mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    }
    return null; // Should not happen if update was successful and doc existed
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
    const currentBookings = await getBookings(); // This will now use the more robust getBookings
    // Ensure only relevant, simple fields are stringified
    const simplifiedBookings = currentBookings.map(b => ({
      source: b.source,
      destination: b.destination,
      journeyDate: b.journeyDate, // Should be YYYY-MM-DD string
      status: b.status,
    }));
    return JSON.stringify(simplifiedBookings);
  } catch (error) {
    console.error("[Error] In getAllBookingsAsJsonString:", error instanceof Error ? error.message : String(error));
    return JSON.stringify([]); // Return empty array string on error
  }
}
