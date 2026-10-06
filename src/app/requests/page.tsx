"use client";

import { AppShell } from "@/components/layout/AppShell";
import { BookingRequestsInbox } from "@/components/requests/BookingRequestsInbox";

export default function RequestsPage() {
  return (
    <AppShell activeTab="requests">
      <BookingRequestsInbox />
    </AppShell>
  );
}
