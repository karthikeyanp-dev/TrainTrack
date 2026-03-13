"use client";

import { AppShell } from "@/components/layout/AppShell";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { useBookings, usePendingBookings } from "@/hooks/useBookings";
import { motion } from "framer-motion";
import { Suspense } from "react";

function DashboardPageContent() {
  const { data: allBookings = [], isLoading: isLoadingAll, error: errorAll } = useBookings();
  const { data: pendingBookings = [], isLoading: isLoadingPending, error: errorPending } = usePendingBookings();

  const isLoading = isLoadingAll || isLoadingPending;

  if (errorAll || errorPending) {
    return (
      <AppShell showAddButton={true} activeTab="dashboard">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center min-h-[400px]"
        >
          <div className="text-center p-8 rounded-2xl bg-destructive/10 border border-destructive/20">
            <p className="text-lg font-semibold text-destructive">Error loading data</p>
            <p className="text-sm text-muted-foreground mt-2">
              {(errorAll || errorPending)?.message || "An unknown error occurred"}
            </p>
          </div>
        </motion.div>
      </AppShell>
    );
  }

  return (
    <AppShell showAddButton={true} activeTab="dashboard">
      {isLoading ? (
        <BookingsLoadingSkeleton />
      ) : (
        <Dashboard 
          allBookings={allBookings} 
          pendingBookings={pendingBookings}
        />
      )}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<AppShell showAddButton={true} activeTab="dashboard"><BookingsLoadingSkeleton /></AppShell>}>
      <DashboardPageContent />
    </Suspense>
  );
}
