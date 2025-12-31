"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { IrctcAccount } from "@/types/account";
import {
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
} from "@/actions/accountActions";

// Query Keys Factory
export const accountKeys = {
  all: ['accounts'] as const,
  lists: () => [...accountKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...accountKeys.lists(), filters] as const,
  details: () => [...accountKeys.all, 'detail'] as const,
  detail: (id: string) => [...accountKeys.details(), id] as const,
};

// Query Hooks

/**
 * Fetch all IRCTC accounts
 * Cache: 15 minutes, Stale: 2 minutes
 * Refetches on window focus
 */
export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.lists(),
    queryFn: getAccounts,
    gcTime: 15 * 60 * 1000, // 15 minutes
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

// Mutation Hooks

/**
 * Create a new account
 * Invalidates: accounts list
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<IrctcAccount, 'id'>) => addAccount(data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch accounts list
        queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
      }
    },
  });
}

/**
 * Update an existing account
 * Invalidates: the specific account and accounts list
 */
export function useUpdateAccount(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<IrctcAccount, 'id'>) => updateAccount(id, data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate the specific account
        queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
        // Invalidate accounts list
        queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
      }
    },
  });
}

/**
 * Delete an account
 * Invalidates: accounts list
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate accounts list
        queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
      }
    },
  });
}
