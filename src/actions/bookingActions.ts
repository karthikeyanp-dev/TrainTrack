
"use server";

import type { Booking, BookingFormData, BookingStatus } from "@/types/booking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/firebase"; // Ensure db is correctly initialized
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy, Timestamp } from "firebase/firestore";

// This schema is used for server-side validation within addBooking
const ServerBookingFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  destination: z.string().min(1, "Destination is required"),
  journeyDate: z.string().min(1, "Journey date is required"), // Expects YYYY-MM-DD string
  userName: z.string().min(1, "User name is required"),
  passengerDetails: z.string().min(1, "Passenger details are required"),
  bookingDate: z.string().min(1, "Booking date is required"), // Expects YYYY-MM-DD string
});

// Helper to convert Firestore document data to Booking type
const mapDocToBooking = (document: any, id: string): Booking => {
  const data = document.data();
  return {
    id,
    source: data.source,
    destination: data.destination,
    journeyDate: data.journeyDate,
    userName: data.userName,
    passengerDetails: data.passengerDetails,
    bookingDate: data.bookingDate,
    status: data.status,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString(),
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
      // Log revalidation errors but don't let them crash the main operation response
      console.warn("[Revalidation Warning] Failed to revalidate paths after booking:", revalidationError instanceof Error ? revalidationError.message : String(revalidationError));
    }

    return { success: true, booking: newBooking };

  } catch (error: unknown) {
    // Ensure the logged error message is simple
    console.error("[Firestore/Server Error] In addBooking:", error instanceof Error ? error.message : String(error));

    let specificMessage = "An unexpected server error occurred. Failed to save booking request.";

    if (error instanceof Error) {
        const firebaseErrorCode = (error as any)?.code;
        if (firebaseErrorCode === "permission-denied" || error.message.includes("permission-denied")) {
            specificMessage = "Permission denied when trying to save the booking. Please check Firestore security rules or API permissions.";
        } else if (firebaseErrorCode === "unavailable") {
            specificMessage = "The Firestore service is currently unavailable. Please try again later.";
        } else {
           specificMessage = error.message || "Could not save booking.";
        }
    } else if (typeof error === 'string' && error.trim().length > 0) {
        specificMessage = error;
    } else {
        specificMessage = "An unknown server error occurred while processing the booking.";
    }

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
    const bookings = querySnapshot.docs.map(doc => mapDocToBooking(doc, doc.id));
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
    return null;
  }
}

export async function getAllBookingsAsJsonString(): Promise<string> {
  try {
    const currentBookings = await getBookings();
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

