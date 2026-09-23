"use client";

import React, { useId, useState } from "react";
import type { Handler } from "@/types/handler";
import { getHandlerOutstanding, type HandlerStats } from "@/lib/handlersClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  const cardId = useId();
  const reduceMotion = useReducedMotion();

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
      <Card
        role="article"
        aria-labelledby={`${cardId}-name`}
        className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-300 bg-white p-4 shadow-lg shadow-slate-200/60 transition-[border-color,box-shadow] duration-200 hover:border-indigo-300 hover:shadow-xl hover:shadow-slate-200/70 focus-within:border-indigo-400 dark:border-slate-500/70 dark:bg-slate-800 dark:shadow-slate-950/50 dark:hover:border-slate-400 dark:hover:shadow-slate-950/60 dark:focus-within:border-indigo-400 motion-reduce:transition-none sm:p-5"
      >
        {/* Top Header: Avatar + Identity + Status Pill + Action Buttons */}
        <div className="-mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-500/40 dark:bg-slate-700/40 sm:-mx-5 sm:-mt-5 sm:px-5">
          <div className="flex min-w-0 flex-[1_1_150px] items-center gap-3">
            {/* Avatar with initials & dynamic gradient */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-md ring-1 ring-black/5 select-none dark:ring-white/20",
                  avatarGradient
                )}
              >
                {initials}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-50 dark:ring-slate-800"
                title="Active Handler"
              />
            </div>

            {/* Name & Role */}
            <div className="min-w-0">
              <h3
                id={`${cardId}-name`}
                className="truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white"
                title={handler.name}
              >
                {handler.name}
              </h3>
              <p className="truncate text-xs text-slate-600 dark:text-slate-300">Booking Handler</p>
            </div>
          </div>

          {/* Right Header: Status Badge & Edit/Delete Icons */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isDue && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 rounded-md border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 shadow-none dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300"
              >
                <AlertCircle className="h-3 w-3" />
                <span>Due</span>
              </Badge>
            )}
            {isCredit && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 rounded-md border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shadow-none dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300"
              >
                <ArrowDownRight className="h-3 w-3" />
                <span>Credit</span>
              </Badge>
            )}
            {isSettled && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 rounded-md border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-none dark:border-slate-500/60 dark:bg-slate-800 dark:text-slate-200"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span>Settled</span>
              </Badge>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-0.5 border-l border-slate-300 pl-2 dark:border-slate-500/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white motion-reduce:transform-none motion-reduce:transition-none"
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
                    className="h-8 w-8 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-rose-400/10 dark:hover:text-rose-300 motion-reduce:transform-none motion-reduce:transition-none"
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
            "mb-4 rounded-xl border border-l-[3px] p-3.5",
            isDue && "border-rose-200 border-l-rose-500 bg-rose-50/70 dark:border-rose-300/25 dark:border-l-rose-400 dark:bg-rose-400/[0.07]",
            isCredit && "border-emerald-200 border-l-emerald-500 bg-emerald-50/70 dark:border-emerald-300/25 dark:border-l-emerald-400 dark:bg-emerald-400/[0.07]",
            isSettled && "border-slate-200 border-l-slate-400 bg-slate-50 dark:border-slate-500/50 dark:border-l-slate-400 dark:bg-slate-900/30"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-[1_1_180px]">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Outstanding Balance
              </span>
              <span
                className={cn(
                  "block break-all font-mono text-2xl font-bold tracking-tight tabular-nums",
                  isDue && "text-rose-700 dark:text-rose-300",
                  isCredit && "text-emerald-700 dark:text-emerald-300",
                  isSettled && "text-foreground"
                )}
              >
                {formatCurrency(Math.abs(outstanding))}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {isDue ? "payable to handler" : isCredit ? "advance credit" : "all settled"}
              </span>
              {(handler.initialPendingAmount ?? 0) !== 0 && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Includes {formatCurrency(handler.initialPendingAmount ?? 0)} opening balance
                </p>
              )}
            </div>

            {/* Quick Action: Settle / Pay */}
            <Button
              size="sm"
              className="ml-auto h-9 shrink-0 gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 motion-reduce:transform-none motion-reduce:transition-none"
              onClick={() => onAddPayment(handler)}
              title="Record a settlement or NA deduction"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Settle / Pay</span>
            </Button>
          </div>
        </div>

        {/* Key Metrics Grid (2 Columns) */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {/* Total Bookings */}
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-500/35 dark:bg-slate-900/35">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Ticket className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
              <span className="font-medium">Bookings</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xl font-bold tabular-nums text-foreground">
                {stats?.bookingCount ?? 0}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-300">since Jan &apos;26</span>
            </div>
          </div>

          {/* Last Activity */}
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-500/35 dark:bg-slate-900/35">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
              <span className="font-medium">Last Booked on</span>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {formatDate(stats?.lastAssignedDate)}
            </div>
          </div>
        </div>

        {/* Expandable Payment Breakdown */}
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-500/45 dark:bg-slate-900/35">
          <button
            type="button"
            onClick={() => setIsBreakdownExpanded((v) => !v)}
            aria-expanded={isBreakdownExpanded}
            aria-controls={isBreakdownExpanded ? `${cardId}-breakdown` : undefined}
            className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-3 text-xs text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:focus-visible:ring-indigo-300 motion-reduce:transition-none"
          >
            <span className="flex items-center gap-1.5">
              <Receipt className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
              <span className="font-semibold">Total Bookings Paid</span>
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-2">
              <span className="break-all font-mono font-bold tabular-nums text-foreground">
                {formatCurrency(totalBookingsPaid)}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-300 motion-reduce:transition-none",
                  isBreakdownExpanded && "rotate-180"
                )}
              />
            </span>
          </button>

          <AnimatePresence initial={false}>
            {isBreakdownExpanded && (
              <motion.div
                id={`${cardId}-breakdown`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                className="overflow-hidden border-t border-slate-200 dark:border-slate-500/35"
              >
                <div className="space-y-3 p-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-600/50 dark:bg-slate-800/80">
                      <span className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">UPI</span>
                      <span className="break-all font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(upiPaid)}
                      </span>
                    </div>
                    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-600/50 dark:bg-slate-800/80">
                      <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <Wallet className="h-3 w-3 shrink-0" />
                        Wallet
                      </span>
                      <span className="break-all font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(walletPaid)}
                      </span>
                    </div>
                  </div>

                  {othersPaid > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-600/50 dark:bg-slate-800/80">
                      <span className="text-[11px] text-slate-600 dark:text-slate-300">Others</span>
                      <span className="break-all font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(othersPaid)}
                      </span>
                    </div>
                  )}

                  {commissionPaid > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span>Commissions Included</span>
                      <span className="break-all font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
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
        <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-500/40 dark:bg-slate-900/30 sm:-mx-5 sm:-mb-5 sm:px-5">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Settled:{" "}
              <strong className="font-medium text-foreground">
                {handler.lastSettledDate ? formatDate(handler.lastSettledDate) : "Never"}
              </strong>
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewHistory(handler)}
            className="ml-auto h-8 shrink-0 gap-1.5 rounded-lg px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200 motion-reduce:transform-none motion-reduce:transition-none"
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
