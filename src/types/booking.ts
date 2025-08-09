

export type BookingStatus = "Requested" | "Booked" | "Missed" | "Booking Failed" | "User Cancelled";

export const ALL_BOOKING_STATUSES: BookingStatus[] = ["Requested", "Booked", "Missed", "Booking Failed", "User Cancelled"];

export type TrainClass = "SL" | "3A" | "2A" | "1A" | "2S" | "EC" | "CC" | "UR";

export const ALL_TRAIN_CLASSES: TrainClass[] = ["SL", "3A", "2A", "1A", "2S", "EC", "CC", "UR"];

export type PassengerGender = "M" | "F" | "O";
export const ALL_PASSENGER_GENDERS: PassengerGender[] = ["M", "F", "O"];

export type BookingType = "Tatkal" | "Regular";
export const ALL_BOOKING_TYPES: BookingType[] = ["Tatkal", "Regular"];


export interface Passenger {
  name: string;
  age: number;
  gender: PassengerGender;
}

export interface Booking {
  id: string;
  source: string;
  destination: string;
  journeyDate: string; // ISO string YYYY-MM-DD
  userName: string;
  passengers: Passenger[]; // Replaces passengerDetails
  bookingDate: string; // ISO string YYYY-MM-DD (date by which it needs to be booked)
  classType: TrainClass;
  bookingType: BookingType;
  trainPreference?: string; // Optional
  timePreference?: string; // Optional
  status: BookingStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export type BookingFormData = Omit<Booking, "id" | "createdAt" | "updatedAt" | "status">;
