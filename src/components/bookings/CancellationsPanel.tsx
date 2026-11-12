"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Banknote, Landmark, Loader2, Undo2, UserX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { deleteBookingCancellation } from "@/lib/firestoreClient";
import {
  describeRecipient,
  formatRupees,
  getCancellations,
  getRefundShortfall,
} from "@/lib/cancellations";
import type { Booking, BookingCancellation } from "@/types/booking";
import type { BookingRecord } from "@/types/bookingRecord";
import { RefundStatusDialog, type RefundLeg } from "./RefundStatusDialog";

interface CancellationsPanelProps {
  booking: Booking;
  /** Booked details for the booking (may still be loading / absent). */
  record: BookingRecord | null;
  /** Hide the update / undo controls (e.g. while cards are being selected). */
  readOnly?: boolean;
  className?: string;
}

const formatDay = (dateKey?: string): string => {
  if (!dateKey) return "";
  const date = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  return isNaN(date.getTime()) ? dateKey : format(date, "dd MMM yyyy");
};

type ChipTone = "pending" | "done" | "none";

const CHIP_CLASSES: Record<ChipTone, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  none: "bg-muted text-muted-foreground border-border/60",
};

function StatusChip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", CHIP_CLASSES[tone])}>
      {children}
    </span>
  );
}

function irctcSummary(entry: BookingCancellation): string {
  const leg = entry.irctcRefund;
  if (leg.status === "No Refund") return "Nothing refunded by IRCTC";
  const recipient = describeRecipient(leg);
  if (leg.status === "Received") {
    const amount = formatRupees(leg.receivedAmount);
    const when = leg.receivedDate ? ` on ${formatDay(leg.receivedDate)}` : "";
    return `${amount} to ${recipient}${when}`;
  }
  const amount = leg.expectedAmount != null ? formatRupees(leg.expectedAmount) : "Amount not set";
  return leg.recipientType === "Other" && !leg.recipientName ? amount : `${amount} to ${recipient}`;
}

function customerSummary(entry: BookingCancellation, fallbackName: string): string {
  const leg = entry.customerRefund;
  if (leg.status === "Not Applicable") return "Nothing to pay back";
  const name = leg.recipientName || fallbackName;
  if (leg.status === "Paid") {
    const when = leg.paidDate ? ` on ${formatDay(leg.paidDate)}` : "";
    const by = leg.paidBy ? ` by ${leg.paidBy}` : "";
    const via = leg.method ? ` (${leg.method})` : "";
    return `${formatRupees(leg.paidAmount)} to ${name}${when}${by}${via}`;
  }
  const amount = leg.amount != null ? formatRupees(leg.amount) : "Amount not set";
  return `${amount} to ${name}`;
}

/**
 * Cancellations of a booking with both refund legs: what IRCTC returns (and who
 * is holding it) and what is paid back to the customer.
 */
