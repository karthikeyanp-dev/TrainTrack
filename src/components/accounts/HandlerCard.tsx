"use client";

import React, { useState } from "react";
import type { Handler } from "@/types/handler";
import { getHandlerOutstanding, type HandlerStats } from "@/lib/handlersClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Edit3,
  Trash2,
  Plus,
  History,
  Ticket,
  Calendar,
  ChevronDown,
  Receipt,
  AlertCircle,
  CheckCircle2,
  ArrowDownRight,
  Clock,
  Wallet,
} from "lucide-react";

export interface HandlerCardProps {
  handler: Handler;
  stats?: HandlerStats;
  onEdit: (handler: Handler) => void;
  onDelete: (handlerId: string) => void;
  onAddPayment: (handler: Handler) => void;
  onViewHistory: (handler: Handler) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "H";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-purple-600 shadow-indigo-500/20",
  "from-blue-500 to-cyan-600 shadow-blue-500/20",
  "from-emerald-500 to-teal-600 shadow-emerald-500/20",
  "from-amber-500 to-orange-600 shadow-amber-500/20",
  "from-rose-500 to-pink-600 shadow-rose-500/20",
  "from-violet-500 to-fuchsia-600 shadow-violet-500/20",
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

export function HandlerCard({
  handler,
  stats,
  onEdit,
  onDelete,
  onAddPayment,
  onViewHistory,
}: HandlerCardProps) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  const outstanding = getHandlerOutstanding(
    stats?.paymentTotals,
    handler.settledAmount,
    handler.initialPendingAmount,
    handler.naAmount
  );

  const isDue = outstanding > 0.001;
  const isCredit = outstanding < -0.001;
  const isSettled = !isDue && !isCredit;

  const totalBookingsPaid = stats?.paymentTotals.total ?? 0;
  const upiPaid = stats?.paymentTotals.upi ?? 0;
  const walletPaid = stats?.paymentTotals.wallet ?? 0;
  const othersPaid = stats?.paymentTotals.others ?? 0;
  const commissionPaid = stats?.paymentTotals.commission ?? 0;

  const paymentCount = handler.payments?.length ?? 0;
  const initials = getInitials(handler.name);
  const avatarGradient = getAvatarGradient(handler.name);

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="group relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/70 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-border transition-all duration-300">
        
