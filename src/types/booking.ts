

export const ALL_BOOKING_STATUSES = ["Requested", "Booked", "Missed", "Booking Failed (Paid)", "Booking Failed (Unpaid)", "CNF & Cancelled", "User Cancelled"] as const;
export type BookingStatus = typeof ALL_BOOKING_STATUSES[number];

export const ALL_TRAIN_CLASSES = ["SL", "3A", "2A", "1A", "2S", "3E", "EC", "CC", "CC (Veg)", "CC (Non Veg)", "CC (No Food)", "UR"] as const;
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
  // Stable passenger id. Assigned lazily the first time a passenger of the
  // booking is cancelled, so cancellations can reference passengers even after
  // the booking is edited. (Named `pid`, not `id`, because react-hook-form's
  // useFieldArray reserves `id`.)
  pid?: string;
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

/**
 * Legacy single-refund shape. Still read from old bookings (see
 * `getCancellations()` in `src/lib/cancellations.ts`) but never written — new
 * refunds live in `Booking.cancellations`.
 */
export interface RefundDetails {
  amount: number;
  date: string; // ISO string YYYY-MM-DD
  method: string;
  accountId: string;
}

// ----- Cancellations & refunds -----

/** Leg 1: IRCTC returning the money to wherever the ticket was paid from. */
export const ALL_IRCTC_REFUND_STATUSES = ["Pending", "Received", "No Refund"] as const;
export type IrctcRefundStatus = typeof ALL_IRCTC_REFUND_STATUSES[number];

/** Leg 2: the business paying the customer back. */
export const ALL_CUSTOMER_REFUND_STATUSES = ["Pending", "Paid", "Not Applicable"] as const;
export type CustomerRefundStatus = typeof ALL_CUSTOMER_REFUND_STATUSES[number];

/** Who ends up holding the IRCTC refund. */
export const ALL_REFUND_RECIPIENT_TYPES = ["Wallet", "Handler", "Other"] as const;
export type RefundRecipientType = typeof ALL_REFUND_RECIPIENT_TYPES[number];

export interface IrctcRefundLeg {
  status: IrctcRefundStatus;
  recipientType: RefundRecipientType;
  recipientName?: string;  // IRCTC account username / handler name / free text
  accountId?: string;      // irctcAccounts doc id when recipientType is "Wallet"
  expectedAmount?: number;
  receivedAmount?: number;
  receivedDate?: string;   // YYYY-MM-DD
  // Amount actually added to the IRCTC account's walletAmount for this refund.
  // Maintained by firestoreClient so an edit/undo can reverse it exactly.
  walletCredited?: number;
}

export interface CustomerRefundLeg {
  status: CustomerRefundStatus;
  recipientName?: string;  // who gets paid back; defaults to booking.userName
  amount?: number;         // amount owed to the customer
  paidAmount?: number;
  paidDate?: string;       // YYYY-MM-DD
  paidBy?: string;         // who paid the customer (handler / owner)
  method?: string;
  note?: string;
}

export type CancellationKind = "cancellation" | "failed-payment";

export interface BookingCancellation {
  id: string;
  // "cancellation": passengers of a confirmed ticket were cancelled.
  // "failed-payment": Booking Failed (Paid) — money debited, no ticket issued.
  kind: CancellationKind;
  passengerPids: string[];
  passengerNames: string[];   // display snapshot taken at cancellation time
  // True for entries synthesised from pre-feature data, where the whole booking
  // was cancelled and passengers had no pids to reference.
  allPassengers?: boolean;
  cancelledOn: string;        // YYYY-MM-DD
  cancelledBy?: string;       // handler who cancelled the ticket
  reason?: string;
  fareCancelled?: number;     // ticket fare share of the cancelled passengers
  cancellationCharge?: number;
  cancellationGroupId?: string; // links entries created together for one group PNR
  // Set on the entry that turned the booking "CNF & Cancelled": the booking's
  // statusHandler just before, restored if that cancellation is undone.
  previousStatusHandler?: string;
  irctcRefund: IrctcRefundLeg;
  customerRefund: CustomerRefundLeg;
  createdAt: string;          // ISO string
  updatedAt: string;          // ISO string
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
  upgradePreferred?: boolean; // Optional
  remarks?: string; // Optional
  status: BookingStatus;
  statusReason?: string; // Optional reason for status like Missed or Booking Failed
  statusHandler?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  preparedAccounts?: PreparedAccount[]; // Optional array of prepared accounts for booking requirements
  paymentReceived?: boolean;
  amountSettled?: boolean;
  refundDetails?: RefundDetails; // Legacy — superseded by `cancellations`
  // Cancellation events (full or partial) with their refund legs. Cancelled
  // passengers stay in `passengers`; this is an overlay on top of them.
  cancellations?: BookingCancellation[];
  groupId?: string; // ID of the booking group this booking belongs to
}

export interface BookingGroup {
  id: string;
  name: string; // User-defined name or auto-generated
  bookingIds: string[];
  totalAmount: number;
  status: BookingStatus | 'Mixed';
  createdAt: string;
  updatedAt: string;
}

export type BookingFormData = Omit<Booking, "id" | "createdAt" | "updatedAt" | "status" | "preparedAccounts" | "groupId" | "cancellations" | "refundDetails">;

    



