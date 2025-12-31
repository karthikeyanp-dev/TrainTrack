import { redirect } from "next/navigation";

export default function AccountsPage() {
  // Redirect to unified page with accounts tab
  redirect("/?tab=accounts");
}
