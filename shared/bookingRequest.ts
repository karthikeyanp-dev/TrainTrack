import { z } from "zod";
import stationData from "./stations.json";
import { ALL_BOOKING_TYPES, ALL_PASSENGER_GENDERS, ALL_TRAIN_CLASSES, type BookingFormData } from "../src/types/booking";

export interface Station { code: string; name: string; city: string; state: string; aliases: string[]; priority?: number }
export interface SelectedStation { code: string; name: string; city: string; state: string }
export const STATIONS: Station[] = stationData as Station[];
const stationByCode = new Map(STATIONS.map(station => [station.code, station]));

export function getIndiaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKC").replace(/[.\-_]/g, " ").replace(/\s+/g, " ").trim();
const searchIndex = STATIONS.map(station => ({ station, name: normalize(station.name), city: normalize(station.city), aliases: station.aliases.map(normalize) }));
function withinDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i]; let minimum = i;
    for (let j = 1; j <= b.length; j++) { next[j] = Math.min(previous[j] + 1, next[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); minimum = Math.min(minimum, next[j]); }
    if (minimum > limit) return false;
    previous = next;
  }
  return previous[b.length] <= limit;
}

/** Search ranks suggestions only. A customer must explicitly select a station. */
export function searchStations(query: string, limit = 12): Station[] {
  const term = normalize(query);
  if (term.length < 2) return [];
  const ranked = searchIndex.map(entry => {
    const { station, name, city, aliases } = entry; let score = 0;
    if (station.code.toLowerCase() === term) score = 1000;
    else if (name === term) score = 900;
    else if (aliases.includes(term)) score = 800;
    else if (name.startsWith(term)) score = 650;
    else if (station.code.toLowerCase().startsWith(term)) score = 610;
    else if (name.includes(term)) score = 570;
    else if (city.includes(term) || aliases.some(alias => alias.includes(term))) score = 520;
    else if (term.length >= 4 && [name, ...aliases].some(label => withinDistance(term, label, term.length > 6 ? 2 : 1) || label.split(" ").some(word => withinDistance(term, word, term.length > 6 ? 2 : 1)))) score = 300;
    return { station, score: score ? score + (station.priority || 0) : 0 };
  }).filter(result => result.score > 0);
  return ranked.sort((a, b) => b.score - a.score || a.station.name.localeCompare(b.station.name)).slice(0, limit).map(result => result.station);
}

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a complete date.").refine(value => {
  const date = new Date(value + "T12:00:00Z"); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid calendar date.");
const stationSelectionSchema = z.object({ code: z.string().trim().min(1, "Choose a station from the suggestions.") }).transform((value, context): SelectedStation => {
  const station = stationByCode.get(value.code);
  if (!station) { context.addIssue({ code: z.ZodIssueCode.custom, message: "This station is not in the verified directory. Ask your agent for help." }); return z.NEVER; }
  return { code: station.code, name: station.name, city: station.city, state: station.state };
});
export const customerPassengerSchema = z.object({
  name: z.string().trim().min(2, "Enter the traveller’s full name.").max(80, "Please keep names to 80 characters or fewer."),
  age: z.number({ invalid_type_error: "Enter a whole-number age." }).int("Enter a whole-number age.").min(0).max(120),
  gender: z.enum(ALL_PASSENGER_GENDERS, { errorMap: () => ({ message: "Choose a gender." }) }),
  berthRequired: z.boolean().optional(),
}).superRefine((passenger, context) => {
  if (passenger.age >= 5 && passenger.age <= 11 && passenger.berthRequired === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["berthRequired"], message: "Choose whether this child needs a separate berth." });
});
export const customerBookingRequestSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: stationSelectionSchema,
  destination: stationSelectionSchema,
  journeyDate: dateStringSchema,
  classPreference: z.enum([...ALL_TRAIN_CLASSES, "unsure"], { errorMap: () => ({ message: "Choose a travel class, or ask for help choosing." }) }),
  bookingTypePreference: z.enum([...ALL_BOOKING_TYPES, "unsure"], { errorMap: () => ({ message: "Choose General, Tatkal, or ask your agent for help." }) }),
  contact: z.object({
    name: z.string().trim().min(2, "Enter your contact name.").max(80),
    phone: z.string().trim().transform(value => value.replace(/[\s()-]/g, "").replace(/^(?:\+91|0091|91(?=\d{10}$))/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.")).transform(value => `+91${value}`),
  }),
  passengers: z.array(customerPassengerSchema).min(1, "Add at least one traveller.").max(6, "For more than six travellers, contact your agent to arrange the group."),
  trainPreference: z.string().trim().max(160).default(""),
  upgradePreferred: z.boolean(),
  remarks: z.string().trim().max(1200, "Please keep special requests to 1,200 characters or fewer.").default(""),
  customerConfirmed: z.literal(true, { errorMap: () => ({ message: "Confirm that you’ve checked your travel details." }) }),
}).superRefine((request, context) => {
  if (request.source.code === request.destination.code) context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "Departure and arrival stations must be different." });
});
export const customerBookingRequestSchema = customerBookingRequestSnapshotSchema.superRefine((request, context) => {
  if (request.journeyDate < getIndiaToday()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["journeyDate"], message: "Choose today or a future boarding date." });
});
export type CustomerBookingRequest = z.output<typeof customerBookingRequestSchema>;
export type CustomerBookingRequestInput = z.input<typeof customerBookingRequestSchema>;

