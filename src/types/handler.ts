export type HandlerPaymentType = "settlement" | "na";

export interface HandlerPaymentRecord {
  id: string;
  type: HandlerPaymentType;
  amount: number;
  notes?: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
}

export interface Handler {
  id: string;
  name: string;
  /** Opening or base pending amount owed to handler as of trackingStartDate */
  initialPendingAmount?: number;
  /** Total amount the business has repaid this handler for bookings since trackingStartDate */
  settledAmount?: number;
  /** Total amount of NA (Not Applicable / Business-Funded Wallet) adjustments */
  naAmount?: number;
  /** Individual recorded payment transactions (Settlement and NA) */
  payments?: HandlerPaymentRecord[];
  /** ISO timestamp when payment tracking / pending balance was set or reset */
  trackingStartDate?: string;
  /** YYYY-MM-DD of the most recent settlement */
  lastSettledDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HandlerFormData {
  name: string;
  initialPendingAmount?: number;
}

