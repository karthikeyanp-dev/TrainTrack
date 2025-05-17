"use server";

import type { Booking, BookingFormData, BookingStatus } from "@/types/booking";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// In-memory store for bookings
let bookings: Booking[] = [
  {
    id: "1",
    source: "New York",
    destination: "Boston",
    journeyDate: "2024-08-15",
    userName: "Alice Smith",
    passengerDetails: "Alice Smith (Adult)",
    bookingDate: "2024-08-01",
    status: "Requested",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    source: "London",
    destination: "Paris",
    journeyDate: "2024-07-20", // Past date
    userName: "Bob Johnson",
    passengerDetails: "Bob Johnson (Adult), Jane Johnson (Child)",
    bookingDate: "2024-07-10",
    status: "Booked",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    source: "Tokyo",
    destination: "Kyoto",
    journeyDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Future date
    userName: "Kenji Tanaka",
    passengerDetails: "Kenji Tanaka (Adult)",
    bookingDate: new Date().toISOString().split('T')[0],
    status: "Requested",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "4",
    source: "Berlin",
    destination: "Munich",
    journeyDate: new Date().toISOString().split('T')[0], // Today
    userName: "Greta Muller",
    passengerDetails: "Greta Muller (Adult)",
    bookingDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Past booking date
    status: "Booking Failed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const BookingFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  destination: z.string().min(1, "Destination is required"),
  journeyDate: z.string().min(1, "Journey date is required"),
  userName: z.string().min(1, "User name is required"),
  passengerDetails: z.string().min(1, "Passenger details are required"),
  bookingDate: z.string().min(1, "Booking date is required"),
});


export async function addBooking(formData: BookingFormData): Promise<{ success: boolean; errors?: z.ZodError<BookingFormData>["formErrors"]; booking?: Booking }> {
  const validationResult = BookingFormSchema.safeParse(formData);
  if (!validationResult.success) {
    return { success: false, errors: validationResult.error.formErrors };
  }
  
  const newBooking: Booking = {
    ...validationResult.data,
    id: String(Date.now()), // Simple unique ID
    status: "Requested",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  bookings.push(newBooking);
  revalidatePath("/"); // Revalidate dashboard to show new booking
  revalidatePath("/suggestions"); // Revalidate suggestions page if it uses bookings
  return { success: true, booking: newBooking };
}

export async function getBookings(): Promise<Booking[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return JSON.parse(JSON.stringify(bookings)); // Return a copy to avoid direct mutation
}

export async function getBookingById(id: string): Promise<Booking | null> {
  await new Promise(resolve => setTimeout(resolve, 200));
  const booking = bookings.find(b => b.id === id);
  return booking ? JSON.parse(JSON.stringify(booking)) : null;
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<Booking | null> {
  const bookingIndex = bookings.findIndex(b => b.id === id);
  if (bookingIndex === -1) {
    return null;
  }
  bookings[bookingIndex] = {
    ...bookings[bookingIndex],
    status,
    updatedAt: new Date().toISOString(),
  };
  revalidatePath("/");
  revalidatePath("/suggestions");
  return JSON.parse(JSON.stringify(bookings[bookingIndex]));
}

// Helper to get a plain string for AI input
export async function getAllBookingsAsJsonString(): Promise<string> {
  const currentBookings = await getBookings();
  return JSON.stringify(currentBookings.map(b => ({
    source: b.source,
    destination: b.destination,
    journeyDate: b.journeyDate,
    status: b.status,
  })));
}
