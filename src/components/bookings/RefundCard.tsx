"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, DollarSign, Users, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { Booking } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";
import { getBookingRecordByBookingId } from "@/lib/firestoreClient";
import { cn } from "@/lib/utils";

interface RefundCardProps {
  booking: Booking;
  onMarkRefund: (booking: Booking, bookingRecord: BookingRecord | null) => void;
}

export function RefundCard({ booking, onMarkRefund }: RefundCardProps) {
  const labelHighlightStyle = { color: '#AB945E', fontWeight: 700 };
  const sourceDestStyle = { color: '#dfa92a', fontWeight: 700 };
  const [bookingRecord, setBookingRecord] = useState<BookingRecord | null>(null);
  const [clientFormattedJourneyDate, setClientFormattedJourneyDate] = useState<string | null>(null);

  const fetchBookingRecord = useCallback(async () => {
    try {
      const record = await getBookingRecordByBookingId(booking.id);
      setBookingRecord(record);
    } catch (error) {
      console.error("Failed to fetch booking record:", error);
    }
  }, [booking.id]);

  useEffect(() => {
    fetchBookingRecord();
  }, [fetchBookingRecord]);

  const formatDate = useCallback((dateString: string | any): string => {
    if (!dateString) return "N/A";
    try {
      if (typeof dateString === "object" && dateString && typeof dateString.toDate === "function") {
        return format(dateString.toDate(), "MMM dd, yyyy");
      }

      if (typeof dateString !== "string") {
        return "Invalid Type";
      }

      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = new Date(dateString + "T12:00:00");
        if (isNaN(date.getTime())) {
          return "Invalid Date";
        }
        return format(date, "MMM dd, yyyy");
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return format(date, "MMM dd, yyyy");
    } catch (error) {
      return "Error Date";
    }
  }, []);

  useEffect(() => {
    setClientFormattedJourneyDate(formatDate(booking.journeyDate));
  }, [booking.journeyDate, formatDate]);

  const statusColor = booking.status === "Failed (Paid)" ? "text-red-700" : "text-orange-600";
  const statusIcon = booking.status === "Failed (Paid)" ? 
    <DollarSign className="h-4 w-4" /> : 
    <RefreshCw className="h-4 w-4" />;

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg md:text-xl">
            <span style={sourceDestStyle}>{booking.source.toUpperCase()}</span>{" "}
            <span className="text-sm text-gray-400">to</span>{" "}
            <span style={sourceDestStyle}>{booking.destination.toUpperCase()}</span>
          </CardTitle>
          <Badge variant="secondary" className={cn("flex items-center gap-1", statusColor)}>
            {statusIcon}
            {booking.status}
          </Badge>
        </div>
        <CardDescription>
          For <b>{booking.userName}</b>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>
            <span style={labelHighlightStyle}>Journey:</span> {clientFormattedJourneyDate || "..."}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>
            <span style={labelHighlightStyle}>Passengers:</span>{" "}
            {booking.passengers.map(p => p.name).join(", ")}
          </span>
        </div>

        {bookingRecord ? (
          <>
            <div className="rounded-lg bg-muted p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium" style={labelHighlightStyle}>
                  Amount Charged:
                </span>
                <span className="text-lg font-semibold">₹{bookingRecord.amountCharged.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Account:</span>
                <span className="font-medium">{bookingRecord.bookedAccountUsername}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-medium">{bookingRecord.methodUsed}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Booked By:</span>
                <span className="font-medium">{bookingRecord.bookedBy}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3 text-xs">
            <p className="font-semibold text-orange-700 dark:text-orange-400 mb-1">⚠️ No Booking Record Found</p>
            <p className="text-muted-foreground">
              This booking doesn't have payment details. It may have failed before completing payment, or the record is missing.
              Please verify if payment was actually made before processing a refund.
            </p>
          </div>
        )}

        {booking.statusReason && (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-2 text-xs">
            <span className="font-semibold">Reason:</span> {booking.statusReason}
            {booking.statusHandler && (
              <span className="block mt-1">
                <span className="font-semibold">Handler:</span> {booking.statusHandler}
              </span>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2">
        {!bookingRecord && (
          <p className="text-xs text-muted-foreground text-center w-full">
            Button disabled: Payment details required to process refund
          </p>
        )}
        <Button 
          onClick={() => onMarkRefund(booking, bookingRecord)} 
          className="w-full"
          disabled={!bookingRecord}
        >
          <DollarSign className="mr-2 h-4 w-4" />
          Mark Refund as Received
        </Button>
      </CardFooter>
    </Card>
  );
}