export const approvalPlanSchema = z.object({
  bookingDate: dateStringSchema,
  classType: z.enum(ALL_TRAIN_CLASSES),
  bookingType: z.enum(ALL_BOOKING_TYPES),
  customerVerified: z.literal(true, { errorMap: () => ({ message: "Verify the customer details and booking plan before approval." }) }),
  childDetailsVerified: z.boolean(),
});
export type ApprovalPlan = z.infer<typeof approvalPlanSchema>;
export const REQUEST_STATUSES = ["submitted", "clarification", "rejected", "approved"] as const;
export type BookingRequestStatus = typeof REQUEST_STATUSES[number];
export interface BookingRequestRecord {
  id: string; request: CustomerBookingRequest; status: BookingRequestStatus; revision: number; receiptReference: string; createdAt: string; updatedAt: string;
  approvedBookingId?: string; reviewNote?: string; approvedBy?: string; approvedAt?: string;
}

export function getRequestWarnings(request: CustomerBookingRequest): string[] {
  const warnings: string[] = [];
  if (request.classPreference === "unsure") warnings.push("Confirm the travel class with the customer.");
  if (request.bookingTypePreference === "unsure") warnings.push("Confirm General or Tatkal before approving.");
  if (!request.trainPreference) warnings.push("No preferred train: agree on a suitable train before purchasing a ticket.");
  if (request.passengers.some(passenger => passenger.age < 5)) warnings.push("Under-five traveller: arrange infant/child ticket requirements separately. This request cannot be approved through the standard booking flow.");
  if (request.passengers.some(passenger => passenger.age >= 5 && passenger.age <= 11)) warnings.push("Check the child’s age and separate berth requirements.");
  if (request.passengers.some(passenger => passenger.age > 100)) warnings.push("Check the unusually high passenger age with the customer.");
  const names = request.passengers.map(passenger => normalize(passenger.name));
  if (new Set(names).size !== names.length) warnings.push("Two travellers share a name. Verify that these are separate people.");
  if (request.remarks) warnings.push("Review the customer’s conditions and special requests before approval.");
  return warnings;
}

/** Customer identity, journey and permission fields cannot be silently overridden by staff. */
export function toBookingData(requestValue: CustomerBookingRequest, planValue: ApprovalPlan): BookingFormData & { customerPhone: string; sourceStationName: string; destinationStationName: string } {
  const request = customerBookingRequestSchema.parse(requestValue); const plan = approvalPlanSchema.parse(planValue);
  if (plan.bookingDate < getIndiaToday() || plan.bookingDate > request.journeyDate) throw new Error("Book by must be today or later and no later than the boarding date.");
  if (request.classPreference !== "unsure" && request.classPreference !== plan.classType) throw new Error("The class must match the customer’s confirmed choice. Request fresh confirmation before changing it.");
  if (request.bookingTypePreference !== "unsure" && request.bookingTypePreference !== plan.bookingType) throw new Error("The booking method must match the customer’s confirmed choice.");
  if (request.passengers.some(passenger => passenger.age < 5)) throw new Error("Under-five travel requires separate infant/child handling before a booking can be created.");
  if (request.passengers.some(passenger => passenger.age <= 11) && !plan.childDetailsVerified) throw new Error("Verify child ticket and berth requirements before approving.");
  return {
    source: request.source.code, destination: request.destination.code, journeyDate: request.journeyDate, userName: request.contact.name,
    passengers: request.passengers.map(passenger => ({ ...passenger })), bookingDate: plan.bookingDate, classType: plan.classType, bookingType: plan.bookingType,
    upgradePreferred: request.upgradePreferred, ...(request.trainPreference && { trainPreference: request.trainPreference }), ...(request.remarks && { remarks: request.remarks }),
    customerPhone: request.contact.phone, sourceStationName: request.source.name, destinationStationName: request.destination.name,
  };
}
