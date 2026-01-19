"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getRefundEligibleBookings, processRefund } from "@/lib/firestoreClient";
import { RefundCard } from "./RefundCard";
import { RefundDialog } from "./RefundDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Booking } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";

export function RefundsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedBookingRecord, setSelectedBookingRecord] = useState<BookingRecord | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);

  const { data: refundEligibleBookings = [], isLoading, error } = useQuery({
    queryKey: ["refundEligibleBookings"],
    queryFn: getRefundEligibleBookings,
  });

  const refundMutation = useMutation({
    mutationFn: ({ bookingId, amount, notes }: { bookingId: string; amount: number; notes: string }) =>
      processRefund(bookingId, amount, notes),
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Refund Processed",
          description: `Refund of ₹${result.booking?.refundAmount?.toFixed(2) || "0.00"} has been credited to the account.`,
        });
        queryClient.invalidateQueries({ queryKey: ["refundEligibleBookings"] });
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        setShowRefundDialog(false);
        setSelectedBooking(null);
        setSelectedBookingRecord(null);
      } else {
        toast({
          title: "Error Processing Refund",
          description: result.error || "Failed to process refund",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error Processing Refund",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMarkRefund = (booking: Booking, bookingRecord: BookingRecord | null) => {
    setSelectedBooking(booking);
    setSelectedBookingRecord(bookingRecord);
    setShowRefundDialog(true);
  };

  const handleConfirmRefund = (refundAmount: number, refundNotes: string, refundDate: string) => {
    if (!selectedBooking) return;
    refundMutation.mutate({
      bookingId: selectedBooking.id,
      amount: refundAmount,
      notes: refundNotes,
    });
  };

  // Calculate total pending refunds
  const totalPendingRefunds = refundEligibleBookings.reduce((acc, booking) => {
    // We would need to get booking records to calculate exact amounts
    return acc + 1;
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load refund-eligible bookings: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  if (refundEligibleBookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="rounded-full bg-muted p-6">
          <DollarSign className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Pending Refunds</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            There are no bookings with pending refunds at this time. Refunds will appear here when bookings
            are marked as "Failed (Paid)" or "Cancelled (Booked)".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <span className="font-semibold">{refundEligibleBookings.length}</span> booking
          {refundEligibleBookings.length !== 1 ? "s" : ""} waiting for refund processing
        </AlertDescription>
      </Alert>

      {/* Refund Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {refundEligibleBookings.map((booking) => (
          <RefundCard key={booking.id} booking={booking} onMarkRefund={handleMarkRefund} />
        ))}
      </div>

      {/* Refund Dialog */}
      {selectedBooking && (
        <RefundDialog
          open={showRefundDialog}
          onOpenChange={setShowRefundDialog}
          booking={selectedBooking}
          bookingRecord={selectedBookingRecord}
          onConfirm={handleConfirmRefund}
          isLoading={refundMutation.isPending}
        />
      )}
    </div>
  );
}
