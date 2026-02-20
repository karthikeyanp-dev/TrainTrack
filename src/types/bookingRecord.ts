
export const ALL_PAYMENT_METHODS = ["Wallet", "UPI", "Others"] as const;
export type PaymentMethod = typeof ALL_PAYMENT_METHODS[number];

export interface BookingRecord {
  id: string;
  bookingId: string;        // Reference to the booking (primary for single, first booking for group)
  bookingIds?: string[];    // For group bookings - array of all booking IDs
  groupId?: string;         // For group bookings - reference to the booking group
  bookedBy: string;         // Person who initiated the booking
  bookedAccountUsername: string;  // IRCTC account username used
  amountCharged: number;    // Final transaction cost (total for group)
  methodUsed: PaymentMethod;
  createdAt: string;        // ISO string
  updatedAt: string;        // ISO string
}

export type BookingRecordFormData = Omit<BookingRecord, "id" | "createdAt" | "updatedAt">;
