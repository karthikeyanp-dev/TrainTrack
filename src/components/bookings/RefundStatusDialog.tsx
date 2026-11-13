"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useHandlers } from "@/hooks/useHandlers";
import { cn } from "@/lib/utils";
import { getAccountByUsername } from "@/lib/accountsClient";
import { updateBookingCancellation, type CancellationPatch } from "@/lib/firestoreClient";
import { formatRupees, parseAmountInput, todayDateKey } from "@/lib/cancellations";
import {
  ALL_CUSTOMER_REFUND_STATUSES,
  ALL_IRCTC_REFUND_STATUSES,
  type Booking,
  type BookingCancellation,
  type CustomerRefundStatus,
  type IrctcRefundStatus,
} from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";
import { RefundRecipientPicker, type RefundRecipientValue } from "./RefundRecipientPicker";

export type RefundLeg = "irctc" | "customer";

const CUSTOMER_PAYBACK_METHODS = ["UPI", "Cash", "Bank Transfer", "Other"] as const;

interface RefundStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  entry: BookingCancellation;
  leg: RefundLeg;
  /** Booked details for this booking; decides whether the IRCTC wallet can be the recipient. */
  record: BookingRecord | null;
}

function StatusToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup">
      {options.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Update one refund leg of a cancellation: IRCTC -> wallet/handler, or business -> customer. */
export function RefundStatusDialog({ open, onOpenChange, booking, entry, leg, record }: RefundStatusDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: handlers = [] } = useHandlers();
  const [isSaving, setIsSaving] = useState(false);

  // IRCTC leg
  const [irctcStatus, setIrctcStatus] = useState<IrctcRefundStatus>("Pending");
  const [recipient, setRecipient] = useState<RefundRecipientValue>({ recipientType: "Other", recipientName: "" });
  const [expectedAmount, setExpectedAmount] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayDateKey());

  // Customer leg
  const [customerStatus, setCustomerStatus] = useState<CustomerRefundStatus>("Pending");
  const [customerName, setCustomerName] = useState("");
  const [owedAmount, setOwedAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(todayDateKey());
  const [paidBy, setPaidBy] = useState("");
  const [paidMethod, setPaidMethod] = useState<string>("UPI");
  const [note, setNote] = useState("");

  const isFailedPayment = entry.kind === "failed-payment";
  // IRCTC only refunds to the wallet when the ticket was paid from it.
  const walletUsername =
    !isFailedPayment && record?.methodUsed === "Wallet" ? record.bookedAccountUsername : undefined;

  // Load the entry into the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const irctc = entry.irctcRefund;
    setIrctcStatus(irctc.status);
    setRecipient({ recipientType: irctc.recipientType, recipientName: irctc.recipientName || "" });
    setExpectedAmount(irctc.expectedAmount != null ? String(irctc.expectedAmount) : "");
    setReceivedAmount(
      irctc.receivedAmount != null ? String(irctc.receivedAmount) : irctc.expectedAmount != null ? String(irctc.expectedAmount) : ""
    );
    setReceivedDate(irctc.receivedDate || todayDateKey());

    const customer = entry.customerRefund;
    setCustomerStatus(customer.status);
    setCustomerName(customer.recipientName || booking.userName || "");
    setOwedAmount(customer.amount != null ? String(customer.amount) : "");
    setPaidAmount(customer.paidAmount != null ? String(customer.paidAmount) : customer.amount != null ? String(customer.amount) : "");
    setPaidDate(customer.paidDate || todayDateKey());
    setPaidBy(customer.paidBy || "");
    setPaidMethod(customer.method || "UPI");
    setNote(customer.note || "");
    // Only re-run when the dialog (re)opens or targets a different entry/leg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry.id, leg]);

  const handleIrctcStatusChange = (status: IrctcRefundStatus) => {
    setIrctcStatus(status);
    if (status === "Received" && receivedAmount.trim() === "" && expectedAmount.trim() !== "") {
      setReceivedAmount(expectedAmount);
    }
  };

  const handleCustomerStatusChange = (status: CustomerRefundStatus) => {
    setCustomerStatus(status);
    if (status === "Paid" && paidAmount.trim() === "" && owedAmount.trim() !== "") {
      setPaidAmount(owedAmount);
    }
  };

  const fail = (description: string) => {
    toast({ title: "Check the details", description, variant: "destructive" });
  };

  const buildIrctcPatch = async (): Promise<{ patch: CancellationPatch; warning?: string } | null> => {
    const expected = parseAmountInput(expectedAmount);
    if (expectedAmount.trim() !== "" && expected === undefined) {
      fail("Enter a valid expected refund amount.");
      return null;
    }

    let received: number | undefined;
    if (irctcStatus === "Received") {
      received = parseAmountInput(receivedAmount);
      if (received === undefined) {
        fail("Enter the refund amount that was received.");
        return null;
      }
      if (!receivedDate) {
        fail("Enter the date the refund was received.");
        return null;
      }
    }
    if (recipient.recipientType === "Handler" && !recipient.recipientName) {
      fail("Select the handler who receives the refund.");
      return null;
    }

    let accountId: string | undefined;
    let warning: string | undefined;
    if (recipient.recipientType === "Wallet") {
      accountId = entry.irctcRefund.accountId;
      const username = recipient.recipientName || walletUsername;
      if (!accountId && username) {
        const account = await getAccountByUsername(username);
        accountId = account?.id;
      }
      if (!accountId && irctcStatus === "Received") {
        warning = "The IRCTC account could not be found, so its wallet balance was not changed.";
      }
    }

    return {
      warning,
      patch: {
        irctcRefund: {
          status: irctcStatus,
          recipientType: recipient.recipientType,
          recipientName: recipient.recipientName.trim() || undefined,
          accountId,
          expectedAmount: expected,
          receivedAmount: received,
          receivedDate: irctcStatus === "Received" ? receivedDate : undefined,
        },
      },
    };
  };

  const buildCustomerPatch = (): { patch: CancellationPatch; warning?: string } | null => {
    const owed = parseAmountInput(owedAmount);
    if (owedAmount.trim() !== "" && owed === undefined) {
      fail("Enter a valid amount owed to the customer.");
      return null;
    }

    let paid: number | undefined;
    if (customerStatus === "Paid") {
      paid = parseAmountInput(paidAmount);
      if (paid === undefined) {
        fail("Enter the amount paid to the customer.");
        return null;
      }
      if (!paidDate) {
        fail("Enter the date the customer was paid.");
        return null;
      }
    }

    return {
      patch: {
        customerRefund: {
          status: customerStatus,
          recipientName: customerName.trim() || undefined,
          amount: owed,
          paidAmount: paid,
          paidDate: customerStatus === "Paid" ? paidDate : undefined,
          paidBy: customerStatus === "Paid" ? paidBy.trim() || undefined : undefined,
          method: customerStatus === "Paid" ? paidMethod : undefined,
          note: note.trim() || undefined,
        },
      },
    };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const built = leg === "irctc" ? await buildIrctcPatch() : buildCustomerPatch();
      if (!built) return;

      const result = await updateBookingCancellation(booking.id, entry.id, built.patch);
      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to update refund.", variant: "destructive" });
        return;
      }

      const warning = result.warning || built.warning;
      toast({
        title: leg === "irctc" ? "IRCTC refund updated" : "Customer payback updated",
        description: warning || `Saved for ${booking.userName}.`,
        ...(warning ? { variant: "destructive" as const } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const willCreditWallet =
    leg === "irctc" && irctcStatus === "Received" && recipient.recipientType === "Wallet" && !isFailedPayment;
  const previouslyCredited = Number(entry.irctcRefund.walletCredited) || 0;
  const handlerNames = handlers.map(h => h.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{leg === "irctc" ? "IRCTC refund" : "Pay back customer"}</DialogTitle>
          <DialogDescription>
            {booking.source.toUpperCase()} to {booking.destination.toUpperCase()} for {booking.userName}
            {entry.passengerNames.length > 0 && <> · {entry.passengerNames.join(", ")}</>}
          </DialogDescription>
        </DialogHeader>

        {leg === "irctc" ? (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <StatusToggle
                options={ALL_IRCTC_REFUND_STATUSES}
                value={irctcStatus}
                onChange={handleIrctcStatusChange}
                disabled={isSaving}
              />
            </div>

            {irctcStatus !== "No Refund" && (
              <>
                <RefundRecipientPicker
                  idPrefix={`refund-${entry.id}`}
                  value={recipient}
                  onChange={setRecipient}
                  handlers={handlers}
                  walletUsername={walletUsername}
                  disabled={isSaving}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-expected-${entry.id}`}>
                      {isFailedPayment ? "Amount debited (₹)" : "Expected refund (₹)"}
                    </Label>
                    <Input
                      id={`refund-expected-${entry.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 1200"
                      value={expectedAmount}
                      onChange={(e) => setExpectedAmount(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  {irctcStatus === "Received" && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`refund-received-${entry.id}`}>Received (₹)</Label>
                      <Input
                        id={`refund-received-${entry.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={receivedAmount}
                        onChange={(e) => setReceivedAmount(e.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                  )}
                </div>

                {irctcStatus === "Received" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-received-date-${entry.id}`}>Date received</Label>
                    <Input
                      id={`refund-received-date-${entry.id}`}
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                )}
              </>
            )}

            {irctcStatus === "No Refund" && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Use this when IRCTC returns nothing, e.g. a confirmed Tatkal ticket.
              </p>
            )}

            {willCreditWallet && (
              <p className="flex items-start gap-1.5 rounded-md bg-blue-500/10 px-2.5 py-2 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  The received amount is added to the wallet balance of{" "}
                  <span className="font-mono font-semibold">{recipient.recipientName || walletUsername}</span>
                  {previouslyCredited > 0 && <> (replacing the {formatRupees(previouslyCredited)} added earlier)</>}.
                </span>
              </p>
            )}
            {!willCreditWallet && previouslyCredited > 0 && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Saving removes the {formatRupees(previouslyCredited)} that was added to the wallet balance for this refund.
              </p>
            )}
            {isFailedPayment && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                A failed payment is never deducted from a wallet balance in this app, so its refund does not change one either.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <StatusToggle
                options={ALL_CUSTOMER_REFUND_STATUSES}
                value={customerStatus}
                onChange={handleCustomerStatusChange}
                disabled={isSaving}
              />
            </div>

            {customerStatus !== "Not Applicable" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`payback-name-${entry.id}`}>Pay back to</Label>
                  <Input
                    id={`payback-name-${entry.id}`}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`payback-owed-${entry.id}`}>Amount owed (₹)</Label>
                  <Input
                    id={`payback-owed-${entry.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 1200"
                    value={owedAmount}
                    onChange={(e) => setOwedAmount(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>
            )}

            {customerStatus === "Paid" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`payback-paid-${entry.id}`}>Amount paid (₹)</Label>
                    <Input
                      id={`payback-paid-${entry.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`payback-date-${entry.id}`}>Date paid</Label>
                    <Input
                      id={`payback-date-${entry.id}`}
                      type="date"
                      value={paidDate}
                      onChange={(e) => setPaidDate(e.target.value)}
                      disabled={isSaving}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`payback-by-${entry.id}`}>Paid by</Label>
                    <Input
                      id={`payback-by-${entry.id}`}
                      list={`payback-by-options-${entry.id}`}
                      placeholder="Who paid the customer"
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                      disabled={isSaving}
                    />
                    <datalist id={`payback-by-options-${entry.id}`}>
                      {handlerNames.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`payback-method-${entry.id}`}>Method</Label>
                    <Select value={paidMethod} onValueChange={setPaidMethod} disabled={isSaving}>
                      <SelectTrigger id={`payback-method-${entry.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_PAYBACK_METHODS.map(method => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {customerStatus === "Not Applicable" && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Use this when nothing has to be returned, e.g. the customer had not paid yet.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`payback-note-${entry.id}`}>Note (optional)</Label>
              <Textarea
                id={`payback-note-${entry.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isSaving}
                className="min-h-[60px]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
