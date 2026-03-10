"use client";

import { useState, useEffect, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Lock,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Trophy,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/authStore";
import { profileAPI, getErrorMessage } from "@/lib/api";
import type { UserStats } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08 },
  }),
};

export default function ProfilePage() {
  const { user, checkAuth } = useAuthStore();

  // Profile form
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Init
  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
    }
  }, [user]);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await profileAPI.getStats();
        setStats(data);
      } catch {
        // Non-blocking — stats are optional
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, []);

  // Clear success messages after 3 seconds
  useEffect(() => {
    if (profileSuccess) {
      const t = setTimeout(() => setProfileSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [profileSuccess]);

  useEffect(() => {
    if (passwordSuccess) {
      const t = setTimeout(() => setPasswordSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [passwordSuccess]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setProfileError("Full name must be at least 2 characters.");
      return;
    }

    setSavingProfile(true);
    try {
      await profileAPI.updateProfile({ full_name: trimmed });
      await checkAuth();
      setProfileSuccess("Profile updated successfully.");
    } catch (err) {
      setProfileError(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from current password.");
      return;
    }

    setSavingPassword(true);
    try {
      await profileAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  }

  const statCards = stats
    ? [
        {
          icon: BarChart3,
          label: "Total Sessions",
          value: stats.total_sessions.toString(),
          color: "text-primary",
          bgColor: "bg-primary/10",
        },
        {
          icon: CheckCircle2,
          label: "Completed",
          value: stats.completed_sessions.toString(),
          color: "text-green-400",
          bgColor: "bg-green-400/10",
        },
        {
          icon: TrendingUp,
          label: "Avg Score",
          value: stats.average_score !== null ? `${stats.average_score}` : "—",
          suffix: stats.average_score !== null ? "/100" : "",
          color: "text-blue-400",
          bgColor: "bg-blue-400/10",
        },
        {
          icon: Trophy,
          label: "Best Score",
          value: stats.best_score !== null ? `${stats.best_score}` : "—",
          suffix: stats.best_score !== null ? "/100" : "",
          color: "text-amber-400",
          bgColor: "bg-amber-400/10",
        },
      ]
    : [];

  return (
    <main className="pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <h1 className="text-3xl font-bold">Profile Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account and view your interview statistics.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {statsLoading
            ? [...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))
            : statCards.map((card) => (
                <div
                  key={card.label}
                  className="glass rounded-2xl p-4 hover:bg-accent/50 transition-colors"
                >
                  <div
                    className={`h-9 w-9 rounded-xl ${card.bgColor} flex items-center justify-center mb-2`}
                  >
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold">{card.value}</span>
                    {"suffix" in card && card.suffix && (
                      <span className="text-xs text-muted-foreground">
                        {card.suffix}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              ))}
        </motion.div>

        {/* Member since */}
        {stats?.member_since && (
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Calendar className="h-4 w-4" />
            <span>
              Member since{" "}
              {new Date(stats.member_since).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </motion.div>
        )}

        {/* Profile Form */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Profile Information
          </h2>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ""}
                  className="pl-10"
                  disabled
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10"
                  placeholder="Your full name"
                  required
                  minLength={2}
                  maxLength={100}
                  disabled={savingProfile}
                />
              </div>
            </div>

            {profileError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={savingProfile || fullName.trim() === user?.full_name}
              className="gap-2"
            >
              {savingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </form>
        </motion.div>

        {/* Password Form */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Change Password
          </h2>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="current_password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Enter current password"
                  required
                  autoComplete="current-password"
                  disabled={savingPassword}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new_password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={savingPassword}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_new_password">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm_new_password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Repeat new password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={savingPassword}
                />
              </div>
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword || !confirmNewPassword}
              className="gap-2"
            >
              {savingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Change Password
            </Button>
          </form>
        </motion.div>
      </div>
    </main>
  );
}