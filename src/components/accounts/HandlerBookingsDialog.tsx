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
import { AlertCircle, Loader2, Ticket } from "lucide-react";
import { format } from "date-fns";

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

interface HandlerBookingsDialogProps {
  handler: Handler | null;
  onOpenChange: (open: boolean) => void;
}

export function HandlerBookingsDialog({ handler, onOpenChange }: HandlerBookingsDialogProps) {
  const [items, setItems] = useState<HandlerBookingBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Reserve the rows' scrollbar width in the header so its columns line up with the rows.
  useLayoutEffect(() => {
    const el = rowsRef.current;
    setScrollbarWidth(el ? el.offsetWidth - el.clientWidth : 0);
  }, [items, isLoading, hasError]);

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

  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
  const totalCommission = items.reduce((sum, item) => sum + item.commission, 0);

  return (
    <Dialog open={!!handler} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Booking Breakdown
          </DialogTitle>
          <DialogDescription>
            Bookings by {handler?.name} included in the outstanding balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-2.5 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Bookings</div>
              <div className="text-sm font-semibold tabular-nums">{items.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Cost</div>
              <div className="text-sm font-semibold tabular-nums">{formatCurrency(totalCost)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Commission</div>
              <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatCurrency(totalCommission)}
              </div>
            </div>
          </div>

          {/* Column headers */}
          {!isLoading && !hasError && items.length > 0 && (
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
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No bookings found in the tracking period.
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.id}
                  className={`${ROW_GRID} rounded-lg border bg-card px-2.5 py-2 text-xs transition-colors hover:bg-muted/30`}
                >
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(item.bookingDate)}
                  </span>
                  <span className="truncate font-medium" title={item.bookedFor.join(", ")}>
                    {formatBookedFor(item.bookedFor)}
                  </span>
                  <span className="text-right font-mono tabular-nums">
                    {formatCurrency(Math.max(item.cost - item.commission, 0))}
                  </span>
                  <span
                    className={
                      item.commission > 0
                        ? "text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300"
                        : "text-right font-mono tabular-nums text-muted-foreground"
                    }
                  >
                    {formatCurrency(item.commission)}
                  </span>
                  <span className="text-right font-mono font-semibold tabular-nums">
                    {formatCurrency(item.cost)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">
            {items.length} booking{items.length === 1 ? "" : "s"}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
