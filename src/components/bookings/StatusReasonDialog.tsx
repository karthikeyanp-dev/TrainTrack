"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { BookingStatus } from "@/types/booking";

interface StatusReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: BookingStatus;
  bookingDetails: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

export function StatusReasonDialog({
  open,
  onOpenChange,
  status,
  bookingDetails,
  onConfirm,
  isLoading = false,
}: StatusReasonDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason(""); // Reset after confirm
  };

  const handleCancel = () => {
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Status to "{status}"</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {bookingDetails}
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="status-reason">
              Reason {status === "Missed" || status === "Booking Failed" ? "(Required)" : "(Optional)"}
            </Label>
            <Textarea
              id="status-reason"
              placeholder={`Enter reason for ${status.toLowerCase()}...`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || ((status === "Missed" || status === "Booking Failed") && !reason.trim())}
          >
            {isLoading ? "Updating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
