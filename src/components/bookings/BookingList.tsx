
import type { Booking } from "@/types/booking";
import { BookingCard } from "./BookingCard";

interface BookingListProps {
  bookings: Booking[];
  selectionMode?: boolean;
  selectedBookingIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
}

export function BookingList({ bookings, selectionMode, selectedBookingIds, onToggleSelection }: BookingListProps) {
  // If the parent component (BookingsDisplay) filters correctly, 
  // 'bookings' should not be empty when this component is rendered for a date group.
  // If it somehow is, rendering nothing is cleaner than an alert here.
  if (bookings.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bookings.map((booking) => (
        <BookingCard 
          key={booking.id} 
          booking={booking} 
          selectionMode={selectionMode}
          isSelected={selectedBookingIds?.has(booking.id)}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </div>
  );
}
