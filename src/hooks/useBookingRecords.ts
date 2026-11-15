"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  bookingRecordsStore,
  findBookingRecord,
  getBookingRecordIndex,
  getServerBookingRecordIndex,
} from "@/lib/dataStores";
import type { BookingRecord } from "@/types/bookingRecord";

/**
 * The booked details for one booking (its own record, else its group's
 * record), or null. Updates in real time and costs no Firestore reads: every
 * card shares the one booking-records store.
 */
export function useBookingRecord(bookingId: string): BookingRecord | null {
  return useSyncExternalStore(
    bookingRecordsStore.subscribe,
    () => findBookingRecord(getBookingRecordIndex(), bookingId),
    () => null
  );
}

/**
 * Look up booked details for any booking. `getRecord` changes identity
 * whenever a record changes, so it can be used as a memo/effect dependency.
 */
export function useBookingRecordLookup() {
  const index = useSyncExternalStore(
    bookingRecordsStore.subscribe,
    getBookingRecordIndex,
    getServerBookingRecordIndex
  );
  const status = useSyncExternalStore(
    bookingRecordsStore.subscribe,
    bookingRecordsStore.getStatus,
    bookingRecordsStore.getServerStatus
  );

  const getRecord = useCallback(
    (bookingId: string): BookingRecord | null => findBookingRecord(index, bookingId),
    [index]
  );

  return { getRecord, isLoading: !status.ready };
}
