"use client";

import { useBookings } from "@/hooks/useBookings";
import { BookingCard } from "@/components/bookings/BookingCard";
import { Loader2, RefreshCcw } from "lucide-react";

export function RefundsManager() {
  const { data: bookings, isLoading: bookingsLoading } = useBookings();

  // Filter bookings: Booking Failed (Paid) or CNF & Cancelled AND no refundDetails yet
  const refundableBookings = bookings.filter(b =>
    (b.status === "Booking Failed (Paid)" || b.status === "CNF & Cancelled") &&
    !b.refundDetails
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold tracking-tight">Refund Tracking</h2>
        <div className="text-sm text-muted-foreground">
            Pending Refunds: <span className="font-medium text-foreground">{refundableBookings.length}</span>
        </div>
      </div>

      {bookingsLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
      ) : refundableBookings.length === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
          <RefreshCcw className="mx-auto h-8 w-8 mb-4 opacity-50" />
          <p>No pending refunds found.</p>
          <p className="text-sm mt-1">Bookings with status "Booking Failed (Paid)" or "CNF & Cancelled" will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {refundableBookings.map(booking => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}
