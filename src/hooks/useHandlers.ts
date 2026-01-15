"use client";

import { useQuery } from "@tanstack/react-query";
import { getHandlers, getHandlerStats, type HandlerStats } from "@/actions/handlerActions";
import type { Handler } from "@/types/handler";

/**
 * Hook to fetch all handlers with client-side caching
 */
export function useHandlers() {
  return useQuery<Handler[], Error>({
    queryKey: ["handlers"],
    queryFn: async () => {
      const handlers = await getHandlers();
      return handlers;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}

/**
 * Hook to fetch handler statistics (booking counts, etc.)
 */
export function useHandlerStats() {
  return useQuery<HandlerStats[], Error>({
    queryKey: ["handlers", "stats"],
    queryFn: async () => {
      const stats = await getHandlerStats();
      return stats;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
