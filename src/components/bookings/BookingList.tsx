import type { Booking } from "@/types/booking";
import { BookingCard } from "./BookingCard";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface BookingListProps {
  bookings: Booking[];
  emptyStateMessage?: string;
}

export function BookingList({ bookings, emptyStateMessage = "No bookings found." }: BookingListProps) {
  if (bookings.length === 0) {
    return (
      <Alert className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>{emptyStateMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bookings.map((booking) => (
        <BookingCard key={booking.id} booking={booking} />
      ))}
    </div>
  );
}
