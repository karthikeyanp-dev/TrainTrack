
export const dynamic = 'force-dynamic'; // Ensures the page is re-rendered on every request

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingList } from "@/components/bookings/BookingList";
import { getBookings } from "@/actions/bookingActions";
import type { Booking } from "@/types/booking";
import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// Helper function to group bookings by date
const groupBookingsByDate = (bookings: Booking[]): Record<string, Booking[]> => {
  return bookings.reduce((acc, booking) => {
    const dateKey = booking.journeyDate; // journeyDate is 'YYYY-MM-DD'
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(booking);
    return acc;
  }, {} as Record<string, Booking[]>);
};

async function BookingsDisplay() {
  const allBookings = await getBookings();
  const today = new Date().toISOString().split("T")[0];

  const pendingBookingsRaw = allBookings
    .filter(booking => booking.status === "Requested" && booking.journeyDate >= today)
    .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

  const completedBookingsRaw = allBookings
    .filter(booking => booking.status !== "Requested") // "Booked", "Missed", "Booking Failed", "User Cancelled"
    .sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a.journeyDate).getTime()); // Show recent completed first

  const pendingBookingsByDate = groupBookingsByDate(pendingBookingsRaw);
  const pendingDates = Object.keys(pendingBookingsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const completedBookingsByDate = groupBookingsByDate(completedBookingsRaw);
  const completedDates = Object.keys(completedBookingsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

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
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Pending Bookings</AlertTitle>
            <AlertDescription>No bookings are currently in 'Requested' status for upcoming dates. Add a new one!</AlertDescription>
          </Alert>
        ) : (
          pendingDates.map(date => (
            <div key={date} className="mb-8">
              <h3 className="text-xl font-medium mb-3 pb-2 border-b">
                {/* Append T00:00:00 to ensure date is parsed in local timezone context for formatting */}
                {format(new Date(date + 'T00:00:00'), "PPP")} 
              </h3>
              <BookingList bookings={pendingBookingsByDate[date]} />
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
            <div key={date} className="mb-8">
              <h3 className="text-xl font-medium mb-3 pb-2 border-b">
                {/* Append T00:00:00 to ensure date is parsed in local timezone context for formatting */}
                {format(new Date(date + 'T00:00:00'), "PPP")}
              </h3>
              <BookingList bookings={completedBookingsByDate[date]} />
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
      {/* Skeleton for date group */}
      <div className="space-y-6">
        <Skeleton className="h-7 w-1/3 mb-3" /> {/* Date heading skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map(i => ( // Show a couple of card skeletons per group
            <CardSkeleton key={`group1-${i}`} />
          ))}
        </div>
      </div>
       <div className="space-y-6 mt-6">
        <Skeleton className="h-7 w-1/3 mb-3" /> {/* Date heading skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1].map(i => ( 
            <CardSkeleton key={`group2-${i}`} />
          ))}
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
