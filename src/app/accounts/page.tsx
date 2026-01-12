
import { AppShell } from "@/components/layout/AppShell";
import { AccountsTab } from "@/components/accounts/AccountsTab";
import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "TrainTrack - Accounts",
  description: "Manage your IRCTC accounts.",
};

export default function AccountsPage() {
  return (
    <AppShell activeTab="accounts">
      <AccountsTab />
    </AppShell>
  );
}
