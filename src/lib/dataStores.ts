/**
 * The app's shared, read-efficient view of Firestore.
 *
 * Every screen reads bookings, booking records, accounts and handlers from
 * these stores instead of querying Firestore itself. That is what keeps the
 * app inside the Spark plan's 50,000 reads a day:
 *
 *  - `bookings` and `bookingRecords` are mirrored in IndexedDB and kept current
 *    by a "changed since last sync" listener (`SyncedCollection`).
 *  - `irctcAccounts` and `handlers` are small, so each has one real-time
 *    listener shared by the whole app (`LiveCollection`).
 *
 * The stores are created once and live for the whole session; navigating
 * between pages does not re-read anything.
 */

import { Timestamp, collection, orderBy, query, type DocumentData } from "firebase/firestore";
import { LiveCollection } from "@/lib/sync/liveCollection";
import { SyncedCollection, type SyncedDoc } from "@/lib/sync/syncedCollection";
import type { IrctcAccount } from "@/types/account";
import type {
  Booking,
  BookingCancellation,
  BookingStatus,
  Passenger,
  PreparedAccount,
  RefundDetails,
  TrainClass,
} from "@/types/booking";
import { LEGACY_CLASS_MAP } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";
import type { Handler, HandlerPaymentRecord } from "@/types/handler";

// ----- Mapping helpers -----

const toISOString = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
};

const toDateString = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString().split("T")[0];
  return typeof value === "string" ? value : "";
};

// A document written by something other than the app (a console edit, a dev
// script) can lack `classType`; the UI calls string methods on it, so never
// let it through as undefined.
const normalizeClassType = (classType: unknown): TrainClass => {
  if (typeof classType !== "string") return "" as TrainClass;
  return classType in LEGACY_CLASS_MAP
    ? LEGACY_CLASS_MAP[classType as keyof typeof LEGACY_CLASS_MAP]
    : (classType as TrainClass);
};

const toText = (value: unknown): string => (typeof value === "string" ? value : "");

function mapBooking(id: string, data: DocumentData): Booking {
  return {
    id,
    source: toText(data.source),
    destination: toText(data.destination),
    journeyDate: data.journeyDate as string,
    userName: toText(data.userName),
    passengers: Array.isArray(data.passengers) ? (data.passengers as Passenger[]) : [],
    bookingDate: data.bookingDate as string,
    classType: normalizeClassType(data.classType),
    bookingType: data.bookingType || "Tatkal",
    trainPreference: data.trainPreference as string | undefined,
    upgradePreferred: data.upgradePreferred as boolean | undefined,
    remarks: (data.remarks || data.timePreference) as string | undefined,
    status: data.status as BookingStatus,
    statusReason: data.statusReason as string | undefined,
    statusHandler: data.statusHandler as string | undefined,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
    preparedAccounts: Array.isArray(data.preparedAccounts) ? (data.preparedAccounts as PreparedAccount[]) : undefined,
    paymentReceived: data.paymentReceived as boolean | undefined,
    amountSettled: data.amountSettled as boolean | undefined,
    refundDetails: data.refundDetails as RefundDetails | undefined,
    cancellations:
      Array.isArray(data.cancellations) && data.cancellations.length > 0
        ? (data.cancellations as BookingCancellation[])
        : undefined,
    groupId: data.groupId as string | undefined,
  };
}

