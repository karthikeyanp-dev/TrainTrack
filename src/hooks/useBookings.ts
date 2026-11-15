"use client";

import { useMemo, useSyncExternalStore } from "react";
import { bookingsStore, getBookingsSnapshot, getServerBookingsSnapshot } from "@/lib/dataStores";
import { describeFirestoreError } from "@/lib/firestoreErrors";
import type { Booking } from "@/types/booking";

/**
 * All bookings, newest first, updated in real time.
 *
 * Reads from the shared bookings store (`src/lib/dataStores.ts`): the
 * collection is cached on the device and only changed bookings are fetched,
 * so calling this from several components or pages costs no extra reads.
 */
export function useBookings() {
  const bookings = useSyncExternalStore(bookingsStore.subscribe, getBookingsSnapshot, getServerBookingsSnapshot);
  const status = useSyncExternalStore(bookingsStore.subscribe, bookingsStore.getStatus, bookingsStore.getServerStatus);

  // Once there is data to show, a sync problem is reported by the banner in
  // the app shell instead of replacing the page with an error.
  const error = useMemo(
    () =>
      !status.ready && status.error
        ? new Error(describeFirestoreError(status.error, "Failed to load bookings"))
        : null,
    [status.ready, status.error]
  );

  return { data: bookings, isLoading: !status.ready && !error, error };
}

/**
 * Pending bookings (status "Requested"), soonest journey first, in real time.
 */
export function usePendingBookings() {
  const { data: allBookings, isLoading, error } = useBookings();

  const pending = useMemo<Booking[]>(
    () =>
      allBookings
        .filter(booking => booking.status === "Requested")
        .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime()),
    [allBookings]
  );

  return { data: pending, isLoading, error };
}

/**
 * Distinct "Book by" dates across all bookings, newest first.
 */
export function useBookingDates() {
  const { data: allBookings, isLoading, error } = useBookings();

  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    allBookings.forEach(booking => {
      dateSet.add(booking.bookingDate);
    });
    return Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [allBookings]);

  return { data: dates, isLoading, error };
}
