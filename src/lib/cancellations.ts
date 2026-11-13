/**
 * Pure helpers for ticket cancellations and their refunds.
 *
 * A booking carries a `cancellations` array. Each entry covers some (partial)
 * or all (full) passengers and tracks two refund legs:
 *   1. IRCTC -> wherever the ticket was paid from (IRCTC wallet / handler / other)
 *   2. business -> customer
 *
 * Nothing in this file touches Firestore — the writes live in
 * `firestoreClient.ts`. Keeping these pure lets the Refunds tab, dashboard and
 * booking cards all derive the same answers from the bookings already loaded by
 * `useBookings()`.
 */

import type {
  Booking,
  BookingCancellation,
  BookingStatus,
  CustomerRefundLeg,
  IrctcRefundLeg,
  Passenger,
  RefundDetails,
  RefundRecipientType,
} from "@/types/booking";

/** Id of the entry synthesised for bookings cancelled before this feature existed. */
export const LEGACY_CANCELLATION_ID = "legacy";

export function generateLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function todayDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The minimal booking shape the legacy normalisation needs. */
export interface CancellationSource {
  status: BookingStatus;
  passengers: Passenger[];
  userName?: string;
  statusReason?: string;
  statusHandler?: string;
  createdAt?: string;
  updatedAt?: string;
  refundDetails?: RefundDetails;
  cancellations?: BookingCancellation[];
}

const hasUsableAccountId = (accountId?: string): accountId is string =>
  !!accountId && accountId !== "unknown_account";

/**
 * Bookings cancelled (or failed after payment) before cancellations existed
 * have no `cancellations` array. Describe them as a single entry so the rest of
 * the app has one model to deal with:
 *  - `refundDetails` present  -> refund already received (closed)
 *  - otherwise                -> IRCTC refund still pending (as the Refunds tab showed)
 * The customer leg is "Not Applicable" because it was never tracked.
 *
 * Returns null when the booking has nothing to refund.
 */
