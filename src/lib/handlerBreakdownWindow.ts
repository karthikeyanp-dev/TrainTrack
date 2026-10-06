/**
 * Settlement-reference window for the handler booking breakdown dialog.
 *
 * Handler payments are settled weekly or bi-weekly, so the breakdown only
 * needs recent bookings. With a safety margin it covers the current month
 * plus the full previous month — nothing older is shown.
 *
 * The window is expressed as a `YYYY-MM-DD` string (first day of the previous
 * month, in local calendar time) so it compares directly against the
 * zero-padded `bookingDate` strings shown in the dialog.
 */

/** `YYYY-MM-DD` of the first day of the month before `now`'s month. */
export function getHandlerBreakdownWindowStart(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 12 : month; // 1-based month number of previous month
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
}
