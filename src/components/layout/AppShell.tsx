"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrainFront, 
  Plus, 
  Users, 
  LayoutDashboard,
  Calendar,
  Settings,
  Menu,
  X,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { cn } from "@/lib/utils";
import { fadeIn, slideUp, staggerContainer, staggerItem } from "@/lib/animations";

interface AppShellProps {
  children: ReactNode;
  showAddButton?: boolean;
  activeTab?: "bookings" | "accounts" | "dashboard" | "suggestions";
}

const navItems = [
  { href: "/", label: "Bookings", icon: Calendar, id: "bookings" },
  { href: "/accounts", label: "Accounts", icon: Users, id: "accounts" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
];

function Sidebar({ activeTab, onClose }: { activeTab?: string; onClose?: () => void }) {
  const pathname = usePathname();
  
  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -100, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-0 top-0 z-40 h-full w-64 border-r bg-card/50 backdrop-blur-xl hidden lg:block"
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-6 border-b">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-glow-primary">
            <TrainFront className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold gradient-text">TrainTrack</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-1"
          >
            {navItems.map((item) => {
              const isActive = pathname === item.href || activeTab === item.id;
              return (
                <motion.div key={item.href} variants={staggerItem}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-elevation-2"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive && "text-primary-foreground")} />
                    {item.label}
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="ml-auto"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </motion.div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </nav>

        {/* Footer */}
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            © {new Date().getFullYear()} TrainTrack
          </p>
        </div>
      </div>
    </motion.aside>
  );
}

function MobileNav({ activeTab }: { activeTab?: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 lg:hidden">
        <div className="glass border-b">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
                <TrainFront className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="truncate font-bold gradient-text">TrainTrack</span>
            </Link>
            <div className="flex items-center gap-1">
              <CommandPalette />
              <ThemeSwitcher />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(!isOpen)}
                className="relative"
              >
                <AnimatePresence mode="wait">
                  {isOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Menu className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-14 bottom-0 z-40 w-64 bg-card border-r lg:hidden"
            >
              <nav className="p-4 space-y-1">
                {navItems.map((item, index) => {
                  const isActive = pathname === item.href || activeTab === item.id;
                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
        <div className="glass border-t px-4 pb-safe">
          <div className="flex items-center justify-around py-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href || activeTab === item.id;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-col items-center gap-1 py-2 px-4"
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobileActive"
                      className="absolute inset-0 bg-primary/10 rounded-xl"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-colors relative z-10",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium transition-colors relative z-10",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

export function AppShell({ children, showAddButton = false, activeTab }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar activeTab={activeTab} />

      {/* Mobile Navigation */}
      <MobileNav activeTab={activeTab} />

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Desktop Header */}
        <header className="sticky top-0 z-30 hidden lg:block">
          <div className="glass border-b">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <h1 className="text-heading-4 font-semibold">
                  {activeTab === "bookings" && "Bookings"}
                  {activeTab === "accounts" && "Accounts"}
                  {activeTab === "dashboard" && "Dashboard"}
                  {activeTab === "suggestions" && "Smart Suggestions"}
                </h1>
              </div>
              <nav className="flex items-center gap-2">
                <ThemeSwitcher />
              </nav>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="pt-14 lg:pt-0 pb-20 lg:pb-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="p-4 lg:p-6 w-full"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Floating Action Button */}
      <AnimatePresence>
        {showAddButton && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="fixed bottom-24 right-4 z-30 lg:bottom-8 lg:right-8"
          >
            <Link href="/bookings/new">
              <Button
                size="lg"
                className="h-14 w-14 rounded-full shadow-elevation-4 hover:shadow-elevation-5 hover:scale-105 transition-all duration-300"
              >
                <Plus className="h-6 w-6" />
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
