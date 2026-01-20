

export const ALL_BOOKING_STATUSES = ["Requested", "Booked", "Missed", "Booking Failed (Paid)", "Booking Failed (Unpaid)", "CNF & Cancelled", "User Cancelled"] as const;
export type BookingStatus = typeof ALL_BOOKING_STATUSES[number];

export const ALL_TRAIN_CLASSES = ["SL", "3A", "2A", "1A", "2S", "EC", "CC", "CC (Veg)", "CC (Non Veg)", "CC (No Food)", "UR"] as const;
export type TrainClass = typeof ALL_TRAIN_CLASSES[number];

// Legacy class names for backward compatibility with existing bookings
export const LEGACY_CLASS_MAP: Record<string, TrainClass> = {
  "CC w Food": "CC",
  "CC w/o Food": "CC (No Food)",
} as const;

export const ALL_PASSENGER_GENDERS = ["M", "F", "O"] as const;
export type PassengerGender = typeof ALL_PASSENGER_GENDERS[number];

export const ALL_BOOKING_TYPES = ["Tatkal", "General"] as const;
export type BookingType = typeof ALL_BOOKING_TYPES[number];


export interface Passenger {
  name: string;
  age: number;
  gender: PassengerGender;
  berthRequired?: boolean; // For child passengers aged 5-11
}

export interface PreparedAccount {
  username: string;
  password: string;
  isMasterAdded: boolean;
  isWalletLoaded: boolean;
  walletAmount?: number;
  handlingBy?: string;
}

export interface RefundDetails {
  amount: number;
  date: string; // ISO string YYYY-MM-DD
  method: string;
  accountId: string;
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
  remarks?: string; // Optional
  status: BookingStatus;
  statusReason?: string; // Optional reason for status like Missed or Booking Failed
  statusHandler?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  preparedAccounts?: PreparedAccount[]; // Optional array of prepared accounts for booking requirements
  refundDetails?: RefundDetails;
}

export type BookingFormData = Omit<Booking, "id" | "createdAt" | "updatedAt" | "status" | "preparedAccounts">;

    
