"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  History,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/layout/ThemeToggle";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interview/start", label: "Start Interview", icon: Play },
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    setMobileOpen(false);
    await logout();
    router.push("/");
  }

  if (!user) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="shrink-0">
          <span className="text-xl font-bold gradient-text">Interview AI</span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-2 text-muted-foreground hover:text-foreground",
                    active && "text-foreground bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground truncate max-w-45">
            {user.full_name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>

        {/* Mobile actions */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Sign out"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-border/50 overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                        active && "text-foreground bg-accent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </div>
                  </Link>
                );
              })}

              <div className="border-t border-border/50 pt-2 mt-2">
                <div className="px-3 py-2 text-sm text-muted-foreground truncate">
                  {user.full_name}
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-accent transition-colors w-full"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}