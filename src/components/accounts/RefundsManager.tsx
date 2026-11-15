"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useBookings } from "@/hooks/useBookings";
import { BookingCard } from "@/components/bookings/BookingCard";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Banknote, Landmark, Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatRupees,
  getRefundTotals,
  hasOpenCustomerRefund,
  hasOpenIrctcRefund,
  hasOpenRefund,
} from "@/lib/cancellations";

type RefundFilter = "all" | "irctc" | "customer";

export function RefundsManager() {
  const { data: bookings, isLoading: bookingsLoading } = useBookings();
  const [filter, setFilter] = useState<RefundFilter>("all");

  // Every booking with a refund leg still open: the IRCTC refund has not
  // arrived, or the customer has not been paid back. This covers fully
  // cancelled tickets, partial cancellations and failed-but-paid bookings.
  const openBookings = useMemo(
    () =>
      bookings
        .filter(hasOpenRefund)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [bookings]
  );

  const totals = useMemo(() => getRefundTotals(openBookings), [openBookings]);
  const irctcCount = useMemo(() => openBookings.filter(hasOpenIrctcRefund).length, [openBookings]);
  const customerCount = useMemo(() => openBookings.filter(hasOpenCustomerRefund).length, [openBookings]);

  const visibleBookings = useMemo(() => {
    if (filter === "irctc") return openBookings.filter(hasOpenIrctcRefund);
    if (filter === "customer") return openBookings.filter(hasOpenCustomerRefund);
    return openBookings;
  }, [openBookings, filter]);

  // Group by booking date (fall back to createdAt date for older records) so the
  // Refunds tab uses the same date-group sections as the other booking tabs.
  const refundsByDate = useMemo(() =>
    visibleBookings.reduce((acc, booking) => {
      const key = booking.bookingDate || booking.createdAt.slice(0, 10);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(booking);
      return acc;
    }, {} as Record<string, typeof visibleBookings>), [visibleBookings]);

  const refundDates = useMemo(
    () => Object.keys(refundsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
    [refundsByDate]
  );

  const filterOptions: { value: RefundFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: openBookings.length },
    { value: "irctc", label: "Awaiting IRCTC", count: irctcCount },
    { value: "customer", label: "Owed to customer", count: customerCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Refund Tracking</h2>
        <div className="text-sm text-muted-foreground">
          Open: <span className="font-medium text-foreground">{openBookings.length}</span>
        </div>
      </div>

      {bookingsLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
      ) : openBookings.length === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
          <RefreshCcw className="mx-auto h-8 w-8 mb-4 opacity-50" />
          <p>No pending refunds found.</p>
          <p className="text-sm mt-1">Cancelled passengers and &quot;Booking Failed (Paid)&quot; bookings appear here until both the IRCTC refund and the customer payback are closed.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-3 shadow-elevation-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" />
                Awaiting from IRCTC
              </div>
              <div className="mt-1 text-xl font-bold">{formatRupees(totals.awaitingIrctc)}</div>
              <div className="text-xs text-muted-foreground">
                {totals.awaitingIrctcCount} refund{totals.awaitingIrctcCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-3 shadow-elevation-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Banknote className="h-3.5 w-3.5" />
                Owed to customers
              </div>
              <div className="mt-1 text-xl font-bold">{formatRupees(totals.owedToCustomers)}</div>
              <div className="text-xs text-muted-foreground">
                {totals.owedToCustomersCount} payback{totals.owedToCustomersCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter refunds">
            {filterOptions.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>

          {visibleBookings.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg text-sm text-muted-foreground">
              Nothing open in this view.
            </div>
          ) : (
            <Accordion
              key={filter}
              type="multiple"
              className="w-full space-y-4"
              defaultValue={refundDates.length > 0 ? [refundDates[0]] : []}
            >
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
        </>
      )}
    </div>
  );
}
