"use client";

import { useQuery } from "@tanstack/react-query";
import { getBookings, getPendingBookings, getDistinctBookingDates } from "@/actions/bookingActions";
import type { Booking } from "@/types/booking";

/**
 * Hook to fetch all bookings with client-side caching via TanStack Query
 * Data is cached and only refetched on mutations or manual refresh
 */
export function useBookings() {
  return useQuery<Booking[], Error>({
    queryKey: ["bookings"],
    queryFn: async () => {
      const bookings = await getBookings();
      return bookings;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - cache kept in memory (renamed from cacheTime in v5)
    refetchOnWindowFocus: false, // Don't refetch when user returns to tab
    refetchOnMount: true, // Fetch on component mount if data is stale
  });
}

/**
 * Hook to fetch pending bookings (status = "Requested")
 * Cached separately from all bookings for efficient queries
 */
export function usePendingBookings() {
  return useQuery<Booking[], Error>({
    queryKey: ["bookings", "pending"],
    queryFn: async () => {
      const pendingBookings = await getPendingBookings();
      return pendingBookings;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

/**
 * Hook to fetch distinct booking dates for pagination
 * Used for infinite scroll implementation
 */
export function useBookingDates() {
  return useQuery<string[], Error>({
    queryKey: ["bookings", "dates"],
    queryFn: async () => {
      const dates = await getDistinctBookingDates();
      return dates;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
