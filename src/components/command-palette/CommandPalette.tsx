"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Calendar,
  Plus,
  Users,
  Settings,
  Search,
  Home,
  TrendingUp,
  CreditCard,
  Briefcase,
  Moon,
  Sun,
  Keyboard,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

interface CommandPaletteProps {
  bookings?: { id: string; source: string; destination: string; userName: string }[];
}

export function CommandPalette({ bookings = [] }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // Toggle command palette with keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  // Filter bookings for search
  const recentBookings = bookings.slice(0, 5);

  return (
    <>
      {/* Keyboard shortcut hint */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-full border transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs">Search</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigation">
            <CommandItem
              onSelect={() => runCommand(() => router.push("/"))}
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Bookings
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/dashboard"))}
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/accounts"))}
            >
              <Users className="mr-2 h-4 w-4" />
              Manage Accounts
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/suggestions"))}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Smart Suggestions
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => runCommand(() => router.push("/bookings/new"))}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Booking
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push("/accounts"))}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Add IRCTC Account
            </CommandItem>
          </CommandGroup>

          {recentBookings.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent Bookings">
                {recentBookings.map((booking) => (
                  <CommandItem
                    key={booking.id}
                    onSelect={() =>
                      runCommand(() => router.push(`/bookings/edit?id=${booking.id}`))
                    }
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {booking.source} → {booking.destination}
                    <span className="ml-2 text-muted-foreground text-xs">
                      ({booking.userName})
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading="Preferences">
            <CommandItem
              onSelect={() => {
                setTheme(theme === "dark" ? "light" : "dark");
                setOpen(false);
              }}
            >
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              Toggle Theme
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Help">
            <CommandItem disabled>
              <Keyboard className="mr-2 h-4 w-4" />
              Press <kbd className="mx-1 px-1 rounded bg-muted text-xs">⌘K</kbd> to open
              Command Palette
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
