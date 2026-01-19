"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

// Create a new QueryClient instance on each render on the client
// This prevents sharing of query client between users/requests
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Optimized for private app with coordinated team usage
        // Data only refetches on mutations or manual refresh
        staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
        gcTime: 10 * 60 * 1000, // 10 minutes - cache kept in memory (renamed from cacheTime in v5)
        refetchOnWindowFocus: false, // Don't refetch when user returns to tab
        refetchOnMount: true, // Fetch on mount if data is stale
        retry: 2, // Retry failed queries twice
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: alwaysmake a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  // NOTE: Avoid useState when initializing the query client if you are
  //       renderinghydration sensitive pages.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
