"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { BookingStatus } from "@/types/booking";
import { ALL_PAYMENT_METHODS } from "@/types/bookingRecord";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHandlers } from "@/lib/handlersClient";
import { getAccounts } from "@/lib/accountsClient";
import type { Handler } from "@/types/handler";
import type { IrctcAccount } from "@/types/account";

interface StatusReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: BookingStatus;
  bookingDetails: string;
  onConfirm: (reason: string, handler?: string, paymentDetails?: PaymentDetails) => void;
  isLoading?: boolean;
}

interface PaymentDetails {
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: number;
  methodUsed: string;
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
  
  // Payment details state (for Failed (Paid) and Cancelled (Booked))
  const [bookedBy, setBookedBy] = useState("");
  const [bookedAccount, setBookedAccount] = useState("");
  const [amountCharged, setAmountCharged] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  const requiresPaymentDetails = status === "Failed (Paid)" || status === "Cancelled (Booked)";

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
    
    // Load accounts if payment details are required
    if (requiresPaymentDetails) {
      setIsLoadingAccounts(true);
      getAccounts()
        .then((fetchedAccounts) => {
          if (isMounted) {
            setAccounts(fetchedAccounts);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingAccounts(false);
          }
        });
    }
    
    return () => {
      isMounted = false;
    };
  }, [open, requiresPaymentDetails]);

  const handleConfirm = () => {
    const paymentDetails = requiresPaymentDetails ? {
      bookedBy: bookedBy.trim(),
      bookedAccountUsername: bookedAccount,
      amountCharged: parseFloat(amountCharged),
      methodUsed: paymentMethod,
    } : undefined;
    
    onConfirm(reason.trim(), handler || undefined, paymentDetails);
    
    // Reset all fields
    setReason("");
    setHandler("");
    setBookedBy("");
    setBookedAccount("");
    setAmountCharged("");
    setPaymentMethod("");
  };

  const handleCancel = () => {
    setReason("");
    setHandler("");
    setBookedBy("");
    setBookedAccount("");
    setAmountCharged("");
    setPaymentMethod("");
    onOpenChange(false);
  };

  const isFormValid = () => {
    const reasonRequired = status === "Missed" || status === "Failed (Paid)" || status === "Failed (Unpaid)" || status === "Cancelled (Booked)" || status === "Cancelled (Pre-book)";
    if (reasonRequired && !reason.trim()) return false;
    
    if (requiresPaymentDetails) {
      return bookedBy.trim() && bookedAccount && amountCharged && parseFloat(amountCharged) > 0 && paymentMethod;
    }
    
    return true;
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

          {requiresPaymentDetails && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 mb-4">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-1">
                Payment Details Required
              </p>
              <p className="text-xs text-muted-foreground">
                Since payment was made, please provide the booking details for refund tracking.
              </p>
            </div>
          )}

          {requiresPaymentDetails && (
            <>
              <div className="space-y-2">
                <Label htmlFor="booked-by">Booked By <span className="text-destructive">*</span></Label>
                <Input
                  id="booked-by"
                  placeholder="Name of person who booked"
                  value={bookedBy}
                  onChange={(e) => setBookedBy(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="booked-account">Account Used <span className="text-destructive">*</span></Label>
                <Select
                  value={bookedAccount}
                  onValueChange={setBookedAccount}
                  disabled={isLoading || isLoadingAccounts}
                >
                  <SelectTrigger id="booked-account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.username}>
                        {acc.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount-charged">Amount Charged (₹) <span className="text-destructive">*</span></Label>
                <Input
                  id="amount-charged"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amountCharged}
                  onChange={(e) => setAmountCharged(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method <span className="text-destructive">*</span></Label>
                <Select
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  disabled={isLoading}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="status-handler">Handler</Label>
            <Select
              value={handler}
              onValueChange={setHandler}
              disabled={isLoading || isLoadingHandlers || handlers.length === 0}
            >
              <SelectTrigger id="status-handler">
                <SelectValue placeholder="Select handler" />
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
              Reason {requiresPaymentDetails || status === "Missed" || status === "Failed (Unpaid)" || status === "Cancelled (Pre-book)" ? "(Required)" : "(Optional)"}
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
            disabled={isLoading || !isFormValid()}
          >
            {isLoading ? "Updating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
