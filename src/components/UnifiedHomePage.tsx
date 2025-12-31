"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { BookingsView } from "@/components/bookings/BookingsView";
import { AccountsTab } from "@/components/accounts/AccountsTab";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";
import { Loader2 } from "lucide-react";
import { useBookings, usePendingBookings, useBookingDates } from "@/hooks/use-bookings";

type TabType = "bookings" | "accounts";

// Wrapper component to access search params
function TabContent({ activeTab, searchQuery }: { activeTab: TabType; searchQuery?: string }) {
  // Fetch data using React Query hooks
  const { data: allBookings = [], isLoading: isLoadingAll } = useBookings();
  const { data: pendingBookings = [], isLoading: isLoadingPending } = usePendingBookings();
  const { data: allBookingDates = [], isLoading: isLoadingDates } = useBookingDates();

  if (activeTab === "bookings") {
    // Show loading skeleton while data is being fetched
    if (isLoadingAll || isLoadingPending || isLoadingDates) {
      return <BookingsLoadingSkeleton />;
    }

    return (
      <BookingsView
        allBookings={allBookings}
        pendingBookings={pendingBookings}
        allBookingDates={allBookingDates}
        searchQuery={searchQuery}
      />
    );
  }

  if (activeTab === "accounts") {
    return (
      <Suspense
        fallback={
          <div className="flex justify-center items-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <AccountsTab />
      </Suspense>
    );
  }

  return null;
}

export function UnifiedHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get tab from URL, default to "bookings"
  const tabFromUrl = (searchParams?.get("tab") as TabType) || "bookings";
  const searchQuery = searchParams?.get("search") || undefined;
  
  // Local state for active tab (for instant UI updates)
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);

  // Sync tab state with URL when URL changes (browser back/forward)
  useEffect(() => {
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  // Handle tab change
  const handleTabChange = (newTab: TabType) => {
    // Update local state immediately for instant UI feedback
    setActiveTab(newTab);
    
    // Update URL
    const params = new URLSearchParams(searchParams?.toString());
    params.set("tab", newTab);
    
    // Preserve search query if exists
    if (searchQuery) {
      params.set("search", searchQuery);
    }
    
    // Use shallow routing to avoid full page reload
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  return (
    <AppShell 
      showAddButton={activeTab === "bookings"} 
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      <TabContent activeTab={activeTab} searchQuery={searchQuery} />
    </AppShell>
  );
}
