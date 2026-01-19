"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Booking } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  bookingRecord: BookingRecord | null;
  onConfirm: (refundAmount: number, refundNotes: string, refundDate: string) => void;
  isLoading: boolean;
}

export function RefundDialog({
  open,
  onOpenChange,
  booking,
  bookingRecord,
  onConfirm,
  isLoading,
}: RefundDialogProps) {
  const defaultAmount = bookingRecord?.amountCharged || 0;
  const [refundAmount, setRefundAmount] = useState<string>(defaultAmount.toString());
  const [refundNotes, setRefundNotes] = useState<string>("");
  const [refundDate, setRefundDate] = useState<Date>(new Date());

  const handleConfirm = () => {
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }
    const dateString = format(refundDate, "yyyy-MM-dd");
    onConfirm(amount, refundNotes, dateString);
  };

  const accountUsername = bookingRecord?.bookedAccountUsername || "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Mark Refund as Received</DialogTitle>
          <DialogDescription>
            Process refund for booking from {booking.source.toUpperCase()} to{" "}
            {booking.destination.toUpperCase()} for {booking.userName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Refund Amount */}
          <div className="space-y-2">
            <Label htmlFor="refundAmount">Refund Amount (₹)</Label>
            <Input
              id="refundAmount"
              type="number"
              step="0.01"
              min="0"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="Enter refund amount"
            />
          </div>

          {/* Refund Date */}
          <div className="space-y-2">
            <Label>Refund Received Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !refundDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {refundDate ? format(refundDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={refundDate}
                  onSelect={(date) => date && setRefundDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="refundNotes">Notes (Optional)</Label>
            <Textarea
              id="refundNotes"
              value={refundNotes}
              onChange={(e) => setRefundNotes(e.target.value)}
              placeholder="Add any notes about the refund..."
              rows={3}
            />
          </div>

          {/* Account Preview */}
          <div className="rounded-lg bg-muted p-4 space-y-1">
            <p className="text-sm font-medium">Refund will be credited to:</p>
            <p className="text-sm text-muted-foreground">Account: {accountUsername}</p>
            <p className="text-sm text-muted-foreground">
              Amount: ₹{parseFloat(refundAmount || "0").toFixed(2)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !refundAmount || parseFloat(refundAmount) <= 0}
          >
            {isLoading ? "Processing..." : "Confirm Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
