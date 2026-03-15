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

  // Last month analysis (calendar month)
  const now = new Date();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const lastMonthBookings = allBookings.filter((b) => {
    const createdAt = new Date(b.createdAt);
    return createdAt >= lastMonthStart && createdAt <= lastMonthEnd;
  });

  const lastMonthTotal = lastMonthBookings.length;
  const lastMonthBooked = lastMonthBookings.filter((b) => b.status === "Booked").length;
  const lastMonthFailed = lastMonthBookings.filter(
    (b) => b.status === "Booking Failed (Unpaid)" || b.status === "Booking Failed (Paid)"
  ).length;
  const lastMonthCancelled = lastMonthBookings.filter(
    (b) => b.status === "User Cancelled" || b.status === "CNF & Cancelled"
  ).length;
  const lastMonthPending = lastMonthBookings.filter((b) => b.status === "Requested").length;
  const lastMonthSuccessRate = lastMonthTotal > 0 ? Math.round((lastMonthBooked / lastMonthTotal) * 100) : 0;

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

      {/* Last Month Analysis & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Last Month Analysis */}
        <motion.div
          className="lg:col-span-1"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Last Month Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Created</p>
                <p className="mt-1 text-2xl font-semibold">{lastMonthTotal}</p>
                <p className="mt-1 text-xs text-muted-foreground">Success rate: {lastMonthSuccessRate}%</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border p-2">
                  <p className="text-[11px] text-muted-foreground">Booked</p>
                  <p className="mt-0.5 font-semibold text-green-600">{lastMonthBooked}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-[11px] text-muted-foreground">Failed</p>
                  <p className="mt-0.5 font-semibold text-red-600">{lastMonthFailed}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-[11px] text-muted-foreground">Cancelled</p>
                  <p className="mt-0.5 font-semibold text-orange-600">{lastMonthCancelled}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-[11px] text-muted-foreground">Pending</p>
                  <p className="mt-0.5 font-semibold text-amber-600">{lastMonthPending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
