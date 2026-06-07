
export interface IrctcAccount {
  id: string;
  username: string;
  password: string;      // stored for authentication only
  walletAmount: number;  // current balance
  lastBookedDate: string; // ISO date string: "YYYY-MM-DD"
  previousLastBookedDate?: string; // Stored previous lastBookedDate for reverting
  // The `bookingTransactionId` of the booking record that last updated
  // lastBookedDate (this is the transaction id, not the Firestore document id).
  // Used by revert paths to identify which record should roll back the
  // account's lastBookedDate. `bookingDate` alone is not unique — multiple
  // records can share the same date.
  lastBookedRecordId?: string;
  createdAt: string;     // ISO string
  updatedAt: string;     // ISO string
}

export type AccountFormData = Omit<IrctcAccount, "id" | "createdAt" | "updatedAt">;
