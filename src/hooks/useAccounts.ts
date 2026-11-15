"use client";

import { useSyncExternalStore } from "react";
import { accountsStore } from "@/lib/dataStores";
import type { IrctcAccount } from "@/types/account";

/**
 * All IRCTC accounts, highest wallet balance first, updated in real time.
 * Backed by the app-wide accounts listener, so it adds no Firestore reads.
 */
export function useAccounts() {
  const accounts = useSyncExternalStore(accountsStore.subscribe, accountsStore.getItems, accountsStore.getServerItems);
  const status = useSyncExternalStore(accountsStore.subscribe, accountsStore.getStatus, accountsStore.getServerStatus);

  return {
    data: accounts as IrctcAccount[],
    isLoading: !status.ready && !status.error,
    error: status.error,
  };
}
