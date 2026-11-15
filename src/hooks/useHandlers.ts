"use client";

import { useSyncExternalStore } from "react";
import { handlersStore } from "@/lib/dataStores";
import type { Handler } from "@/types/handler";

/**
 * All handlers, by name, updated in real time.
 * Backed by the app-wide handlers listener, so it adds no Firestore reads.
 */
export function useHandlers() {
  const handlers = useSyncExternalStore(handlersStore.subscribe, handlersStore.getItems, handlersStore.getServerItems);
  const status = useSyncExternalStore(handlersStore.subscribe, handlersStore.getStatus, handlersStore.getServerStatus);

  return {
    data: handlers as Handler[],
    isLoading: !status.ready && !status.error,
    error: status.error,
  };
}
