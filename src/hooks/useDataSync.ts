"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { bookingRecordsStore, bookingsStore, resyncAllData } from "@/lib/dataStores";
import { describeFirestoreError } from "@/lib/firestoreErrors";
import { useToast } from "@/hooks/use-toast";

/** Why live updates are currently not arriving, or null when all is well. */
export function useSyncError(): Error | null {
  const bookings = useSyncExternalStore(bookingsStore.subscribe, bookingsStore.getStatus, bookingsStore.getServerStatus);
  const records = useSyncExternalStore(
    bookingRecordsStore.subscribe,
    bookingRecordsStore.getStatus,
    bookingRecordsStore.getServerStatus
  );
  return bookings.error || records.error;
}

/** Reconnect the live listeners now instead of waiting for the next automatic retry. */
export function retryDataSync(): void {
  bookingsStore.retry();
  bookingRecordsStore.retry();
}

/**
 * Re-download bookings and booking records in full. Normally never needed —
 * it exists for data changed outside the app (e.g. edited in the Firebase
 * console) and costs one read per document.
 */
export function useResyncData() {
  const { toast } = useToast();
  const [isResyncing, setIsResyncing] = useState(false);

  const resync = useCallback(async () => {
    setIsResyncing(true);
    try {
      await resyncAllData();
      const total = bookingsStore.getDocs().length + bookingRecordsStore.getDocs().length;
      toast({
        title: "Data re-downloaded",
        description: `${total.toLocaleString("en-IN")} bookings and booked details were read from the server.`,
      });
    } catch (error) {
      toast({
        title: "Could not re-download data",
        description: describeFirestoreError(error, "Check the connection and try again."),
        variant: "destructive",
      });
    } finally {
      setIsResyncing(false);
    }
  }, [toast]);

  return { resync, isResyncing };
}
