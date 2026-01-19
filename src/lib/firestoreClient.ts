/**
 * Client-side Firestore operations
 * Replaces Server Actions with direct Firestore calls from browser
 * This eliminates Cloud Run costs - only Firebase Hosting (free) + Firestore reads/writes
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
  where,
  Timestamp,
  type DocumentSnapshot,
  type DocumentData,
  deleteField
} from "firebase/firestore";
import type { 
  Booking, 
  BookingFormData, 
  BookingStatus, 
  Passenger,
  PreparedAccount 
} from "@/types/booking";

// Helper to convert Firestore timestamps
const toISOStringSafe = (value: any, fieldName: string, bookingId: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    console.error(`[DataFormatError] Booking ID ${bookingId}: Field '${fieldName}' is invalid: ${value}`);
    throw new Error(`Invalid date format in '${fieldName}'`);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  console.error(`[DataFormatError] Booking ID ${bookingId}: Unexpected type for '${fieldName}':`, value);
  throw new Error(`Unexpected format for '${fieldName}'`);
};

// Map Firestore document to Booking type
const mapDocToBooking = (document: DocumentSnapshot<DocumentData>, id: string): Booking => {
  const data = document.data();
  if (!data) {
    throw new Error(`No data found for document with id ${id}`);
  }

  return {
    id,
    source: data.source as string,
    destination: data.destination as string,
    journeyDate: data.journeyDate as string,
    userName: data.userName as string,
    passengers: Array.isArray(data.passengers) ? data.passengers as Passenger[] : [],
    bookingDate: data.bookingDate as string,
    classType: data.classType,
    bookingType: data.bookingType || "Tatkal",
    trainPreference: data.trainPreference as string | undefined,
    remarks: (data.remarks || data.timePreference) as string | undefined,
    status: data.status as BookingStatus,
    statusReason: data.statusReason as string | undefined,
    statusHandler: data.statusHandler as string | undefined,
    createdAt: toISOStringSafe(data.createdAt, "createdAt", id),
    updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", id),
    preparedAccounts: Array.isArray(data.preparedAccounts) ? (data.preparedAccounts as PreparedAccount[]) : undefined,
  };
};

// ============= BOOKING OPERATIONS =============

export async function getBookings(): Promise<Booking[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const bookings = querySnapshot.docs
      .map(doc => {
        try {
          return mapDocToBooking(doc, doc.id);
        } catch (error) {
          console.error(`Failed to map document ${doc.id}:`, error);
          return null;
        }
      })
      .filter(booking => booking !== null) as Booking[];

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] getBookings:", error);
    return [];
  }
}

export async function getPendingBookings(): Promise<Booking[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, where("status", "==", "Requested"));
    const querySnapshot = await getDocs(q);

    const bookings = querySnapshot.docs
      .map(doc => {
        try {
          return mapDocToBooking(doc, doc.id);
        } catch (error) {
          console.error(`Failed to map document ${doc.id}:`, error);
          return null;
        }
      })
      .filter(booking => booking !== null) as Booking[];

    // Sort by journey date
    bookings.sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

    return bookings;
  } catch (error) {
    console.error("[Firestore Error] getPendingBookings:", error);
    return [];
  }
}

export async function getBookingById(id: string): Promise<Booking | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const docRef = doc(db, "bookings", id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return mapDocToBooking(docSnap, docSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] getBookingById (${id}):`, error);
    return null;
  }
}

export async function getDistinctBookingDates(): Promise<string[]> {
  try {
    const allBookings = await getBookings();
    const dateSet = new Set<string>();
    allBookings.forEach(booking => {
      dateSet.add(booking.bookingDate);
    });
    return Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  } catch (error) {
    console.error("[Firestore Error] getDistinctBookingDates:", error);
    return [];
  }
}

export async function addBooking(formData: BookingFormData): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const bookingData: Record<string, any> = {
      ...formData,
      status: "Requested" as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "bookings"), bookingData);

    const now = new Date().toISOString();
    const newBooking: Booking = {
      ...formData,
      passengers: formData.passengers.map(p => ({ ...p, age: Number(p.age) })),
      id: docRef.id,
      status: "Requested",
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, booking: newBooking };
  } catch (error: any) {
    console.error("[Firestore Error] addBooking:", error);
    return { success: false, error: error.message || "Failed to add booking" };
  }
}

export async function updateBookingById(id: string, formData: BookingFormData): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    const bookingData: Record<string, any> = {
      ...formData,
      passengers: formData.passengers.map(p => ({ ...p, age: Number(p.age) })),
      updatedAt: serverTimestamp(),
    };

    if (!formData.trainPreference) {
      bookingData.trainPreference = deleteField();
    }
    if (!formData.remarks) {
      bookingData.remarks = deleteField();
    }

    await updateDoc(docRef, bookingData);

    const updatedDocSnap = await getDoc(docRef);
    if (!updatedDocSnap.exists()) {
      return { success: false, error: "Failed to retrieve booking after update" };
    }

    const updatedBooking = mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    return { success: true, booking: updatedBooking };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingById (${id}):`, error);
    return { success: false, error: error.message || "Failed to update booking" };
  }
}

export async function deleteBooking(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBooking (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete booking" };
  }
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  reason?: string,
  handler?: string
): Promise<Booking | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const docRef = doc(db, "bookings", id);
    const updateData: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (reason !== undefined && reason.trim() !== '') {
      updateData.statusReason = reason.trim();
    } else if (reason === '') {
      updateData.statusReason = deleteField();
    }

    if (handler !== undefined && handler.trim() !== "") {
      updateData.statusHandler = handler.trim();
    } else if (handler === "") {
      updateData.statusHandler = deleteField();
    }

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      return mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
    }
    return null;
  } catch (error) {
    console.error(`[Firestore Error] updateBookingStatus (${id}):`, error);
    return null;
  }
}

export async function updateBookingRequirements(
  id: string,
  preparedAccounts: PreparedAccount[]
): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookings", id);
    
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    
    if (preparedAccounts.length === 0) {
      updateData.preparedAccounts = deleteField();
    } else {
      updateData.preparedAccounts = preparedAccounts;
    }

    await updateDoc(docRef, updateData);

    const updatedDocSnap = await getDoc(docRef);
    if (updatedDocSnap.exists()) {
      const updatedBooking = mapDocToBooking(updatedDocSnap, updatedDocSnap.id);
      return { success: true, booking: updatedBooking };
    }
    
    return { success: false, error: "Failed to retrieve booking after update" };
  } catch (error: any) {
    console.error(`[Firestore Error] updateBookingRequirements (${id}):`, error);
    return { 
      success: false, 
      error: error.message || "Failed to update booking requirements" 
    };
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
      bookingType: b.bookingType,
      passengers: b.passengers.map(p => `${p.name} ${p.age} ${p.gender}`).join(', '),
      trainPreference: b.trainPreference,
      remarks: b.remarks,
      status: b.status,
    }));
    return JSON.stringify(simplifiedBookings);
  } catch (error) {
    console.error("[Error] getAllBookingsAsJsonString:", error);
    return JSON.stringify([]);
  }
}

// ============= BOOKING RECORD OPERATIONS =============

export async function getBookingRecordByBookingId(bookingId: string): Promise<any | null> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return null;
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");
    const q = query(recordsCollection, where("bookingId", "==", bookingId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    // Return the first matching record
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    
    return {
      id: docSnap.id,
      bookingId: data.bookingId,
      bookedBy: data.bookedBy,
      bookedAccountUsername: data.bookedAccountUsername,
      amountCharged: data.amountCharged,
      methodUsed: data.methodUsed,
      createdAt: toISOStringSafe(data.createdAt, "createdAt", docSnap.id),
      updatedAt: toISOStringSafe(data.updatedAt, "updatedAt", docSnap.id),
    };
  } catch (error) {
    console.error(`[Firestore Error] getBookingRecordByBookingId (${bookingId}):`, error);
    return null;
  }
}

export async function saveBookingRecord(data: {
  bookingId: string;
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: number;
  methodUsed: string;
}): Promise<{ success: boolean; error?: string; record?: any; errors?: any }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const recordsCollection = collection(db, "bookingRecords");
    
    // Check if a record already exists for this booking
    const q = query(recordsCollection, where("bookingId", "==", data.bookingId));
    const querySnapshot = await getDocs(q);

    const recordData = {
      bookingId: data.bookingId,
      bookedBy: data.bookedBy,
      bookedAccountUsername: data.bookedAccountUsername,
      amountCharged: data.amountCharged,
      methodUsed: data.methodUsed,
      updatedAt: serverTimestamp(),
    };

    let docId: string;

    if (!querySnapshot.empty) {
      // Update existing record
      const existingDoc = querySnapshot.docs[0];
      docId = existingDoc.id;
      await updateDoc(doc(db, "bookingRecords", docId), recordData);
    } else {
      // Create new record
      const docRef = await addDoc(recordsCollection, {
        ...recordData,
        createdAt: serverTimestamp(),
      });
      docId = docRef.id;
    }

    // Retrieve the saved record
    const savedDoc = await getDoc(doc(db, "bookingRecords", docId));
    if (!savedDoc.exists()) {
      return { success: false, error: "Failed to retrieve saved record" };
    }

    const savedData = savedDoc.data();
    const record = {
      id: savedDoc.id,
      bookingId: savedData.bookingId,
      bookedBy: savedData.bookedBy,
      bookedAccountUsername: savedData.bookedAccountUsername,
      amountCharged: savedData.amountCharged,
      methodUsed: savedData.methodUsed,
      createdAt: toISOStringSafe(savedData.createdAt, "createdAt", savedDoc.id),
      updatedAt: toISOStringSafe(savedData.updatedAt, "updatedAt", savedDoc.id),
    };

    return { success: true, record };
  } catch (error: any) {
    console.error("[Firestore Error] saveBookingRecord:", error);
    return { success: false, error: error.message || "Failed to save booking record" };
  }
}

export async function deleteBookingRecord(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "bookingRecords", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteBookingRecord (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete booking record" };
  }
}
