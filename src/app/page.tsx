
export const dynamic = 'force-dynamic'; 

import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { getBookings, getBookingsPaginated } from "@/actions/bookingActions";
import { BookingsView } from "@/components/bookings/BookingsView";
import type { Booking } from "@/types/booking";

async function BookingDataFetcher({ searchQuery }: { searchQuery?: string }) {
  if (searchQuery && searchQuery.trim() !== "") {
    const lowercasedQuery = searchQuery.trim().toLowerCase();
    const allBookings = await getBookings();
    
    const filteredBookings = allBookings.filter(booking => {
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
        (booking.timePreference && booking.timePreference.toLowerCase().includes(lowercasedQuery))
      );
    });

    return <BookingsView initialBookings={filteredBookings} searchQuery={searchQuery} />;

  } else {
    // Initial load for infinite scroll
    const { bookings, nextCursor, hasMore } = await getBookingsPaginated({ lastCreatedAt: null, limitCount: 20 });
    return <BookingsView initialBookings={bookings} initialCursor={nextCursor} initialHasMore={hasMore} />;
  }
}

export default function HomePage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined }}) {
  const searchQuery = typeof searchParams?.search === 'string' ? searchParams.search : undefined;
  
  return (
    <AppShell showAddButton={true}>
      <Suspense fallback={<BookingsLoadingSkeleton />}>
        <BookingDataFetcher searchQuery={searchQuery} />
      </Suspense>
    </AppShell>
  );
}
