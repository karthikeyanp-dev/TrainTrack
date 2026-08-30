"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useBookings } from "@/hooks/useBookings";
import { BookingCard } from "@/components/bookings/BookingCard";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, RefreshCcw } from "lucide-react";

export function RefundsManager() {
  const { data: bookings, isLoading: bookingsLoading } = useBookings();

  // Filter bookings: Booking Failed (Paid) or CNF & Cancelled AND no refundDetails yet
  const refundableBookings = useMemo(() =>
    bookings.filter(b =>
      (b.status === "Booking Failed (Paid)" || b.status === "CNF & Cancelled") &&
      !b.refundDetails
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [bookings]);

  // Group by booking date (fall back to createdAt date for older records) so the
  // Refunds tab uses the same date-group sections as the other booking tabs.
  const refundsByDate = useMemo(() =>
    refundableBookings.reduce((acc, booking) => {
      const key = booking.bookingDate || booking.createdAt.slice(0, 10);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(booking);
      return acc;
    }, {} as Record<string, typeof refundableBookings>), [refundableBookings]);

  const refundDates = useMemo(
    () => Object.keys(refundsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
    [refundsByDate]
  );

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
        <Accordion type="multiple" className="w-full space-y-4" defaultValue={refundDates.length > 0 ? [refundDates[0]] : []}>
          {refundDates.map((date, index) => (
            <motion.div
              key={`refund-${date}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <AccordionItem value={date} className="border rounded-2xl px-4 bg-card shadow-elevation-1">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <DateGroupHeading dateString={date} />
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                    {refundsByDate[date].map(booking => (
                      <BookingCard key={booking.id} booking={booking} isRefundMode={true} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      )}
    </div>
  );
}
