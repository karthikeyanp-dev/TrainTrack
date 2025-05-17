import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingList } from "@/components/bookings/BookingList";
import { getBookings } from "@/actions/bookingActions";
import type { Booking } from "@/types/booking";
import { AppShell } from "@/components/layout/AppShell";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

async function BookingsDisplay() {
  const allBookings = await getBookings();
  const today = new Date().toISOString().split("T")[0];

  const pendingBookings = allBookings
    .filter(booking => {
      const isFutureOrToday = booking.journeyDate >= today;
      const isPendingStatus = booking.status === "Requested" || booking.status === "Booking Failed";
      return isFutureOrToday && isPendingStatus;
    })
    .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

  const completedBookings = allBookings
    .filter(booking => {
      const isPast = booking.journeyDate < today;
      const isCompletedStatus = booking.status === "Booked" || booking.status === "Missed";
      // If journeyDate is past and status was 'Requested', it implies 'Missed'.
      // If journeyDate is past and status was 'Booking Failed', it stays 'Booking Failed'.
      if (isPast && booking.status === "Requested") {
        // This logic should ideally be handled by a backend process or when status is updated
        // For UI display purposes, we can treat it as completed/missed here.
         return true; // Effectively moves to completed as 'Missed'
      }
      return isCompletedStatus || (isPast && booking.status === "Booking Failed");
    })
    .sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a.journeyDate).getTime()); // Show recent completed first

  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Pending Bookings</h2>
        <BookingList 
          bookings={pendingBookings} 
          emptyStateMessage="No pending bookings. Add a new one!" 
        />
      </TabsContent>
      <TabsContent value="completed" className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Completed Bookings</h2>
        <BookingList 
          bookings={completedBookings} 
          emptyStateMessage="No bookings have been completed yet." 
        />
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
      <Skeleton className="h-8 w-48" /> {/* Title skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <CardSkeleton key={i} />
        ))}
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
