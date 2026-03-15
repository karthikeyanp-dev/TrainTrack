"use client";

import { AppShell } from "@/components/layout/AppShell";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { BookingsView } from "@/components/bookings/BookingsView";
import { useBookings, usePendingBookings, useBookingDates } from "@/hooks/useBookings";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";
import { motion } from "framer-motion";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Handle legacy tab parameter redirect
  useEffect(() => {
    if (searchParams.get('tab') === 'accounts') {
      router.replace('/accounts');
    }
  }, [searchParams, router]);

  // Fetch data using TanStack Query hooks
  const { data: allBookings = [], isLoading: isLoadingAll, error: errorAll } = useBookings();
  const { data: pendingBookings = [], isLoading: isLoadingPending, error: errorPending } = usePendingBookings();
  const { data: allBookingDates = [], isLoading: isLoadingDates, error: errorDates } = useBookingDates();

  // Show loading state while any data is loading
  const isLoading = isLoadingAll || isLoadingPending || isLoadingDates;

  // Handle errors
  if (errorAll || errorPending || errorDates) {
    return (
      <AppShell showAddButton={true} activeTab="bookings">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center min-h-[400px]"
        >
          <div className="text-center p-8 rounded-2xl bg-destructive/10 border border-destructive/20">
            <p className="text-lg font-semibold text-destructive">Error loading bookings</p>
            <p className="text-sm text-muted-foreground mt-2">
              {(errorAll || errorPending || errorDates)?.message || "An unknown error occurred"}
            </p>
          </div>
        </motion.div>
      </AppShell>
    );
  }

  return (
    <AppShell showAddButton={true} activeTab="bookings">
      {isLoading ? (
        <BookingsLoadingSkeleton />
      ) : (
        <BookingsView 
          allBookings={allBookings} 
          pendingBookings={pendingBookings} 
          allBookingDates={allBookingDates}
        />
      )}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<AppShell showAddButton={true} activeTab="bookings"><BookingsLoadingSkeleton /></AppShell>}>
      <HomePageContent />
    </Suspense>
  );
}
