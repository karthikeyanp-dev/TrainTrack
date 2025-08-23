
export const dynamic = 'force-dynamic'; 

import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { getBookings, getDistinctBookingDates } from "@/actions/bookingActions";
import { BookingsView } from "@/components/bookings/BookingsView";
import type { Booking } from "@/types/booking";

const DATES_PER_PAGE = 10;

async function BookingDataFetcher({ searchQuery }: { searchQuery?: string }) {
  const allBookings = await getBookings();
  
  if (searchQuery && searchQuery.trim() !== "") {
    const lowercasedQuery = searchQuery.trim().toLowerCase();
    
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

    return <BookingsView allBookings={filteredBookings} allBookingDates={[]} searchQuery={searchQuery} />;

  } else {
    // Initial load for date-based infinite scroll
    const allBookingDates = await getDistinctBookingDates();
    return <BookingsView allBookings={allBookings} allBookingDates={allBookingDates} />;
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
