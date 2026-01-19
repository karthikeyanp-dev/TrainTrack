"use client";

import { useQuery } from "@tanstack/react-query";
import { getAccounts, getAccountStats, type AccountStats } from "@/lib/accountsClient";
import type { IrctcAccount } from "@/types/account";

/**
 * Hook to fetch all IRCTC accounts with client-side caching
 * Cached for 5 minutes to avoid unnecessary Firestore reads
 */
export function useAccounts() {
  return useQuery<IrctcAccount[], Error>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const accounts = await getAccounts();
      return accounts;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

/**
 * Hook to fetch account statistics (usage counts, etc.)
 * Stats are cached separately for efficient queries
 */
export function useAccountStats() {
  return useQuery<AccountStats[], Error>({
    queryKey: ["accounts", "stats"],
    queryFn: async () => {
      const stats = await getAccountStats();
      return stats;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
