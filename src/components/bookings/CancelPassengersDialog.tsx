"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { cancelBookingPassengers, type CancellationSelection } from "@/lib/firestoreClient";
import {
  formatRupees,
  getCancelledPids,
  getDefaultRecipient,
  isPassengerCancelled,
  parseAmountInput,
  roundMoney,
  suggestFareShare,
  todayDateKey,
} from "@/lib/cancellations";
import type { Booking } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";
import { RefundRecipientPicker, type RefundRecipientValue } from "./RefundRecipientPicker";

interface CancelPassengersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The booking to cancel from — or every booking of a group (one PNR). */
  bookings: Booking[];
  /** Booked details covering these bookings; used to suggest the fare and the refund recipient. */
  record: Pick<BookingRecord, "bookedBy" | "bookedAccountUsername" | "methodUsed" | "amountCharged" | "bookedAmount"> | null;
  /** Start with every travelling passenger ticked (cancelling the whole ticket). */
  preselectAll?: boolean;
}

interface PassengerRow {
  key: string;
  bookingId: string;
  index: number;
  name: string;
  age: number;
  gender: string;
  cancelled: boolean;
  /** False for passengers already cancelled or on a booking that is not "Booked". */
  selectable: boolean;
}

const toAmountText = (value: number): string => (value > 0 ? String(value) : "");

/**
 * Cancel some or all passengers of a booked ticket and capture what is expected
 * back from IRCTC and what is owed to the customer. Marking either refund as
 * received / paid happens afterwards from the cancellation shown on the card.
 */
