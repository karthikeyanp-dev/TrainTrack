"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Receipt,
  Train,
  XCircle,
  UserX,
  ArrowRight,
  Plus
} from "lucide-react";
import type { Booking } from "@/types/booking";
import Link from "next/link";

interface DashboardProps {
  allBookings: Booking[];
  pendingBookings: Booking[];
}

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "default" | "blue" | "green" | "amber" | "red";
  delay?: number;
}

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend, 
  trendValue,
  color = "default",
  delay = 0 
}: StatCardProps) {
  const colorStyles = {
    default: "bg-muted/50 text-foreground",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className="hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className={`rounded-lg p-1.5 ${colorStyles[color]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="text-3xl font-bold leading-tight">{value}</div>
          {(description || trend) && (
            <div className="flex items-center gap-2 mt-1">
              {trend && trendValue && (
                <span className={`text-xs flex items-center gap-0.5 ${
                  trend === "up" ? "text-green-600" : 
                  trend === "down" ? "text-red-600" : "text-muted-foreground"
                }`}>
                  <TrendingUp className={`h-3 w-3 ${trend === "down" ? "rotate-180" : ""}`} />
                  {trendValue}
                </span>
              )}
              {description && (
                <p className="text-[11px] text-muted-foreground">{description}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function Dashboard({ allBookings, pendingBookings }: DashboardProps) {
  // Calculate stats
  const totalBookings = allBookings.length;
  const pendingCount = pendingBookings.length;
  const bookedCount = allBookings.filter(b => b.status === "Booked").length;
  const failedCount = allBookings.filter(
    b => b.status === "Booking Failed (Unpaid)" || b.status === "Booking Failed (Paid)"
  ).length;
  const userCancelledCount = allBookings.filter(b => b.status === "User Cancelled").length;
  const refundPendingCount = allBookings.filter(
    b => (b.status === "Booking Failed (Paid)" || b.status === "CNF & Cancelled") && !b.refundDetails
  ).length;

  const currentYear = new Date().getFullYear();
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const parseBookByDate = (dateValue: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const monthlyPerformance = monthLabels.map((label, monthIndex) => {
    const monthBookings = allBookings.filter((booking) => {
      const bookByDate = parseBookByDate(booking.bookingDate);
      return (
        bookByDate !== null &&
        bookByDate.getFullYear() === currentYear &&
        bookByDate.getMonth() === monthIndex
      );
    });

    const total = monthBookings.length;
    const booked = monthBookings.filter((booking) => booking.status === "Booked").length;
    const failed = monthBookings.filter(
      (booking) => booking.status === "Booking Failed (Unpaid)" || booking.status === "Booking Failed (Paid)"
    ).length;
    const cancelled = monthBookings.filter(
      (booking) => booking.status === "User Cancelled" || booking.status === "CNF & Cancelled"
    ).length;
    const pending = monthBookings.filter((booking) => booking.status === "Requested").length;
    const userCancelled = monthBookings.filter((booking) => booking.status === "User Cancelled").length;
    const successRateDenominator = total - (userCancelled + pending);
    const successRate = successRateDenominator > 0
      ? Math.round((booked / successRateDenominator) * 100)
      : 0;

    return {
      label,
      monthIndex,
      total,
      booked,
      failed,
      cancelled,
      pending,
      successRate,
    };
  });
  const currentMonthIndex = new Date().getMonth();
  const visibleMonthlyPerformance = monthlyPerformance.filter(
    (month) => month.monthIndex <= currentMonthIndex || month.total > 0
  );
  const currentMonthPerformance = monthlyPerformance[currentMonthIndex];
  const previousMonthsPerformance = visibleMonthlyPerformance.filter(
    (month) => month.monthIndex !== currentMonthIndex
  );

  // Recent bookings (last 5)
  const recentBookings = [...allBookings]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div 
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your train booking operations
          </p>
        </div>
        <Link href="/bookings/new">
          <Button className="rounded-full">
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        </Link>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <StatCard
          title="Total Bookings"
          value={totalBookings}
          description="All time bookings"
          icon={Calendar}
          color="blue"
          delay={0.1}
        />
        <StatCard
          title="Booked"
          value={bookedCount}
          description="Successfully booked"
          icon={CheckCircle2}
          color="green"
          delay={0.15}
        />
        <StatCard
          title="Failed"
          value={failedCount}
          description="Booking failed"
          icon={XCircle}
          color="red"
          delay={0.2}
        />
        <StatCard
          title="User Cancelled"
          value={userCancelledCount}
          description="Cancelled by user"
          icon={UserX}
          color="default"
          delay={0.25}
        />
        <StatCard
          title="Pending"
          value={pendingCount}
          description="Awaiting action"
          icon={Clock}
          color="amber"
          delay={0.3}
        />
        <StatCard
          title="Refund Pending"
          value={refundPendingCount}
          description="Awaiting refund"
          icon={Receipt}
          color="red"
          delay={0.35}
        />
      </div>

      {/* Current Year Performance & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Current Year Performance */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <div className="space-y-8">
            {/* Snapshot Card */}
            <div className="rounded-[1.5rem] bg-[#0f1225] p-6 text-white shadow-lg border border-slate-800/50">
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 mb-6">Current Month Snapshot</p>
              
              <div className="flex items-end gap-3 mb-6">
                <span className="text-5xl font-bold leading-none">{currentMonthPerformance.total}</span>
                <span className="text-sm text-slate-400 mb-1 font-medium">total requests</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="rounded-xl bg-[#1a1f36] border border-slate-700/50 p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <div className="rounded-full bg-emerald-500/10 p-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    Successfully Booked
                  </div>
                  <span className="text-2xl font-bold ml-[34px]">{currentMonthPerformance.booked}</span>
                </div>

                <div className="rounded-xl bg-[#1a1f36] border border-slate-700/50 p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <div className="rounded-full bg-blue-500/10 p-1.5">
                      <Clock className="h-4 w-4 text-blue-400" />
                    </div>
                    Pending
                  </div>
                  <span className="text-2xl font-bold ml-[34px]">{currentMonthPerformance.pending}</span>
                </div>

                <div className="rounded-xl bg-[#1a1f36] border border-slate-700/50 p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <div className="rounded-full bg-rose-500/10 p-1.5">
                      <XCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    Failed
                  </div>
                  <span className="text-2xl font-bold ml-[34px]">{currentMonthPerformance.failed}</span>
                </div>

                <div className="rounded-xl bg-[#1a1f36] border border-slate-700/50 p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <div className="rounded-full bg-orange-500/10 p-1.5">
                      <XCircle className="h-4 w-4 text-orange-400" />
                    </div>
                    Cancelled
                  </div>
                  <span className="text-2xl font-bold ml-[34px]">{currentMonthPerformance.cancelled}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm mb-3 px-1">
                <span className="text-slate-300 font-medium">Success Rate</span>
                <span className="text-emerald-400 font-bold">{currentMonthPerformance.successRate}%</span>
              </div>
              <div className="h-2.5 w-full bg-[#1a1f36] rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-emerald-400 rounded-full transition-all duration-1000 ease-out" 
                  style={{ width: `${currentMonthPerformance.successRate}%` }}
                />
              </div>
            </div>

            {/* Monthly Breakdown */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-foreground">Monthly Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {previousMonthsPerformance.map((month) => (
                  <div key={month.label} className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2 font-bold text-base">
                        <Calendar className="h-4 w-4 text-indigo-400" />
                        {month.label}
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 text-xs font-semibold">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                        <span className="text-foreground">{month.successRate}%</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Total</span>
                        <span className="font-bold text-foreground">{month.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Booked</span>
                        <span className="font-bold text-emerald-500">{month.booked}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Failed</span>
                        <span className="font-bold text-rose-500">{month.failed}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">Cancelled</span>
                        <span className="font-bold text-orange-500">{month.cancelled}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recent Bookings */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Recent Bookings</CardTitle>
              <Link href="/">
                <Button variant="ghost" size="sm" className="rounded-full">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Train className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No bookings yet</p>
                  <p className="text-sm">Create your first booking to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentBookings.map((booking, index) => (
                    <motion.div
                      key={booking.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + index * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Train className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {booking.source} → {booking.destination}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.userName} • {booking.journeyDate}
                          </p>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        booking.status === "Booked" ? "bg-green-500/10 text-green-600" :
                        booking.status === "CNF & Cancelled" || booking.status === "User Cancelled" ? "bg-red-500/10 text-red-600" :
                        booking.status === "Requested" ? "bg-blue-500/10 text-blue-600" :
                        "bg-amber-500/10 text-amber-600"
                      }`}>
                        {booking.status}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
