
export const dynamic = 'force-dynamic'; 

import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { getBookings, getDistinctBookingDates, getPendingBookings } from "@/actions/bookingActions";
import { BookingsView } from "@/components/bookings/BookingsView";
import { AccountsTab } from "@/components/accounts/AccountsTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Booking } from "@/types/booking";

const DATES_PER_PAGE = 10;

async function BookingDataFetcher({ searchQuery }: { searchQuery?: string }) {
  // Fetch pending bookings separately
  const pendingBookings = await getPendingBookings();
  const allBookings = await getBookings();
  
  if (searchQuery && searchQuery.trim() !== "") {
    const lowercasedQuery = searchQuery.trim().toLowerCase();
    
    // Filter both pending and all bookings for the search results
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

    return <BookingsView allBookings={filteredAll} pendingBookings={filteredPending} allBookingDates={[]} searchQuery={searchQuery} />;

  } else {
    // Initial load for date-based infinite scroll on completed tab
    const allBookingDates = await getDistinctBookingDates();
    return <BookingsView allBookings={allBookings} pendingBookings={pendingBookings} allBookingDates={allBookingDates} />;
  }
}

export default async function HomePage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined }}) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search : undefined;
  
  return (
    <AppShell showAddButton={true}>
      <Tabs defaultValue="bookings" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px] mb-6">
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Suspense fallback={<BookingsLoadingSkeleton />}>
            <BookingDataFetcher searchQuery={searchQuery} />
          </Suspense>
        </TabsContent>

        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
