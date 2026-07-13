"use client";

import type { BookingStatus } from "@/types/booking";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  UserX,
  Info
} from "lucide-react";

interface StatusBadgeProps {
  status: BookingStatus;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

const statusConfig: Record<BookingStatus, {
  icon: React.ElementType;
  label: string;
  className: string;
  pulse: boolean;
}> = {
  "Requested": {
    icon: Clock,
    label: "Requested",
    className: "bg-blue-600 text-white border-blue-700",
    pulse: true,
  },
  "Booked": {
    icon: CheckCircle2,
    label: "Booked",
    className: "bg-emerald-600 text-white border-emerald-700",
    pulse: false,
  },
  "Missed": {
    icon: AlertTriangle,
    label: "Missed",
    className: "bg-amber-500 text-black border-amber-600",
    pulse: false,
  },
  "Booking Failed (Unpaid)": {
    icon: XCircle,
    label: "Failed",
    className: "bg-rose-600 text-white border-rose-700",
    pulse: false,
  },
  "Booking Failed (Paid)": {
    icon: XCircle,
    label: "Failed (Paid)",
    className: "bg-rose-600 text-white border-rose-700",
    pulse: false,
  },
  "User Cancelled": {
    icon: UserX,
    label: "Cancelled",
    className: "bg-orange-500 text-white border-orange-600",
    pulse: false,
  },
  "CNF & Cancelled": {
    icon: UserX,
    label: "CNF & Cancelled",
    className: "bg-purple-600 text-white border-purple-700",
    pulse: false,
  },
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-sm gap-1.5",
  lg: "px-3 py-1.5 text-base gap-2",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function StatusBadge({ status, size = "md", pulse: forcePulse }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    icon: Info,
    label: status,
    className: "bg-slate-500 text-white border-slate-600",
    pulse: false,
  };

  const Icon = config.icon;
  const shouldPulse = forcePulse ?? config.pulse;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center rounded-[2px] border font-medium shadow-sm",
        sizeClasses[size],
        config.className,
      )}
    >
      <span className="relative flex">
        <Icon className={iconSizes[size]} />
        {shouldPulse && (
          <span className="absolute inline-flex h-full w-full animate-ping opacity-20">
            <Icon className={iconSizes[size]} />
          </span>
        )}
      </span>
      <span className="capitalize">{config.label}</span>
    </motion.span>
  );
}
