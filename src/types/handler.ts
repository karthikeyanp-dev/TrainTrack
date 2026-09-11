export interface Handler {
  id: string;
  name: string;
  /** Total amount the business has repaid this handler for out-of-pocket (UPI/Others) bookings */
  settledAmount?: number;
  /** YYYY-MM-DD of the most recent settlement */
  lastSettledDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HandlerFormData {
  name: string;
}
