
import type { ReactNode } from "react";
import Link from "next/link";
import { TrainFront, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SearchBarClient } from "./SearchBarClient"; // Added import

interface AppShellProps {
  children: ReactNode;
  showAddButton?: boolean;
}

export function AppShell({ children, showAddButton = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <TrainFront className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">TrainTrack</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <SearchBarClient /> 
            <ThemeSwitcher />
          </nav>
        </div>
      </header>
      <main className="flex-1 container py-6">
        {children}
      </main>
      {showAddButton && (
         <Link
            href="/bookings/new"
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="Add New Booking"
          >
            <Plus className="h-7 w-7" />
          </Link>
      )}
       <footer className="py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} TrainTrack. All rights reserved.
        <p className="mt-1 text-xs">Developed by Karthik Arwin</p>
      </footer>
    </div>
  );
}
