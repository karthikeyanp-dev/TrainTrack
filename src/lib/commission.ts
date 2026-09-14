import type { TrainClass } from "@/types/booking";

export const COMMISSION_RATE_AC = 100;
export const COMMISSION_RATE_NON_AC = 70;

const AC_CLASSES = new Set<string>([
  "1A",
  "2A",
  "3A",
  "3E",
  "EC",
  "CC",
  "CC (Veg)",
  "CC (Non Veg)",
  "CC (No Food)",
  "CC w Food",
  "CC w/o Food",
]);

/**
 * Checks whether a train class is considered AC.
 * AC classes: 1A, 2A, 3A, 3E, EC, CC variants.
 * All other classes (SL, 2S, UR, etc.) are Non-AC / General.
 */
export function isAcClass(classType?: TrainClass | string | null): boolean {
  if (!classType) return false;
  return AC_CLASSES.has(classType.trim());
}

/**
 * Returns commission rate per passenger based on class type:
 * - ₹100 for AC classes
 * - ₹70 for Non-AC & General classes
 */
export function getCommissionRate(classType?: TrainClass | string | null): number {
  return isAcClass(classType) ? COMMISSION_RATE_AC : COMMISSION_RATE_NON_AC;
}

export interface BookingCommissionInfo {
  passengerCount: number;
  rate: number;
  isAc: boolean;
  commission: number;
}

/**
 * Calculates handler commission for a single booking.
 */
export function calculateBookingCommission(booking?: {
  classType?: TrainClass | string | null;
  passengers?: any[] | null;
} | null): BookingCommissionInfo {
  const passengerCount = booking?.passengers && booking.passengers.length > 0 ? booking.passengers.length : 1;
  const isAc = isAcClass(booking?.classType);
  const rate = isAc ? COMMISSION_RATE_AC : COMMISSION_RATE_NON_AC;
  const commission = passengerCount * rate;

  return {
    passengerCount,
    rate,
    isAc,
    commission,
  };
}

export interface GroupCommissionInfo {
  totalPassengers: number;
  totalCommission: number;
  breakdown: Array<{
    bookingId?: string;
    classType?: string;
    passengerCount: number;
    rate: number;
    commission: number;
  }>;
}

/**
 * Calculates handler commission for a group of bookings.
 */
export function calculateGroupCommission(
  bookings: Array<{
    id?: string;
    classType?: TrainClass | string | null;
    passengers?: any[] | null;
  }>
): GroupCommissionInfo {
  let totalPassengers = 0;
  let totalCommission = 0;

  const breakdown = bookings.map((b) => {
    const info = calculateBookingCommission(b);
    totalPassengers += info.passengerCount;
    totalCommission += info.commission;
    return {
      bookingId: b.id,
      classType: b.classType || undefined,
      passengerCount: info.passengerCount,
      rate: info.rate,
      commission: info.commission,
    };
  });

  return {
    totalPassengers,
    totalCommission,
    breakdown,
  };
}