export function buildLegacyCancellation(source: CancellationSource): BookingCancellation | null {
  const isCancelled = source.status === "CNF & Cancelled";
  const isFailedPaid = source.status === "Booking Failed (Paid)";
  const refund = source.refundDetails;

  // A stale `refundDetails` on a booking that is no longer cancelled / failed
  // (e.g. reverted to Requested by the old flow) is ignored.
  if (!isCancelled && !isFailedPaid) return null;

  const stamp = source.updatedAt || source.createdAt || new Date().toISOString();
  const kind = isFailedPaid ? "failed-payment" : "cancellation";

  let irctcRefund: IrctcRefundLeg;
  if (refund) {
    const toWallet = refund.method === "Wallet";
    const recipientType: RefundRecipientType = toWallet ? "Wallet" : "Other";
    // The old flow credited the wallet whenever the booking was paid by Wallet.
    const walletCredited = toWallet && hasUsableAccountId(refund.accountId) ? refund.amount : 0;
    irctcRefund = {
      status: "Received",
      recipientType,
      ...(toWallet ? {} : { recipientName: refund.method }),
      ...(hasUsableAccountId(refund.accountId) ? { accountId: refund.accountId } : {}),
      expectedAmount: refund.amount,
      receivedAmount: refund.amount,
      receivedDate: refund.date,
      ...(walletCredited > 0 ? { walletCredited } : {}),
    };
  } else {
    irctcRefund = { status: "Pending", recipientType: "Other" };
  }

  return {
    id: LEGACY_CANCELLATION_ID,
    kind,
    passengerPids: [],
    passengerNames: kind === "cancellation" ? source.passengers.map(p => p.name) : [],
    ...(kind === "cancellation" ? { allPassengers: true } : {}),
    cancelledOn: stamp.slice(0, 10),
    ...(source.statusHandler ? { cancelledBy: source.statusHandler } : {}),
    ...(source.statusReason ? { reason: source.statusReason } : {}),
    irctcRefund,
    customerRefund: {
      status: "Not Applicable",
      ...(source.userName ? { recipientName: source.userName } : {}),
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Cancellation entries for a booking, including the synthesised legacy entry. */
export function getCancellations(booking: CancellationSource): BookingCancellation[] {
  if (Array.isArray(booking.cancellations) && booking.cancellations.length > 0) {
    return booking.cancellations;
  }
  const legacy = buildLegacyCancellation(booking);
  return legacy ? [legacy] : [];
}

export function isLegacyCancellation(entry: BookingCancellation): boolean {
  return entry.id === LEGACY_CANCELLATION_ID;
}

// ----- Passengers -----

/** Give every passenger a stable `pid`. Returns the same array when nothing changed. */
export function ensurePassengerPids(passengers: Passenger[]): { passengers: Passenger[]; changed: boolean } {
  let changed = false;
  const used = new Set(passengers.map(p => p.pid).filter((pid): pid is string => !!pid));
  const next = passengers.map(p => {
    if (p.pid) return p;
    let pid = generateLocalId("p");
    while (used.has(pid)) pid = generateLocalId("p");
    used.add(pid);
    changed = true;
    return { ...p, pid };
  });
  return { passengers: changed ? next : passengers, changed };
}

function coversAllPassengers(booking: CancellationSource): boolean {
  return getCancellations(booking).some(c => c.kind === "cancellation" && c.allPassengers);
}

export function getCancelledPids(booking: CancellationSource): Set<string> {
  const pids = new Set<string>();
  getCancellations(booking).forEach(c => {
    if (c.kind !== "cancellation") return;
    c.passengerPids.forEach(pid => pids.add(pid));
  });
  return pids;
}

export function isPassengerCancelled(booking: CancellationSource, passenger: Passenger, cancelledPids?: Set<string>): boolean {
  if (coversAllPassengers(booking)) return true;
  if (!passenger.pid) return false;
  return (cancelledPids ?? getCancelledPids(booking)).has(passenger.pid);
}

/** Passengers still travelling. */
export function getActivePassengers(booking: CancellationSource): Passenger[] {
  if (coversAllPassengers(booking)) return [];
  const cancelled = getCancelledPids(booking);
  if (cancelled.size === 0) return booking.passengers;
  return booking.passengers.filter(p => !p.pid || !cancelled.has(p.pid));
}

export function getCancelledPassengerCount(booking: CancellationSource): number {
  return booking.passengers.length - getActivePassengers(booking).length;
}

/** Some, but not all, passengers of a booked ticket were cancelled. */
export function isPartiallyCancelled(booking: CancellationSource): boolean {
  if (booking.status !== "Booked") return false;
  const cancelled = getCancelledPassengerCount(booking);
  return cancelled > 0 && cancelled < booking.passengers.length;
}

// ----- Refund state -----

export function isIrctcRefundOpen(entry: BookingCancellation): boolean {
  return entry.irctcRefund.status === "Pending";
}

export function isCustomerRefundOpen(entry: BookingCancellation): boolean {
  return entry.customerRefund.status === "Pending";
}

export function hasOpenIrctcRefund(booking: CancellationSource): boolean {
  return getCancellations(booking).some(isIrctcRefundOpen);
}

export function hasOpenCustomerRefund(booking: CancellationSource): boolean {
  return getCancellations(booking).some(isCustomerRefundOpen);
}

/** Either leg of any cancellation is still pending. */
export function hasOpenRefund(booking: CancellationSource): boolean {
  return getCancellations(booking).some(c => isIrctcRefundOpen(c) || isCustomerRefundOpen(c));
}

export interface RefundTotals {
  /** Sum of expected amounts on pending IRCTC legs. */
  awaitingIrctc: number;
  awaitingIrctcCount: number;
  /** Sum of amounts still owed to customers. */
  owedToCustomers: number;
  owedToCustomersCount: number;
}

export function getRefundTotals(bookings: CancellationSource[]): RefundTotals {
  const totals: RefundTotals = {
    awaitingIrctc: 0,
    awaitingIrctcCount: 0,
    owedToCustomers: 0,
    owedToCustomersCount: 0,
  };
  bookings.forEach(booking => {
    getCancellations(booking).forEach(entry => {
      if (isIrctcRefundOpen(entry)) {
        totals.awaitingIrctc += entry.irctcRefund.expectedAmount || 0;
        totals.awaitingIrctcCount += 1;
      }
      if (isCustomerRefundOpen(entry)) {
        totals.owedToCustomers += entry.customerRefund.amount || 0;
        totals.owedToCustomersCount += 1;
      }
    });
  });
  totals.awaitingIrctc = roundMoney(totals.awaitingIrctc);
  totals.owedToCustomers = roundMoney(totals.owedToCustomers);
  return totals;
}

/** How far a received IRCTC refund fell short of what was expected (0 when not short). */
export function getRefundShortfall(entry: BookingCancellation): number {
  const { status, expectedAmount, receivedAmount } = entry.irctcRefund;
  if (status !== "Received" || typeof expectedAmount !== "number" || typeof receivedAmount !== "number") return 0;
  const diff = roundMoney(expectedAmount - receivedAmount);
  return diff > 0 ? diff : 0;
}

// ----- Amount helpers -----

export interface RecordAmounts {
  bookedAmount?: number;
  amountCharged?: number;
}

/**
 * Ticket fare attributable to the cancelled passengers: the fare is shared
 * equally per passenger (the same rule ungrouping uses), and commission is
 * excluded because it is kept on cancellation.
 */
export function suggestFareShare(record: RecordAmounts | null | undefined, totalPassengers: number, cancelledCount: number): number {
  if (!record || totalPassengers <= 0 || cancelledCount <= 0) return 0;
  const base = typeof record.bookedAmount === "number" ? record.bookedAmount : (record.amountCharged || 0);
  if (base <= 0) return 0;
  return roundMoney((base * Math.min(cancelledCount, totalPassengers)) / totalPassengers);
}

/**
 * Split a total across parts in proportion to `counts`, rounded to paise. The
 * last non-zero part absorbs the rounding remainder so the parts always sum to
 * the total.
 */
export function splitAmountByCounts(total: number, counts: number[]): number[] {
  const totalCount = counts.reduce((sum, c) => sum + c, 0);
  if (totalCount <= 0) return counts.map(() => 0);
  const lastIndex = counts.reduce((last, c, i) => (c > 0 ? i : last), -1);
  let allocated = 0;
  return counts.map((count, index) => {
    if (count <= 0) return 0;
    if (index === lastIndex) return roundMoney(total - allocated);
    const part = roundMoney((total * count) / totalCount);
    allocated = roundMoney(allocated + part);
    return part;
  });
}

export interface RecordPaymentInfo {
  methodUsed?: string;
  bookedBy?: string;
  bookedAccountUsername?: string;
}

/**
 * IRCTC refunds go back to the source of payment: the IRCTC wallet when the
 * ticket was paid from it, otherwise the handler who paid.
 */
export function getDefaultRecipient(record: RecordPaymentInfo | null | undefined): { recipientType: RefundRecipientType; recipientName?: string } {
  if (!record) return { recipientType: "Other" };
  if (record.methodUsed === "Wallet") {
    return { recipientType: "Wallet", recipientName: record.bookedAccountUsername || undefined };
  }
  if (record.bookedBy) {
    return { recipientType: "Handler", recipientName: record.bookedBy };
  }
  return { recipientType: "Other" };
}

/**
 * Amount this entry should have added to an IRCTC account's wallet balance.
 * Only a received refund of a real cancellation going to a known wallet counts —
 * a failed payment was never deducted from the app's wallet balance, so its
 * refund must not be added to it.
 */
export function computeWalletCredit(entry: Pick<BookingCancellation, "kind" | "irctcRefund">): number {
  const leg = entry.irctcRefund;
  if (entry.kind !== "cancellation") return 0;
  if (leg.status !== "Received" || leg.recipientType !== "Wallet" || !leg.accountId) return 0;
  const amount = Number(leg.receivedAmount) || 0;
  return amount > 0 ? roundMoney(amount) : 0;
}

/** Drop fields that only make sense for a received refund. */
export function normalizeIrctcLeg(leg: IrctcRefundLeg): IrctcRefundLeg {
  const next: IrctcRefundLeg = { ...leg };
  if (next.recipientType !== "Wallet") delete next.accountId;
  if (next.status !== "Received") {
    delete next.receivedAmount;
    delete next.receivedDate;
  }
  if (next.status === "No Refund") delete next.expectedAmount;
  return next;
}

/** Drop fields that only make sense for a completed customer payback. */
export function normalizeCustomerLeg(leg: CustomerRefundLeg): CustomerRefundLeg {
  const next: CustomerRefundLeg = { ...leg };
  if (next.status !== "Paid") {
    delete next.paidAmount;
    delete next.paidDate;
    delete next.paidBy;
    delete next.method;
  }
  if (next.status === "Not Applicable") delete next.amount;
  return next;
}

/** Firestore rejects `undefined`; remove such keys (and empty strings) recursively. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (val === undefined || val === null || val === "") return;
      if (typeof val === "number" && Number.isNaN(val)) return;
      out[key] = stripUndefined(val);
    });
    return out as T;
  }
  return value;
}

/** Short label for who holds an IRCTC refund, e.g. "Ravi" or "Wallet · user123". */
export function describeRecipient(leg: IrctcRefundLeg): string {
  if (leg.recipientType === "Wallet") {
    return leg.recipientName ? `Wallet · ${leg.recipientName}` : "IRCTC Wallet";
  }
  if (leg.recipientType === "Handler") {
    return leg.recipientName || "Handler";
  }
  return leg.recipientName || "Not specified";
}

/** Booking-level type guard used by callers that only have a full Booking. */
export function isFullyCancelled(booking: Pick<Booking, "status">): boolean {
  return booking.status === "CNF & Cancelled";
}

/** "₹1,640" / "₹1,640.5" — Indian digit grouping, no trailing zeros. */
export function formatRupees(amount: number | undefined | null): string {
  const value = Number(amount) || 0;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Parse a money input; returns undefined for blank or invalid text. */
export function parseAmountInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (Number.isNaN(value) || value < 0) return undefined;
  return roundMoney(value);
}