export function CancelPassengersDialog({ open, onOpenChange, bookings, record, preselectAll = false }: CancelPassengersDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: handlers = [] } = useHandlers();
  const [isSaving, setIsSaving] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelledOn, setCancelledOn] = useState(todayDateKey());
  const [cancelledBy, setCancelledBy] = useState("");
  const [reason, setReason] = useState("");
  const [chargeText, setChargeText] = useState("");
  const [noIrctcRefund, setNoIrctcRefund] = useState(false);
  const [nothingToPayBack, setNothingToPayBack] = useState(false);
  // Amounts follow the suggestion until the user types their own value.
  const [fareOverride, setFareOverride] = useState<string | null>(null);
  const [expectedOverride, setExpectedOverride] = useState<string | null>(null);
  const [customerOverride, setCustomerOverride] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<RefundRecipientValue>({ recipientType: "Other", recipientName: "" });

  const isGroup = bookings.length > 1;
  const walletUsername = record?.methodUsed === "Wallet" ? record.bookedAccountUsername : undefined;

  const rowsByBooking = useMemo(() => {
    return bookings.map(booking => {
      const cancelledPids = getCancelledPids(booking);
      const rows: PassengerRow[] = booking.passengers
        .map((passenger, index) => {
          const cancelled = isPassengerCancelled(booking, passenger, cancelledPids);
          return {
            key: `${booking.id}:${index}`,
            bookingId: booking.id,
            index,
            name: passenger.name,
            age: passenger.age,
            gender: passenger.gender,
            cancelled,
            selectable: !cancelled && booking.status === "Booked",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { booking, rows };
    });
  }, [bookings]);

  const allRows = useMemo(() => rowsByBooking.flatMap(group => group.rows), [rowsByBooking]);
  const selectableRows = useMemo(() => allRows.filter(row => row.selectable), [allRows]);
  const totalPassengers = allRows.length;

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSelected(preselectAll ? new Set(selectableRows.map(row => row.key)) : new Set());
    setCancelledOn(todayDateKey());
    setCancelledBy("");
    setReason("");
    setChargeText("");
    setFareOverride(null);
    setExpectedOverride(null);
    setCustomerOverride(null);
    setNothingToPayBack(false);
    setNoIrctcRefund(false);
    const fallback = getDefaultRecipient(record);
    setRecipient({ recipientType: fallback.recipientType, recipientName: fallback.recipientName || "" });
    // Only re-run when the dialog (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedCount = selectableRows.filter(row => selected.has(row.key)).length;
  const allSelected = selectableRows.length > 0 && selectedCount === selectableRows.length;

  const suggestedFare = suggestFareShare(record, totalPassengers, selectedCount);
  const fareText = fareOverride ?? toAmountText(suggestedFare);
  const fare = parseAmountInput(fareText);
  const charge = parseAmountInput(chargeText);
  const suggestedExpected = Math.max(roundMoney((fare || 0) - (charge || 0)), 0);
  const expectedText = expectedOverride ?? toAmountText(suggestedExpected);
  const expected = parseAmountInput(expectedText);
  const customerText = customerOverride ?? (noIrctcRefund ? "" : expectedText);
  const customerAmount = parseAmountInput(customerText);

  const hasTatkal = bookings.some(b => b.bookingType === "Tatkal");
  const fullyCancelledBookings = rowsByBooking.filter(({ rows }) => {
    const travelling = rows.filter(row => row.selectable);
    return travelling.length > 0 && travelling.every(row => selected.has(row.key));
  });

  const toggleRow = (key: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectableRows.map(row => row.key)) : new Set());
  };

  const handleNoIrctcRefundChange = (checked: boolean) => {
    setNoIrctcRefund(checked);
    // With nothing coming back there is usually nothing to hand to the customer either.
    if (customerOverride === null) setNothingToPayBack(checked);
  };

  const fail = (description: string) => {
    toast({ title: "Check the details", description, variant: "destructive" });
  };

  const handleConfirm = async () => {
    if (selectedCount === 0) return fail("Select at least one passenger to cancel.");
    if (!cancelledOn) return fail("Enter the cancellation date.");
    if (fareText.trim() !== "" && fare === undefined) return fail("Enter a valid fare amount.");
    if (chargeText.trim() !== "" && charge === undefined) return fail("Enter a valid cancellation charge.");
    if (!noIrctcRefund && expectedText.trim() !== "" && expected === undefined) return fail("Enter a valid expected refund.");
    if (!nothingToPayBack && customerText.trim() !== "" && customerAmount === undefined) {
      return fail("Enter a valid amount to pay back to the customer.");
    }
    if (!noIrctcRefund && recipient.recipientType === "Handler" && !recipient.recipientName) {
      return fail("Select the handler who will receive the refund.");
    }

    setIsSaving(true);
    try {
      let accountId: string | undefined;
      if (!noIrctcRefund && recipient.recipientType === "Wallet") {
        const username = recipient.recipientName || walletUsername;
        if (username) {
          const account = await getAccountByUsername(username);
          accountId = account?.id;
        }
      }

      const selections: CancellationSelection[] = rowsByBooking
        .map(({ booking, rows }) => {
          const picked = rows
            .filter(row => row.selectable && selected.has(row.key))
            .sort((a, b) => a.index - b.index);
          return {
            bookingId: booking.id,
            passengerIndexes: picked.map(row => row.index),
            expectedNames: picked.map(row => row.name),
          };
        })
        .filter(selection => selection.passengerIndexes.length > 0);

      const result = await cancelBookingPassengers({
        selections,
        details: {
          cancelledOn,
          cancelledBy: cancelledBy || undefined,
          reason: reason.trim() || undefined,
          fareCancelled: fare,
          cancellationCharge: charge,
          irctcRefund: noIrctcRefund
            ? { status: "No Refund", recipientType: "Other" }
            : {
                status: "Pending",
                recipientType: recipient.recipientType,
                recipientName: recipient.recipientName.trim() || undefined,
                accountId,
                expectedAmount: expected,
              },
          customerRefund: nothingToPayBack
            ? { status: "Not Applicable" }
            : { status: "Pending", amount: customerAmount },
        },
      });

      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to cancel passengers.", variant: "destructive" });
        return;
      }

      const fullCount = result.fullyCancelledBookingIds?.length || 0;
      toast({
        title: selectedCount === 1 ? "Passenger cancelled" : `${selectedCount} passengers cancelled`,
        description:
          fullCount > 0
            ? fullCount === bookings.length
              ? "Nobody is travelling any more, so the booking is now CNF & Cancelled."
              : `${fullCount} booking${fullCount === 1 ? " is" : "s are"} now CNF & Cancelled.`
            : "The remaining passengers stay booked.",
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      bookings.forEach(b => queryClient.invalidateQueries({ queryKey: ["booking", b.id] }));
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel passengers</DialogTitle>
          <DialogDescription>
            {isGroup
              ? `Group of ${bookings.length} bookings`
              : `${bookings[0]?.source.toUpperCase()} to ${bookings[0]?.destination.toUpperCase()} for ${bookings[0]?.userName}`}
            . Passengers left unticked keep travelling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Who is being cancelled */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Passengers ({selectedCount} of {selectableRows.length} selected)
              </span>
              {selectableRows.length > 1 && (
                <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    disabled={isSaving}
                  />
                  All
                </label>
              )}
            </div>

            {rowsByBooking.map(({ booking, rows }) => (
              <div key={booking.id} className="space-y-1">
                {isGroup && (
                  <div className="text-[11px] font-semibold text-muted-foreground pt-1">For {booking.userName}</div>
                )}
                {rows.map(row => (
                  <label
                    key={row.key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-sm",
                      row.selectable ? "cursor-pointer hover:bg-muted/50" : "opacity-60"
                    )}
                  >
                    <Checkbox
                      checked={row.cancelled || selected.has(row.key)}
                      onCheckedChange={(checked) => toggleRow(row.key, checked === true)}
                      disabled={!row.selectable || isSaving}
                    />
                    <span className={cn("min-w-0 flex-1 font-medium break-words", row.cancelled && "line-through")}>
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.age} · {String(row.gender).toUpperCase()}
                    </span>
                    {row.cancelled ? (
                      <span className="shrink-0 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-300">
                        Cancelled
                      </span>
                    ) : !row.selectable ? (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Not booked
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            ))}

            {fullyCancelledBookings.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-orange-700 dark:text-orange-300">
                <UserX className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {isGroup
                  ? `Nobody is left travelling for ${fullyCancelledBookings.map(g => g.booking.userName).join(", ")}; ${fullyCancelledBookings.length === 1 ? "that booking becomes" : "those bookings become"} CNF & Cancelled.`
                  : "Nobody is left travelling, so the booking becomes CNF & Cancelled."}
              </p>
            )}
          </div>

          {/* When / who / why */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-date">Cancelled on</Label>
              <Input
                id="cancel-date"
                type="date"
                value={cancelledOn}
                onChange={(e) => setCancelledOn(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-by">Cancelling person</Label>
              <Select value={cancelledBy || undefined} onValueChange={setCancelledBy} disabled={isSaving || handlers.length === 0}>
                <SelectTrigger id="cancel-by">
                  <SelectValue placeholder={handlers.length === 0 ? "No handlers added" : "Select"} />
                </SelectTrigger>
                <SelectContent>
                  {handlers.map(h => (
                    <SelectItem key={h.id} value={h.name}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. plan changed, train cancelled"
              disabled={isSaving}
              className="min-h-[60px]"
            />
          </div>

          {/* Money */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-fare">Fare of cancelled (₹)</Label>
              <Input
                id="cancel-fare"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fareText}
                onChange={(e) => setFareOverride(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-charge">Cancellation charge (₹)</Label>
              <Input
                id="cancel-charge"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={chargeText}
                onChange={(e) => setChargeText(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>
          {suggestedFare > 0 && fareOverride === null && (
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Fare suggested as {selectedCount} of {totalPassengers} passengers&apos; share of the ticket fare. Commission is kept.
            </p>
          )}

          {/* IRCTC leg */}
          <div className="rounded-xl border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">IRCTC refund</div>
                <div className="text-xs text-muted-foreground">Where the refund from IRCTC lands.</div>
              </div>
              <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium cursor-pointer">
                No refund
                <Switch checked={noIrctcRefund} onCheckedChange={handleNoIrctcRefundChange} disabled={isSaving} />
              </label>
            </div>

            {hasTatkal && !noIrctcRefund && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Confirmed Tatkal tickets usually get no refund. Switch on &quot;No refund&quot; if that applies.
              </p>
            )}

            {!noIrctcRefund && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-expected">Expected refund (₹)</Label>
                  <Input
                    id="cancel-expected"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={expectedText}
                    onChange={(e) => setExpectedOverride(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
                <RefundRecipientPicker
                  idPrefix="cancel"
                  value={recipient}
                  onChange={setRecipient}
                  handlers={handlers}
                  walletUsername={walletUsername}
                  disabled={isSaving}
                />
              </>
            )}
          </div>

          {/* Customer leg */}
          <div className="rounded-xl border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Customer payback</div>
                <div className="text-xs text-muted-foreground">What you return to the customer.</div>
              </div>
              <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium cursor-pointer">
                Nothing to pay
                <Switch checked={nothingToPayBack} onCheckedChange={setNothingToPayBack} disabled={isSaving} />
              </label>
            </div>
            {!nothingToPayBack && (
              <div className="space-y-1.5">
                <Label htmlFor="cancel-customer-amount">Amount to pay back (₹)</Label>
                <Input
                  id="cancel-customer-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={customerText}
                  onChange={(e) => setCustomerOverride(e.target.value)}
                  disabled={isSaving}
                />
              </div>
            )}
          </div>

          {isGroup && selectedCount > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Amounts are for the whole cancellation and are split between the bookings by the number of passengers cancelled in each.
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isSaving || selectedCount === 0}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedCount > 0
              ? `Cancel ${selectedCount} passenger${selectedCount === 1 ? "" : "s"}${!noIrctcRefund && expected ? ` · ${formatRupees(expected)} refund` : ""}`
              : "Cancel passengers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
