const journeyFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** Dates are calendar days in India, never browser-local midnight. */
export function formatRequestDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(`${value}T12:00:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? value : journeyFormatter.format(parsed);
}

export function formatRequestReceivedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export const requestClassLabels: Record<string, string> = {
  SL: "Sleeper (SL)",
  "3A": "AC 3-tier (3A)",
  "2A": "AC 2-tier (2A)",
  "1A": "AC First Class (1A)",
  "2S": "Second Sitting (2S)",
  "3E": "AC 3-tier Economy (3E)",
  EC: "Executive Chair Car (EC)",
  CC: "AC Chair Car (CC)",
  "CC (Veg)": "AC Chair Car — vegetarian meal",
  "CC (Non Veg)": "AC Chair Car — non-vegetarian meal",
  "CC (No Food)": "AC Chair Car — no food",
  UR: "Unreserved (UR)",
};
