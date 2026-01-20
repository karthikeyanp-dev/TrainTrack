"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHandlers } from "@/lib/handlersClient";
import type { Handler } from "@/types/handler";

interface StatusReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: BookingStatus;
  bookingDetails: string;
  onConfirm: (reason: string, handler?: string) => void;
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
  const [handler, setHandler] = useState("");
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [isLoadingHandlers, setIsLoadingHandlers] = useState(false);

  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    setIsLoadingHandlers(true);
    getHandlers()
      .then((fetchedHandlers) => {
        if (isMounted) {
          setHandlers(fetchedHandlers);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingHandlers(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [open]);

  const handleConfirm = () => {
    onConfirm(reason.trim(), handler || undefined);
    setReason("");
    setHandler("");
  };

  const handleCancel = () => {
    setReason("");
    setHandler("");
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
            <Label htmlFor="status-handler">
              {status === "Cancelled" || status === "Cancelled (Booked)" ? "Cancelling person" : "Handler"}
            </Label>
            <Select
              value={handler}
              onValueChange={setHandler}
              disabled={isLoading || isLoadingHandlers || handlers.length === 0}
            >
              <SelectTrigger id="status-handler">
                <SelectValue
                  placeholder={
                    status === "Cancelled" || status === "Cancelled (Booked)"
                      ? "Select cancelling person"
                      : "Select handler"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {handlers.map((h) => (
                  <SelectItem key={h.id} value={h.name}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-reason">
              Reason {status === "Missed" || status === "Failed" || status === "Failed (Paid)" ? "(Required)" : "(Optional)"}
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
            disabled={isLoading || ((status === "Missed" || status === "Failed" || status === "Failed (Paid)") && !reason.trim())}
          >
            {isLoading ? "Updating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
