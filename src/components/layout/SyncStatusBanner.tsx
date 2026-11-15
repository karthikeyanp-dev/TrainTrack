"use client";

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retryDataSync, useSyncError } from "@/hooks/useDataSync";
import { isQuotaExceededError } from "@/lib/firestoreErrors";

/**
 * Shown while live updates are not arriving (daily quota used up, no
 * connection). The app keeps working from the copy saved on the device, so
 * this says the data may be behind rather than blocking the page.
 */
export function SyncStatusBanner() {
  const error = useSyncError();
  if (!error) return null;

  const quotaExceeded = isQuotaExceededError(error);

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-800 dark:text-amber-200">
          {quotaExceeded ? "Today's free Firestore quota is used up" : "Live updates are paused"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {quotaExceeded
            ? "You are seeing the data saved on this device. Changes cannot be saved until the quota resets (around 12:30–1:30 PM IST)."
            : "You are seeing the data saved on this device, which may be out of date. Reconnecting automatically."}
        </p>
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={retryDataSync}>
        Retry
      </Button>
    </div>
  );
}
