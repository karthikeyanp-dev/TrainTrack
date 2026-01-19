"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AccountsTab } from "@/components/accounts/AccountsTab";

export default function AccountsPage() {
  return (
    <AppShell activeTab="accounts">
      <AccountsTab />
    </AppShell>
  );
}
