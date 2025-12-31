"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Handler } from "@/types/handler";
import {
  getHandlers,
  addHandler,
  updateHandler,
  deleteHandler,
} from "@/actions/handlerActions";

// Query Keys Factory
export const handlerKeys = {
  all: ['handlers'] as const,
  lists: () => [...handlerKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...handlerKeys.lists(), filters] as const,
  details: () => [...handlerKeys.all, 'detail'] as const,
  detail: (id: string) => [...handlerKeys.details(), id] as const,
};

// Query Hooks

/**
 * Fetch all handlers
 * Cache: 30 minutes, Stale: 5 minutes
 */
export function useHandlers() {
  return useQuery({
    queryKey: handlerKeys.lists(),
    queryFn: getHandlers,
    gcTime: 30 * 60 * 1000, // 30 minutes
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation Hooks

/**
 * Create a new handler
 * Invalidates: handlers list
 */
export function useCreateHandler() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Handler, 'id' | 'createdAt'>) => addHandler(data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}

/**
 * Update an existing handler
 * Invalidates: the specific handler and handlers list
 */
export function useUpdateHandler(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Handler, 'id' | 'createdAt'>) => updateHandler(id, data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate the specific handler
        queryClient.invalidateQueries({ queryKey: handlerKeys.detail(id) });
        // Invalidate handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}

/**
 * Delete a handler
 * Invalidates: handlers list
 */
export function useDeleteHandler() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteHandler(id),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Handler } from "@/types/handler";
import {
  getHandlers,
  addHandler,
  updateHandler,
  deleteHandler,
} from "@/actions/handlerActions";

// Query Keys Factory
export const handlerKeys = {
  all: ['handlers'] as const,
  lists: () => [...handlerKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...handlerKeys.lists(), filters] as const,
  details: () => [...handlerKeys.all, 'detail'] as const,
  detail: (id: string) => [...handlerKeys.details(), id] as const,
};

// Query Hooks

/**
 * Fetch all handlers
 * Cache: 30 minutes, Stale: 5 minutes
 */
export function useHandlers() {
  return useQuery({
    queryKey: handlerKeys.lists(),
    queryFn: getHandlers,
    gcTime: 30 * 60 * 1000, // 30 minutes
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Mutation Hooks

/**
 * Create a new handler
 * Invalidates: handlers list
 */
export function useCreateHandler() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Handler, 'id' | 'createdAt'>) => addHandler(data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate and refetch handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}

/**
 * Update an existing handler
 * Invalidates: the specific handler and handlers list
 */
export function useUpdateHandler(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<Handler, 'id' | 'createdAt'>) => updateHandler(id, data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate the specific handler
        queryClient.invalidateQueries({ queryKey: handlerKeys.detail(id) });
        // Invalidate handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}

/**
 * Delete a handler
 * Invalidates: handlers list
 */
export function useDeleteHandler() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteHandler(id),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate handlers list
        queryClient.invalidateQueries({ queryKey: handlerKeys.lists() });
      }
    },
  });
}