export function CancellationsPanel({ booking, record, readOnly = false, className }: CancellationsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ entryId: string; leg: RefundLeg } | null>(null);
  const [undoEntryId, setUndoEntryId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const entries = getCancellations(booking);
  if (entries.length === 0) return null;

  const editingEntry = editing ? entries.find(e => e.id === editing.entryId) : undefined;
  const undoEntry = undoEntryId ? entries.find(e => e.id === undoEntryId) : undefined;

  const handleUndo = async () => {
    if (!undoEntry) return;
    setIsUndoing(true);
    try {
      const result = await deleteBookingCancellation(booking.id, undoEntry.id);
      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to undo cancellation.", variant: "destructive" });
        return;
      }
      toast({
        title: "Cancellation undone",
        description:
          undoEntry.passengerNames.length > 0
            ? `${undoEntry.passengerNames.join(", ")} restored to the booking.`
            : "The booking is back to Booked.",
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setUndoEntryId(null);
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {entries.map(entry => {
        const isFailedPayment = entry.kind === "failed-payment";
        const irctc = entry.irctcRefund;
        const customer = entry.customerRefund;
        const shortfall = getRefundShortfall(entry);
        const title = isFailedPayment
          ? "Payment failed"
          : entry.passengerNames.length > 0
            ? `Cancelled: ${entry.passengerNames.join(", ")}`
            : "Ticket cancelled";
        const meta = [
          formatDay(entry.cancelledOn),
          entry.cancelledBy ? `by ${entry.cancelledBy}` : "",
          entry.fareCancelled != null ? `Fare ${formatRupees(entry.fareCancelled)}` : "",
          entry.cancellationCharge != null ? `Charge ${formatRupees(entry.cancellationCharge)}` : "",
        ].filter(Boolean);
        // The card already shows the status reason for a fully cancelled booking.
        const showReason = !!entry.reason && entry.reason !== booking.statusReason;

        return (
          <div
            key={entry.id}
            className="rounded-xl border border-orange-500/30 bg-orange-500/[0.05] dark:bg-orange-950/20 px-3 py-2.5 text-xs shadow-xs"
          >
            <div className="flex items-start gap-2">
              {isFailedPayment ? (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
              ) : (
                <UserX className="h-4 w-4 mt-0.5 shrink-0 text-orange-600 dark:text-orange-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-foreground break-words">{title}</div>
                {meta.length > 0 && (
                  <div className="text-muted-foreground mt-0.5 break-words">{meta.join(" · ")}</div>
                )}
                {showReason && <div className="text-muted-foreground mt-0.5 break-words">{entry.reason}</div>}
              </div>
              {!readOnly && !isFailedPayment && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setUndoEntryId(entry.id)}
                  title="Undo cancellation"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="mt-2 space-y-1.5 border-t border-orange-500/20 pt-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">IRCTC refund</span>
                    <StatusChip tone={irctc.status === "Pending" ? "pending" : irctc.status === "Received" ? "done" : "none"}>
                      {irctc.status}
                    </StatusChip>
                  </div>
                  <div className="text-muted-foreground break-words">
                    {irctcSummary(entry)}
                    {shortfall > 0 && (
                      <span className="text-amber-700 dark:text-amber-300"> · short by {formatRupees(shortfall)}</span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant={irctc.status === "Pending" ? "default" : "outline"}
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    onClick={() => setEditing({ entryId: entry.id, leg: "irctc" })}
                  >
                    {irctc.status === "Pending" ? "Update" : "Edit"}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Banknote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">Customer payback</span>
                    <StatusChip tone={customer.status === "Pending" ? "pending" : customer.status === "Paid" ? "done" : "none"}>
                      {customer.status}
                    </StatusChip>
                  </div>
                  <div className="text-muted-foreground break-words">
                    {customerSummary(entry, booking.userName)}
                    {customer.note && <span> · {customer.note}</span>}
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    variant={customer.status === "Pending" ? "default" : "outline"}
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    onClick={() => setEditing({ entryId: entry.id, leg: "customer" })}
                  >
                    {customer.status === "Pending" ? "Update" : "Edit"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {editing && editingEntry && (
        <RefundStatusDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          booking={booking}
          entry={editingEntry}
          leg={editing.leg}
          record={record}
        />
      )}

      <AlertDialog open={!!undoEntry} onOpenChange={(open) => { if (!open) setUndoEntryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this cancellation?</AlertDialogTitle>
            <AlertDialogDescription>
              {undoEntry && undoEntry.passengerNames.length > 0
                ? `${undoEntry.passengerNames.join(", ")} will be travelling again`
                : "The ticket will be treated as not cancelled"}
              {booking.status === "CNF & Cancelled" && " and the booking returns to Booked"}. The refund details recorded
              for this cancellation are removed.
              {undoEntry && (Number(undoEntry.irctcRefund.walletCredited) || 0) > 0 && (
                <span className="block mt-2 font-medium text-amber-600 dark:text-amber-500">
                  {formatRupees(undoEntry.irctcRefund.walletCredited)} that was added to the wallet balance for this refund
                  will be deducted again.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUndoing}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleUndo(); }}
              disabled={isUndoing}
            >
              {isUndoing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Undo cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
