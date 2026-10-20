"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IrctcAccount } from "@/types/account";
import type { AccountStats } from "@/lib/accountsClient";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Ticket,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

function maskPassword(password: string): string {
  return "•".repeat(Math.min(password.length, 8));
}

function selectElementText(node: HTMLElement | null) {
  if (!node || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function AccountTakenBadge({ detail }: { detail: string }) {
  return (
    <span
      className="inline-flex items-center shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white shadow-sm shadow-rose-950/40"
      title={detail === "Pending booking" ? "Assigned to a booking" : `Assigned to ${detail}'s booking`}
      aria-label={detail === "Pending booking" ? "Taken, assigned to a booking" : `Taken, assigned to ${detail}'s booking`}
    >
      Taken
    </span>
  );
}

function CopyableValue({
  value,
  displayValue,
  label,
}: {
  value: string;
  displayValue: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const handleCopy = async () => {
    selectElementText(valueRef.current);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable — the text stays selected so it can be copied manually.
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Click to copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="group/copy flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
    >
      <span
        ref={valueRef}
        className="min-w-0 truncate rounded-md bg-amber-500/0 px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground select-text transition-colors group-hover/copy:bg-amber-500/10"
      >
        {displayValue}
      </span>
      {copied ? (
        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy
          className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover/copy:text-[#AB945E]"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function CredentialRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
      <div className="shrink-0 rounded-md bg-amber-500/10 p-1 text-amber-500/80 dark:text-amber-400/80">
        {icon}
      </div>
      <span className="w-[62px] shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  hint,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 dark:border-slate-700/60 dark:bg-slate-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span className="shrink-0 rounded bg-amber-500/10 p-0.5 text-amber-500/80 dark:text-amber-400/80">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums leading-none text-foreground">
          {value}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

export interface AccountCardProps {
  account: IrctcAccount;
  stats?: AccountStats;
  takenDetail?: string;
  onEdit: (account: IrctcAccount) => void;
  onDelete: (accountId: string) => void;
  onTopUp: (account: IrctcAccount) => void;
}

export function AccountCard({
  account,
  stats,
  takenDetail,
  onEdit,
  onDelete,
  onTopUp,
}: AccountCardProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const cardId = useId();

  const now = new Date();
  const currentMonthName = now.toLocaleString("default", { month: "long" });
  const previousMonthName = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  ).toLocaleString("default", { month: "long" });

  return (
    <TooltipProvider delayDuration={200}>
      <Card
        role="article"
        aria-labelledby={`${cardId}-username`}
        className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-200/60 focus-within:border-slate-400 dark:border-slate-700/90 dark:bg-slate-800/70 dark:shadow-slate-950/40 dark:hover:border-slate-600 dark:hover:shadow-slate-950/50 motion-reduce:transition-none"
      >
        {/* Header: identity + actions */}
        <div
          className={cn(
            "border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900/40",
            account.isVerified
              ? "border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400"
              : "border-l-[3px] border-l-amber-500 dark:border-l-amber-400"
          )}
        >
          <div className="flex items-center gap-2">
            <h3
              id={`${cardId}-username`}
              className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground"
              title={account.username}
            >
              {account.username}
            </h3>
            {account.isVerified && (
              <span title="Verified account">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 fill-emerald-600 text-white"
                  aria-label="Verified"
                />
              </span>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                    onClick={() => onEdit(account)}
                    aria-label={`Edit ${account.username}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Edit Account</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                    onClick={() => onDelete(account.id)}
                    aria-label={`Delete ${account.username}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete Account</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">
              IRCTC Account
            </span>
            {takenDetail && <AccountTakenBadge detail={takenDetail} />}
          </div>
        </div>

        <div className="space-y-2.5 p-4">
          {/* Credentials strip */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-900/40">
            <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
              <CredentialRow icon={<User className="h-3.5 w-3.5" />} label="Username">
                <CopyableValue
                  value={account.username}
                  displayValue={account.username}
                  label="Username"
                />
              </CredentialRow>

              <CredentialRow icon={<KeyRound className="h-3.5 w-3.5" />} label="Password">
                <CopyableValue
                  value={account.password}
                  displayValue={
                    passwordVisible ? account.password : maskPassword(account.password)
                  }
                  label="Password"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-primary"
                      onClick={() => setPasswordVisible((v) => !v)}
                      aria-label={passwordVisible ? "Hide password" : "Show password"}
                    >
                      {passwordVisible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {passwordVisible ? "Hide password" : "Show password"}
                  </TooltipContent>
                </Tooltip>
              </CredentialRow>

              <CredentialRow icon={<Wallet className="h-3.5 w-3.5" />} label="Wallet">
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold tabular-nums text-foreground">
                  ₹{account.walletAmount.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => onTopUp(account)}
                  title="Add or deduct wallet amount"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add</span>
                </Button>
              </CredentialRow>
            </div>
          </div>

          {/* Booking stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Ticket className="h-3 w-3" />}
              label="This Month"
              hint={currentMonthName}
              value={stats?.bookingCount ?? 0}
            />
            <StatTile
              icon={<CalendarDays className="h-3 w-3" />}
              label="Last Month"
              hint={previousMonthName}
              value={stats?.previousMonthBookingCount ?? 0}
            />
          </div>

          {/* Footer: last booked */}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs dark:bg-slate-900/40">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
              Last Booked
            </span>
            <span className="truncate font-semibold text-foreground">
              {account.lastBookedDate || "—"}
            </span>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}
