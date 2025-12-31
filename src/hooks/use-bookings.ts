"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Booking, BookingFormData, BookingStatus } from "@/types/booking";
import {
  getBookings,
  getPendingBookings,
  getDistinctBookingDates,
  getBookingById,
  addBooking,
  updateBookingById,
  updateBookingStatus,
  deleteBooking,
} from "@/actions/bookingActions";

// Query Keys Factory
export const bookingKeys = {
  all: ['bookings'] as const,
  lists: () => [...bookingKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...bookingKeys.lists(), filters] as const,
  pending: () => [...bookingKeys.lists(), { status: 'Requested' }] as const,
  dates: () => [...bookingKeys.all, 'dates'] as const,
  details: () => [...bookingKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookingKeys.details(), id] as const,
};

// Query Hooks

/**
 * Fetch all bookings
 * Cache: 10 minutes, Stale: 1 minute
 */
export function useBookings() {
  return useQuery({
    queryKey: bookingKeys.lists(),
    queryFn: getBookings,
    gcTime: 10 * 60 * 1000, // 10 minutes
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Fetch pending bookings (status = 'Requested')
 * Cache: 5 minutes, Stale: 30 seconds
 * Refetches on window focus
 */
export function usePendingBookings() {
  return useQuery({
    queryKey: bookingKeys.pending(),
    queryFn: getPendingBookings,
    gcTime: 5 * 60 * 1000, // 5 minutes
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch distinct booking dates
 * Cache: 10 minutes, Stale: 1 minute
 */
export function useBookingDates() {
  return useQuery({
    queryKey: bookingKeys.dates(),
    queryFn: getDistinctBookingDates,
    gcTime: 10 * 60 * 1000, // 10 minutes
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Fetch a single booking by ID
 */
export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => getBookingById(id),
    enabled: !!id,
    gcTime: 5 * 60 * 1000, // 5 minutes
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// Mutation Hooks

/**
 * Create a new booking
 * Invalidates: pending bookings, all bookings, and booking dates
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BookingFormData) => addBooking(data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch related queries
        queryClient.invalidateQueries({ queryKey: bookingKeys.pending() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.dates() });
      }
    },
  });
}

/**
 * Update an existing booking
 * Invalidates: the specific booking, pending bookings, all bookings, and dates
 */
export function useUpdateBooking(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BookingFormData) => updateBookingById(id, data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate the specific booking
        queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
        // Invalidate lists
        queryClient.invalidateQueries({ queryKey: bookingKeys.pending() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.dates() });
      }
    },
  });
}

/**
 * Update booking status
 * Invalidates: the specific booking, pending bookings, and all bookings
 */
export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      reason,
      handler,
    }: {
      id: string;
      status: BookingStatus;
      reason?: string;
      handler?: string;
    }) => updateBookingStatus(id, status, reason, handler),
    onSuccess: (result, variables) => {
      if (result) {
        // Invalidate the specific booking
        queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.id) });
        // Invalidate lists
        queryClient.invalidateQueries({ queryKey: bookingKeys.pending() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      }
    },
  });
}

/**
 * Delete a booking
 * Invalidates: pending bookings, all bookings, and dates
 */
export function useDeleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate lists
        queryClient.invalidateQueries({ queryKey: bookingKeys.pending() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
        queryClient.invalidateQueries({ queryKey: bookingKeys.dates() });
      }
    },
  });
}
