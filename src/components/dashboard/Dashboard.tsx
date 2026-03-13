"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Users, 
  Train,
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
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className={`p-2 rounded-xl ${colorStyles[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
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
                <p className="text-xs text-muted-foreground">{description}</p>
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
  const completedCount = allBookings.filter(b => b.status === "Booked").length;
  const cancelledCount = allBookings.filter(b => 
    b.status === "CNF & Cancelled" || b.status === "User Cancelled"
  ).length;
  
  // Today's bookings
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = allBookings.filter(b => b.journeyDate === today);
  
  // This week's bookings
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const thisWeekBookings = allBookings.filter(b => {
    const journeyDate = new Date(b.journeyDate);
    return journeyDate >= new Date() && journeyDate <= weekFromNow;
  });

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Bookings"
          value={totalBookings}
          description="All time bookings"
          icon={Calendar}
          color="blue"
          delay={0.1}
        />
        <StatCard
          title="Pending"
          value={pendingCount}
          description="Awaiting action"
          icon={Clock}
          color="amber"
          delay={0.15}
        />
        <StatCard
          title="Completed"
          value={completedCount}
          description="Successfully booked"
          icon={CheckCircle2}
          color="green"
          delay={0.2}
        />
        <StatCard
          title="This Week"
          value={thisWeekBookings.length}
          description="Upcoming journeys"
          icon={Train}
          color="default"
          delay={0.25}
        />
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <motion.div
          className="lg:col-span-1"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/bookings/new">
                <Button variant="outline" className="w-full justify-between group rounded-xl">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Booking
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Button>
              </Link>
              <Link href="/accounts">
                <Button variant="outline" className="w-full justify-between group rounded-xl">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Manage Accounts
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Button>
              </Link>
              <Link href="/suggestions">
                <Button variant="outline" className="w-full justify-between group rounded-xl">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Smart Suggestions
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Button>
              </Link>
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
