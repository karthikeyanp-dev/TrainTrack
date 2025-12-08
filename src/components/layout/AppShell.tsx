
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { TrainFront, Plus, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SearchBarClient } from "./SearchBarClient";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
  showAddButton?: boolean;
  activeTab?: "bookings" | "accounts";
}

export function AppShell({ children, showAddButton = false, activeTab }: AppShellProps) {
  const searchBarFallback = (
    <Button variant="ghost" size="icon" disabled aria-label="Loading search">
      <Search className="h-5 w-5 opacity-50" />
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <TrainFront className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">TrainTrack</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Suspense fallback={searchBarFallback}>
              <SearchBarClient />
            </Suspense>
            <ThemeSwitcher />
          </nav>
        </div>
      </header>
      <main className="flex-1 container py-6 pb-20">
        {children}
      </main>
      {showAddButton && (
         <Link
            href="/bookings/new"
            className="fixed bottom-20 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="Add New Booking"
          >
            <Plus className="h-7 w-7" />
          </Link>
      )}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container py-2">
          <nav className="grid grid-cols-2 bg-muted p-1 rounded-md">
            <Link
              href="/"
              aria-current={activeTab === "bookings" ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-sm py-2 transition-all",
                activeTab === "bookings" 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-background/50"
              )}
            >
              <TrainFront className="h-5 w-5" />
              <span className="text-xs font-medium">Bookings</span>
            </Link>
            <Link
              href="/accounts"
              aria-current={activeTab === "accounts" ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-sm py-2 transition-all",
                activeTab === "accounts" 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-background/50"
              )}
            >
              <User className="h-5 w-5" />
              <span className="text-xs font-medium">Accounts</span>
            </Link>
          </nav>
        </div>
      </div>
       <footer className="py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} TrainTrack. All rights reserved.
        <p className="mt-1 text-xs">Developed by Karthik Arwin</p>
      </footer>
    </div>
  );
}
