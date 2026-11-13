"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Handler } from "@/types/handler";
import {
  getHandlerBookingBreakdown,
  type HandlerBookingBreakdownItem,
} from "@/lib/handlersClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, Loader2, Ticket } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

const ROW_GRID = "grid grid-cols-[80px_minmax(0,1fr)_72px_64px_80px] items-center gap-2";

/** "Name" for one passenger, "Name +2 others" for several. */
function formatBookedFor(names: string[]): string {
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  const others = names.length - 1;
  return `${names[0]} +${others} other${others === 1 ? "" : "s"}`;
}

function SettledBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-300 bg-slate-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
        className
      )}
      title={label}
    >
      <CheckCircle2 className="h-2.5 w-2.5" />
      Settled
    </span>
  );
}

function BookingRow({ item }: { item: HandlerBookingBreakdownItem }) {
  const settledLabel = item.settledOn ? `Settled on ${formatDate(item.settledOn)}` : "Settled";

  return (
    <div
      className={cn(
        ROW_GRID,
        "rounded-lg border px-2.5 py-2 text-xs transition-colors",
        item.settled
          ? "border-border/60 bg-muted/30 text-muted-foreground"
          : "bg-card hover:bg-muted/30"
      )}
    >
      <span className="flex flex-col items-start gap-0.5">
        <span className="tabular-nums text-muted-foreground">{formatDate(item.bookingDate)}</span>
        {/* Narrow screens leave no room beside the name, so the badge sits under the date. */}
        {item.settled && <SettledBadge label={settledLabel} className="sm:hidden" />}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span
          className={cn("truncate", item.settled ? "font-normal" : "font-medium")}
          title={item.bookedFor.join(", ")}
        >
          {formatBookedFor(item.bookedFor)}
        </span>
        {item.settled && <SettledBadge label={settledLabel} className="hidden sm:inline-flex" />}
      </span>
      <span className="text-right font-mono tabular-nums">
        {formatCurrency(Math.max(item.cost - item.commission, 0))}
      </span>
      <span
        className={cn(
          "text-right font-mono tabular-nums",
          item.commission > 0 && !item.settled
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-muted-foreground"
        )}
      >
        {formatCurrency(item.commission)}
      </span>
      <span className={cn("text-right font-mono tabular-nums", item.settled ? "font-medium" : "font-semibold")}>
        {formatCurrency(item.cost)}
      </span>
    </div>
  );
}

interface HandlerBookingsDialogProps {
  handler: Handler | null;
  onOpenChange: (open: boolean) => void;
}

export function HandlerBookingsDialog({ handler, onOpenChange }: HandlerBookingsDialogProps) {
  const [items, setItems] = useState<HandlerBookingBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showSettled, setShowSettled] = useState(true);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Reserve the rows' scrollbar width in the header so its columns line up with the rows.
  useLayoutEffect(() => {
    const el = rowsRef.current;
    setScrollbarWidth(el ? el.offsetWidth - el.clientWidth : 0);
  }, [items, isLoading, hasError, showSettled]);

  useEffect(() => {
    if (!handler) {
      setItems([]);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    getHandlerBookingBreakdown(handler)
      .then(rows => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handler]);

  const outstandingItems = items.filter(item => !item.settled);
  const settledItems = items.filter(item => item.settled);
  const outstandingCost = outstandingItems.reduce((sum, item) => sum + item.cost, 0);
  const outstandingCommission = outstandingItems.reduce((sum, item) => sum + item.commission, 0);
  const lastSettledOn = settledItems.reduce<string | undefined>(
    (latest, item) => (item.settledOn && (!latest || item.settledOn > latest) ? item.settledOn : latest),
    undefined
  );

  const hasRows = items.length > 0;
  const visibleRowCount = outstandingItems.length + (showSettled ? settledItems.length : 0);

  return (
    <Dialog open={!!handler} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Booking Breakdown
          </DialogTitle>
          <DialogDescription>
            Outstanding bookings by {handler?.name}, plus settled ones from the current and previous month.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Summary bar — outstanding bookings only */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-2.5 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Outstanding</div>
              <div className="text-sm font-semibold tabular-nums">{outstandingItems.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Cost</div>
              <div className="text-sm font-semibold tabular-nums">{formatCurrency(outstandingCost)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Commission</div>
              <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatCurrency(outstandingCommission)}
              </div>
            </div>
          </div>

          {/* Settled toggle */}
          {!isLoading && !hasError && settledItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
              <span className="text-muted-foreground">
                {lastSettledOn ? <>Last settled on {formatDate(lastSettledOn)}</> : "Settled bookings"}
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <span>Show settled ({settledItems.length})</span>
                <Switch
                  checked={showSettled}
                  onCheckedChange={setShowSettled}
                  aria-label="Show settled bookings"
                />
              </label>
            </div>
          )}

          {/* Column headers */}
          {!isLoading && !hasError && visibleRowCount > 0 && (
            <div
              style={{ paddingRight: `calc(0.625rem + 0.25rem + ${scrollbarWidth}px)` }}
              className={`${ROW_GRID} pl-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
            >
              <span>Booked date</span>
              <span>Booked for</span>
              <span className="text-right">Fare</span>
              <span className="text-right">Comn</span>
              <span className="text-right">Total</span>
            </div>
          )}

          {/* Rows */}
          <div ref={rowsRef} className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading bookings…
              </div>
            ) : hasError ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Failed to load bookings. Please try again.
              </div>
            ) : !hasRows ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No outstanding or recent bookings.
              </div>
            ) : (
              <>
                {outstandingItems.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    All caught up — no outstanding bookings.
                  </div>
                ) : (
                  outstandingItems.map(item => <BookingRow key={item.id} item={item} />)
                )}

                {showSettled && settledItems.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Settled</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {settledItems.map(item => <BookingRow key={item.id} item={item} />)}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">
            {outstandingItems.length} outstanding
            {settledItems.length > 0 && <> · {settledItems.length} settled</>}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
