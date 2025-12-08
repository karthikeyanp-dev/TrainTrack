
export interface IrctcAccount {
  id: string;
  username: string;
  password: string;      // stored for authentication only
  walletAmount: number;  // current balance
  lastBookedDate: string; // ISO date string: "YYYY-MM-DD"
  createdAt: string;     // ISO string
  updatedAt: string;     // ISO string
}

export type AccountFormData = Omit<IrctcAccount, "id" | "createdAt" | "updatedAt">;
