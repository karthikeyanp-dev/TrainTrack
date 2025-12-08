
export type PaymentMethod = "Wallet" | "UPI" | "Others";

export const ALL_PAYMENT_METHODS: PaymentMethod[] = ["Wallet", "UPI", "Others"];

export interface BookingRecord {
  id: string;
  bookingId: string;        // Reference to the booking
  bookedBy: string;         // Person who initiated the booking
  bookedAccountUsername: string;  // IRCTC account username used
  amountCharged: number;    // Final transaction cost
  methodUsed: PaymentMethod;
  createdAt: string;        // ISO string
  updatedAt: string;        // ISO string
}

export type BookingRecordFormData = Omit<BookingRecord, "id" | "createdAt" | "updatedAt">;
