"use client";

import { AppShell } from "@/components/layout/AppShell";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { BookingsView } from "@/components/bookings/BookingsView";
import { useBookings, usePendingBookings, useBookingDates } from "@/hooks/useBookings";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, Suspense } from "react";
import type { Booking } from "@/types/booking";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('search') || undefined;
  
  // Handle legacy tab parameter redirect
  useEffect(() => {
    if (searchParams.get('tab') === 'accounts') {
      router.replace('/accounts');
    }
  }, [searchParams, router]);

  // Fetch data using TanStack Query hooks
  const { data: allBookings = [], isLoading: isLoadingAll, error: errorAll } = useBookings();
  const { data: pendingBookings = [], isLoading: isLoadingPending, error: errorPending } = usePendingBookings();
  const { data: allBookingDates = [], isLoading: isLoadingDates, error: errorDates } = useBookingDates();

  // Filter bookings based on search query
  const { filteredAllBookings, filteredPendingBookings } = useMemo(() => {
    if (!searchQuery || searchQuery.trim() === "") {
      return {
        filteredAllBookings: allBookings,
        filteredPendingBookings: pendingBookings,
      };
    }

    const lowercasedQuery = searchQuery.trim().toLowerCase();

    const filteredPending = pendingBookings.filter(booking => {
      const passengerMatch = booking.passengers.some(p => p.name.toLowerCase().includes(lowercasedQuery));
      return passengerMatch ||
        booking.userName.toLowerCase().includes(lowercasedQuery) ||
        booking.source.toLowerCase().includes(lowercasedQuery) ||
        booking.destination.toLowerCase().includes(lowercasedQuery);
    });

    const filteredAll = allBookings.filter(booking => {
      const passengerMatch = booking.passengers.some(p =>
        p.name.toLowerCase().includes(lowercasedQuery)
      );
      return (
        passengerMatch ||
        booking.userName.toLowerCase().includes(lowercasedQuery) ||
        booking.source.toLowerCase().includes(lowercasedQuery) ||
        booking.destination.toLowerCase().includes(lowercasedQuery) ||
        booking.classType.toLowerCase().includes(lowercasedQuery) ||
        (booking.trainPreference && booking.trainPreference.toLowerCase().includes(lowercasedQuery)) ||
        (booking.remarks && booking.remarks.toLowerCase().includes(lowercasedQuery))
      );
    });

    return {
      filteredAllBookings: filteredAll,
      filteredPendingBookings: filteredPending,
    };
  }, [allBookings, pendingBookings, searchQuery]);

  // Show loading state while any data is loading
  const isLoading = isLoadingAll || isLoadingPending || isLoadingDates;

  // Handle errors
  if (errorAll || errorPending || errorDates) {
    return (
      <AppShell showAddButton={true} activeTab="bookings">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-lg font-semibold text-destructive">Error loading bookings</p>
            <p className="text-sm text-muted-foreground mt-2">
              {(errorAll || errorPending || errorDates)?.message || "An unknown error occurred"}
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell showAddButton={true} activeTab="bookings">
      {isLoading ? (
        <BookingsLoadingSkeleton />
      ) : (
        <BookingsView 
          allBookings={filteredAllBookings} 
          pendingBookings={filteredPendingBookings} 
          allBookingDates={searchQuery ? [] : allBookingDates}
          searchQuery={searchQuery}
        />
      )}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<AppShell showAddButton={true} activeTab="bookings"><BookingsLoadingSkeleton /></AppShell>}>
      <HomePageContent />
    </Suspense>
  );
}