function mapBookingRecord(id: string, data: DocumentData): BookingRecord {
  return {
    id,
    bookingId: data.bookingId,
    bookingIds: data.bookingIds,
    groupId: data.groupId,
    bookedBy: data.bookedBy,
    bookedAccountUsername: data.bookedAccountUsername,
    amountCharged: data.amountCharged,
    bookedAmount: data.bookedAmount,
    commission: data.commission,
    commissionRate: data.commissionRate,
    passengerCount: data.passengerCount,
    bookingTransactionId: data.bookingTransactionId,
    bookingDate: data.bookingDate,
    methodUsed: data.methodUsed,
    trainName: data.trainName as string | undefined,
    bookedStatus: data.bookedStatus as string | undefined,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

// ----- Stores -----
//
// Kept on globalThis so a hot reload in development reuses the open listeners
// instead of stacking new ones on top.

interface Stores {
  bookings: SyncedCollection;
  bookingRecords: SyncedCollection;
  accounts: LiveCollection<IrctcAccount>;
  handlers: LiveCollection<Handler>;
}

function createStores(): Stores {
  return {
    bookings: new SyncedCollection("bookings"),
    bookingRecords: new SyncedCollection("bookingRecords"),
    accounts: new LiveCollection<IrctcAccount>(
      "irctcAccounts",
      database => query(collection(database, "irctcAccounts"), orderBy("walletAmount", "desc")),
      document => {
        const data = document.data({ serverTimestamps: "estimate" });
        return {
          id: document.id,
          username: data.username as string,
          password: data.password as string,
          isVerified: data.isVerified ?? false,
          isRailOneRegistered: data.isRailOneRegistered ?? false,
          walletAmount: (data.walletAmount as number) || 0,
          lastBookedDate: toDateString(data.lastBookedDate),
          previousLastBookedDate: data.previousLastBookedDate,
          createdAt: toISOString(data.createdAt),
          updatedAt: toISOString(data.updatedAt),
        };
      }
    ),
    handlers: new LiveCollection<Handler>(
      "handlers",
      database => query(collection(database, "handlers"), orderBy("name", "asc")),
      document => {
        const data = document.data({ serverTimestamps: "estimate" });
        return {
          id: document.id,
          name: data.name as string,
          initialPendingAmount: (data.initialPendingAmount as number) || 0,
          settledAmount: (data.settledAmount as number) || 0,
          naAmount: (data.naAmount as number) || 0,
          payments: (data.payments as HandlerPaymentRecord[]) || [],
          trackingStartDate: data.trackingStartDate as string | undefined,
          lastSettledDate: data.lastSettledDate as string | undefined,
          createdAt: toISOString(data.createdAt),
          updatedAt: toISOString(data.updatedAt),
        };
      }
    ),
  };
}

const globalStores = globalThis as typeof globalThis & { __trainTrackStores?: Stores };
const stores: Stores = (globalStores.__trainTrackStores ??= createStores());

export const bookingsStore = stores.bookings;
export const bookingRecordsStore = stores.bookingRecords;
export const accountsStore = stores.accounts;
export const handlersStore = stores.handlers;

/** Re-read bookings and booking records from Firestore in full (costs one read per document). */
export async function resyncAllData(): Promise<void> {
  await Promise.all([bookingsStore.resync(), bookingRecordsStore.resync()]);
}

// ----- Bookings -----

const bookingCache = new WeakMap<SyncedDoc, Booking>();
let bookingsSource: readonly SyncedDoc[] | null = null;
let bookingsList: Booking[] = [];
const NO_BOOKINGS: Booking[] = [];

/**
 * Every booking, newest first. Returns the same array until a booking changes,
 * and unchanged bookings keep the same object across updates.
 */
export function getBookingsSnapshot(): Booking[] {
  const docs = bookingsStore.getDocs();
  if (docs === bookingsSource) return bookingsList;
  const list: Booking[] = [];
  docs.forEach(item => {
    // The app has always listed bookings ordered by createdAt, which leaves
    // out any document without it.
    if (!item.data.createdAt) return;
    let booking = bookingCache.get(item);
    if (!booking) {
      try {
        booking = mapBooking(item.id, item.data);
      } catch (error) {
        console.error(`Failed to map booking ${item.id}:`, error);
        return;
      }
      bookingCache.set(item, booking);
    }
    list.push(booking);
  });
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  bookingsSource = docs;
  bookingsList = list;
  return list;
}

export const getServerBookingsSnapshot = (): Booking[] => NO_BOOKINGS;

// ----- Booking records -----

export interface BookingRecordIndex {
  /** Every record, as stored. */
  docs: readonly SyncedDoc[];
  /** Record whose `bookingId` is the booking (an individual record, or a group record's first booking). */
  byBookingId: Map<string, BookingRecord>;
  /** Group record listing the booking in `bookingIds`. */
  byMemberId: Map<string, BookingRecord>;
}

const recordCache = new WeakMap<SyncedDoc, BookingRecord>();
let recordsSource: readonly SyncedDoc[] | null = null;
let recordIndex: BookingRecordIndex = { docs: [], byBookingId: new Map(), byMemberId: new Map() };
const EMPTY_RECORD_INDEX: BookingRecordIndex = { docs: [], byBookingId: new Map(), byMemberId: new Map() };

/** Lookup tables over the booking records. Same object until a record changes. */
export function getBookingRecordIndex(): BookingRecordIndex {
  const docs = bookingRecordsStore.getDocs();
  if (docs === recordsSource) return recordIndex;
  const byBookingId = new Map<string, BookingRecord>();
  const byMemberId = new Map<string, BookingRecord>();
  // Lowest document id wins when a booking has more than one record — the
  // order the Firestore queries this replaces returned them in.
  const ordered = [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  ordered.forEach(item => {
    let record = recordCache.get(item);
    if (!record) {
      record = mapBookingRecord(item.id, item.data);
      recordCache.set(item, record);
    }
    if (typeof item.data.bookingId === "string" && !byBookingId.has(item.data.bookingId)) {
      byBookingId.set(item.data.bookingId, record);
    }
    if (Array.isArray(item.data.bookingIds)) {
      item.data.bookingIds.forEach((memberId: unknown) => {
        if (typeof memberId === "string" && !byMemberId.has(memberId)) byMemberId.set(memberId, record!);
      });
    }
  });
  recordsSource = docs;
  recordIndex = { docs, byBookingId, byMemberId };
  return recordIndex;
}

export const getServerBookingRecordIndex = (): BookingRecordIndex => EMPTY_RECORD_INDEX;

/** The booked details covering a booking: its own record, else its group's record. */
export function findBookingRecord(index: BookingRecordIndex, bookingId: string): BookingRecord | null {
  return index.byBookingId.get(bookingId) ?? index.byMemberId.get(bookingId) ?? null;
}
