
"use server";

import type { Booking, BookingFormData, BookingStatus } from "@/types/booking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/firebase";
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
    journeyDate: data.journeyDate, // Assuming stored as YYYY-MM-DD string
    userName: data.userName,
    passengerDetails: data.passengerDetails,
    bookingDate: data.bookingDate, // Assuming stored as YYYY-MM-DD string
    status: data.status,
    // Convert Firestore Timestamps to ISO strings if they exist
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : new Date(data.updatedAt).toISOString(),
  };
};


export async function addBooking(formData: BookingFormData): Promise<{ success: boolean; errors?: z.ZodError<BookingFormData>["formErrors"]; booking?: Booking }> {
  const validationResult = ServerBookingFormSchema.safeParse(formData);
  if (!validationResult.success) {
    return { success: false, errors: validationResult.error.formErrors };
  }
  
  try {
    const bookingDataForFirestore = {
      ...validationResult.data,
      status: "Requested" as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, "bookings"), bookingDataForFirestore);
    
    // For the return object, we need to simulate what the object would look like with actual dates
    // serverTimestamp() is a sentinel value, not an actual date yet.
    // We'll use current date for immediate feedback, Firestore will have the accurate server time.
    const now = new Date().toISOString();

    const newBooking: Booking = {
      ...validationResult.data,
      id: docRef.id,
      status: "Requested",
      createdAt: now, 
      updatedAt: now,
    };

    revalidatePath("/");
    revalidatePath("/suggestions");
    return { success: true, booking: newBooking };
  } catch (error) {
    console.error("Error adding booking to Firestore:", error);
    // It's good practice to map specific Firestore errors to user-friendly messages if possible
    let errorMessage = "Failed to save booking request due to a server error.";
    if (error instanceof Error && error.message.includes("permission-denied")) {
        errorMessage = "You do not have permission to save bookings. Please check Firestore rules."
    }
    return { success: false, errors: { formErrors: [errorMessage], fieldErrors: {} } };
  }
}

export async function getBookings(): Promise<Booking[]> {
  try {
    // Consider adding orderBy, e.g., orderBy("journeyDate", "asc") or orderBy("createdAt", "desc")
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, orderBy("createdAt", "desc")); // Order by creation date, newest first
    const querySnapshot = await getDocs(q);
    const bookings = querySnapshot.docs.map(doc => mapDocToBooking(doc, doc.id));
    return bookings;
  } catch (error) {
    console.error("Error fetching bookings from Firestore:", error);
    return []; // Return empty array on error
  }
}

export async function getBookingById(id: string): Promise<Booking | null> {
  try {
    const docRef = doc(db, "bookings", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapDocToBooking(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error("Error fetching booking by ID from Firestore:", error);
    return null;
  }
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | null> {
 try {
    const docRef = doc(db, "bookings", id);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    revalidatePath("/");
    revalidatePath("/suggestions");
    // Fetch the updated document to return it
    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    }
    return null; // Should not happen if update was successful
  } catch (error) {
    console.error("Error updating booking status in Firestore:", error);
    return null;
  }
}

export async function getAllBookingsAsJsonString(): Promise<string> {
  const currentBookings = await getBookings(); // This now fetches from Firestore
  return JSON.stringify(currentBookings.map(b => ({
    source: b.source,
    destination: b.destination,
    journeyDate: b.journeyDate,
    status: b.status,
  })));
}
