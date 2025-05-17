
export type BookingStatus = "Requested" | "Booked" | "Missed" | "Booking Failed" | "User Cancelled";

export const ALL_BOOKING_STATUSES: BookingStatus[] = ["Requested", "Booked", "Missed", "Booking Failed", "User Cancelled"];

export interface Booking {
  id: string;
  source: string;
  destination: string;
  journeyDate: string; // ISO string YYYY-MM-DD
  userName: string;
  passengerDetails: string; // Text area for passenger names, ages, etc.
  bookingDate: string; // ISO string YYYY-MM-DD (date by which it needs to be booked)
  status: BookingStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type BookingFormData = Omit<Booking, "id" | "createdAt" | "updatedAt" | "status">;
