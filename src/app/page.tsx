
export const dynamic = 'force-dynamic'; // Ensures the page is re-rendered on every request

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingList } from "@/components/bookings/BookingList";
import { getBookings } from "@/actions/bookingActions";
import type { Booking, TrainClass } from "@/types/booking";
import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";

// Helper function to group bookings by date
const groupBookingsByDate = (bookings: Booking[]): Record<string, Booking[]> => {
  return bookings.reduce((acc, booking) => {
    const dateKey = booking.bookingDate; // Group by bookingDate
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(booking);
    return acc;
  }, {} as Record<string, Booking[]>);
};

const SL_CLASSES: TrainClass[] = ["SL", "UR"];

async function BookingsDisplay() {
  const allBookings = await getBookings();

  // Filter for pending: status is "Requested"
  const pendingBookingsRaw = allBookings
    .filter(booking => booking.status === "Requested")
    .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

  // Filter for completed: status is NOT "Requested"
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
           // This case should ideally not be hit if bookingsForDate has items,
           // but as a fallback, render all if somehow not categorized.
          <BookingList bookings={bookingsForDate} />
        )}
      </>
    );
  };

  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="pending">Pending (by Book by Date)</TabsTrigger>
        <TabsTrigger value="completed">Completed (by Book by Date)</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Pending Bookings</h2>
        {pendingDates.length === 0 ? (
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Pending Bookings</AlertTitle>
            <AlertDescription>No bookings are currently in 'Requested' status. Add a new one!</AlertDescription>
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
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Completed Bookings</AlertTitle>
            <AlertDescription>No bookings have been marked as 'Booked', 'Missed', 'Booking Failed', or 'User Cancelled' yet.</AlertDescription>
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
      <Skeleton className="h-8 w-48 mb-4" /> {/* Title skeleton */}
      
      {/* Skeleton for one date group */}
      <div className="space-y-6">
        <Skeleton className="h-7 w-1/3 mb-3" /> {/* Date heading skeleton */}
        {/* AC Bookings Skeleton */}
        <div className="space-y-3">
            <Skeleton className="h-6 w-1/4" /> {/* AC Bookings title skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
            </div>
        </div>
        {/* SL Bookings Skeleton */}
        <div className="space-y-3 mt-4">
            <Skeleton className="h-6 w-1/4" /> {/* SL Bookings title skeleton */}
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

export default function HomePage() {
  return (
    <AppShell showAddButton={true}>
      <Suspense fallback={<BookingsLoadingSkeleton />}>
        <BookingsDisplay />
      </Suspense>
    </AppShell>
  );
}
