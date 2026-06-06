
export interface IrctcAccount {
  id: string;
  username: string;
  password: string;      // stored for authentication only
  walletAmount: number;  // current balance
  lastBookedDate: string; // ISO date string: "YYYY-MM-DD"
  previousLastBookedDate?: string; // Stored previous lastBookedDate for reverting
  // Unambiguous marker (booking record id / transaction id) of the booking
  // record that last updated lastBookedDate. Used by revert paths to identify
  // which record should roll back the account's lastBookedDate. `bookingDate`
  // alone is not unique — multiple records can share the same date.
  lastBookedRecordId?: string;
  createdAt: string;     // ISO string
  updatedAt: string;     // ISO string
}

export type AccountFormData = Omit<IrctcAccount, "id" | "createdAt" | "updatedAt">;
