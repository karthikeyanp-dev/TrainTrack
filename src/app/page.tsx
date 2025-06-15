
export const dynamic = 'force-dynamic'; 

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingList } from "@/components/bookings/BookingList";
import { getBookings } from "@/actions/bookingActions";
import type { Booking, TrainClass } from "@/types/booking";
import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Search } from "lucide-react";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";

const groupBookingsByDate = (bookings: Booking[]): Record<string, Booking[]> => {
  return bookings.reduce((acc, booking) => {
    const dateKey = booking.bookingDate; 
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(booking);
    return acc;
  }, {} as Record<string, Booking[]>);
};

const SL_CLASSES: TrainClass[] = ["SL", "UR", "2S"];

async function BookingsDisplay({ searchQuery }: { searchQuery?: string }) {
  let allBookings = await getBookings();

  if (searchQuery && searchQuery.trim() !== "") {
    const lowercasedQuery = searchQuery.trim().toLowerCase();
    allBookings = allBookings.filter(booking => {
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
  }

  const pendingBookingsRaw = allBookings
    .filter(booking => booking.status === "Requested")
    .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

  const completedBookingsRaw = allBookings
    .filter(booking => booking.status !== "Requested")
    .sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a.journeyDate).getTime());

  const pendingBookingsByDate = groupBookingsByDate(pendingBookingsRaw);
  const pendingDates = Object.keys(pendingBookingsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const completedBookingsByDate = groupBookingsByDate(completedBookingsRaw);
  const completedDates = Object.keys(completedBookingsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const renderBookingsForDate = (bookingsForDate: Booking[]) => {
    const acBookings = bookingsForDate.filter(b => !SL_CLASSES.includes(b.classType));
    const slBookings = bookingsForDate.filter(b => SL_CLASSES.includes(b.classType));

    return (
      <>
        {acBookings.length > 0 && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-primary">AC Bookings</h4>
            <BookingList bookings={acBookings} />
          </div>
        )}
        {slBookings.length > 0 && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-accent">SL Bookings</h4>
            <BookingList bookings={slBookings} />
          </div>
        )}
        {acBookings.length === 0 && slBookings.length === 0 && bookingsForDate.length > 0 && (
          <BookingList bookings={bookingsForDate} />
        )}
      </>
    );
  };
  
  const noPendingMessage = searchQuery 
    ? "No pending bookings found matching your search."
    : "No bookings are currently in 'Requested' status. Add a new one!";
  const noCompletedMessage = searchQuery
    ? "No completed bookings found matching your search."
    : "No bookings have been marked as 'Booked', 'Missed', 'Booking Failed', or 'User Cancelled' yet.";


  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Pending Bookings</h2>
        {pendingDates.length === 0 ? (
          <Alert className="mt-4">
            {searchQuery ? <Search className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{searchQuery ? "Search Results" : "No Pending Bookings"}</AlertTitle>
            <AlertDescription>{noPendingMessage}</AlertDescription>
          </Alert>
        ) : (
          pendingDates.map(date => (
            <div key={`pending-${date}`} className="mb-8">
              <DateGroupHeading dateString={date} />
              {renderBookingsForDate(pendingBookingsByDate[date])}
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="completed" className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Completed Bookings</h2>
        {completedDates.length === 0 ? (
          <Alert className="mt-4">
            {searchQuery ? <Search className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{searchQuery ? "Search Results" : "No Completed Bookings"}</AlertTitle>
            <AlertDescription>{noCompletedMessage}</AlertDescription>
          </Alert>
        ) : (
          completedDates.map(date => (
            <div key={`completed-${date}`} className="mb-8">
              <DateGroupHeading dateString={date} />
              {renderBookingsForDate(completedBookingsByDate[date])}
            </div>
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}

function BookingsLoadingSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-1/2 md:w-[200px]" />
        <Skeleton className="h-10 w-1/2 md:w-[200px]" />
      </div>
      <Skeleton className="h-8 w-48 mb-4" />
      
      <div className="space-y-6">
        <Skeleton className="h-7 w-1/3 mb-3" /> 
        <div className="space-y-3">
            <Skeleton className="h-6 w-1/4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
            </div>
        </div>
        <div className="space-y-3 mt-4">
            <Skeleton className="h-6 w-1/4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
                <CardSkeleton />
            </div>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex justify-between items-center pt-4 border-t">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

export default function HomePage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined }}) {
  const searchQuery = typeof searchParams?.search === 'string' ? searchParams.search : undefined;
  
  return (
    <AppShell showAddButton={true}>
      <Suspense fallback={<BookingsLoadingSkeleton />}>
        <BookingsDisplay searchQuery={searchQuery} />
      </Suspense>
    </AppShell>
  );
}