        {/* Top Header: Avatar + Identity + Status Pill + Action Buttons */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar with initials & dynamic gradient */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-md select-none",
                  avatarGradient
                )}
              >
                {initials}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-card"
                title="Active Handler"
              />
            </div>

            {/* Name & Role */}
            <div className="min-w-0">
              <h3
                className="text-base font-bold text-foreground group-hover:text-primary transition-colors truncate"
                title={handler.name}
              >
                {handler.name}
              </h3>
              <p className="text-xs text-muted-foreground truncate">Booking Handler</p>
            </div>
          </div>

          {/* Right Header: Status Badge & Edit/Delete Icons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isDue && (
              <Badge
                variant="outline"
                className="border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400 font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1 shadow-none"
              >
                <AlertCircle className="h-3 w-3" />
                <span>Due</span>
              </Badge>
            )}
            {isCredit && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1 shadow-none"
              >
                <ArrowDownRight className="h-3 w-3" />
                <span>Credit</span>
              </Badge>
            )}
            {isSettled && (
              <Badge
                variant="outline"
                className="border-border bg-muted/60 text-muted-foreground font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1 shadow-none"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span>Settled</span>
              </Badge>
            )}

            {/* Action Buttons */}
            <div className="flex items-center ml-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    onClick={() => onEdit(handler)}
                    aria-label={`Edit ${handler.name}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Edit Handler</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => onDelete(handler.id)}
                    aria-label={`Delete ${handler.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete Handler</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Hero Balance Banner */}
        <div
          className={cn(
            "rounded-xl p-3.5 border transition-all duration-300 mb-3",
            isDue && "bg-rose-500/5 border-rose-500/20 dark:bg-rose-950/20",
            isCredit && "bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-950/20",
            isSettled && "bg-muted/40 border-border/80"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-0.5">
                Outstanding Balance
              </span>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span
                  className={cn(
                    "text-xl sm:text-2xl font-extrabold tracking-tight font-mono",
                    isDue && "text-rose-600 dark:text-rose-400",
                    isCredit && "text-emerald-600 dark:text-emerald-400",
                    isSettled && "text-foreground"
                  )}
                >
                  {formatCurrency(Math.abs(outstanding))}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    isDue && "text-rose-500/80 dark:text-rose-400/80",
                    isCredit && "text-emerald-600/80 dark:text-emerald-400/80",
                    isSettled && "text-muted-foreground"
                  )}
                >
                  {isDue ? "payable to handler" : isCredit ? "advance credit" : "all settled"}
                </span>
              </div>
              {(handler.initialPendingAmount ?? 0) !== 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Includes {formatCurrency(handler.initialPendingAmount ?? 0)} opening balance
                </p>
              )}
            </div>

            {/* Quick Action: Settle / Pay */}
            <Button
              size="sm"
              className="shrink-0 h-8 px-3 text-xs font-medium shadow-sm gap-1.5"
              onClick={() => onAddPayment(handler)}
              title="Record a settlement or NA deduction"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Settle / Pay</span>
            </Button>
          </div>
        </div>

        {/* Key Metrics Grid (2 Columns) */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Total Bookings */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-2.5 transition-colors hover:bg-muted/60">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Ticket className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Bookings</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-foreground">
                {stats?.bookingCount ?? 0}
              </span>
              <span className="text-[10px] text-muted-foreground">since Jan &apos;26</span>
            </div>
          </div>

          {/* Last Activity */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-2.5 transition-colors hover:bg-muted/60">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Last Active</span>
            </div>
            <div className="text-sm font-semibold text-foreground truncate">
              {formatDate(stats?.lastAssignedDate)}
            </div>
            <div className="text-[10px] text-muted-foreground">Booked ticket</div>
          </div>
        </div>

        {/* Expandable Payment Breakdown */}
        <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => setIsBreakdownExpanded((v) => !v)}
            aria-expanded={isBreakdownExpanded}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              <span className="font-semibold">Total Bookings Paid</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground font-mono">
                {formatCurrency(totalBookingsPaid)}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  isBreakdownExpanded && "rotate-180"
                )}
              />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {isBreakdownExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border/60"
              >
                <div className="p-2.5 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-background/80 p-2 rounded-lg border border-border/60">
                      <span className="text-muted-foreground block text-[10px]">UPI (Out of Pocket)</span>
                      <span className="font-semibold font-mono text-foreground">
                        {formatCurrency(upiPaid)}
                      </span>
                    </div>
                    <div className="bg-background/80 p-2 rounded-lg border border-border/60">
                      <span className="text-muted-foreground block text-[10px]">Wallet (Business)</span>
                      <span className="font-semibold font-mono text-foreground">
                        {formatCurrency(walletPaid)}
                      </span>
                    </div>
                  </div>

                  {othersPaid > 0 && (
                    <div className="bg-background/80 p-2 rounded-lg border border-border/60 flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px]">Others</span>
                      <span className="font-semibold font-mono text-foreground">
                        {formatCurrency(othersPaid)}
                      </span>
                    </div>
                  )}

                  {commissionPaid > 0 && (
                    <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground pt-0.5">
                      <span>Commissions Included</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {formatCurrency(commissionPaid)}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card Footer: Last Settlement & History Button */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] truncate">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Settled:{" "}
              <strong className="text-foreground font-medium">
                {handler.lastSettledDate ? formatDate(handler.lastSettledDate) : "Never"}
              </strong>
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewHistory(handler)}
            className="h-7 px-2.5 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1.5 font-medium shrink-0"
            title="View payment & deduction history"
          >
            <History className="h-3.5 w-3.5" />
            <span>
              {paymentCount} Payment{paymentCount === 1 ? "" : "s"}
            </span>
          </Button>
        </div>

      </Card>
    </TooltipProvider>
  );
}
