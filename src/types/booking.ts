
export type BookingStatus = "Requested" | "Booked" | "Missed" | "Booking Failed" | "User Cancelled";

export const ALL_BOOKING_STATUSES: BookingStatus[] = ["Requested", "Booked", "Missed", "Booking Failed", "User Cancelled"];

export type TrainClass = "SL" | "3A" | "2A" | "1A" | "2S" | "EC" | "CC" | "UR";

export const ALL_TRAIN_CLASSES: TrainClass[] = ["SL", "3A", "2A", "1A", "2S", "EC", "CC", "UR"];

export interface Booking {
  id: string;
  source: string;
  destination: string;
  journeyDate: string; // ISO string YYYY-MM-DD
  userName: string;
  passengerDetails: string; // Text area for passenger names, ages, etc.
  bookingDate: string; // ISO string YYYY-MM-DD (date by which it needs to be booked)
  classType: TrainClass;
  trainPreference?: string; // Optional
  timePreference?: string; // Optional
  status: BookingStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type BookingFormData = Omit<Booking, "id" | "createdAt" | "updatedAt" | "status">;
