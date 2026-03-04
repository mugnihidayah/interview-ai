"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  History,
  ArrowRight,
  TrendingUp,
  Trophy,
  BarChart3,
  Calendar,
  Clock,
  ArrowUpRight,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/authStore";
import { interviewAPI, type SessionSummary } from "@/lib/api";

/* Helpers */

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function gradeColor(grade: string | null): string {
  if (!grade) return "text-muted-foreground";
  const g = grade.toUpperCase();
  if (g.startsWith("E")) return "text-green-400";
  if (g.startsWith("V")) return "text-blue-400";
  if (g.startsWith("G")) return "text-yellow-400";
  return "text-red-400";
}

function statusConfig(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        className: "bg-green-500/10 text-green-400 border-green-500/20",
      };
    case "error":
      return {
        label: "Error",
        className: "bg-red-500/10 text-red-400 border-red-500/20",
      };
    default:
      return {
        label: "In Progress",
        className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      };
  }
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "from-green-500 to-emerald-400";
  if (score >= 60) return "from-blue-500 to-sky-400";
  if (score >= 40) return "from-yellow-500 to-amber-400";
  return "from-red-500 to-orange-400";
}

/* Animation variants */

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

/* Component */

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await interviewAPI.getHistory(1, 20);
        setSessions(data.sessions);
        setTotalSessions(data.total);
      } catch {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  /* Computed stats */

  const stats = useMemo(() => {
    const scored = sessions.filter((s) => s.overall_score !== null);

    const avgScore =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, s) => sum + (s.overall_score || 0), 0) /
              scored.length
          )
        : null;

    const bestScore =
      scored.length > 0
        ? Math.round(Math.max(...scored.map((s) => s.overall_score || 0)))
        : null;

    // Sessions this week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = sessions.filter(
      (s) => new Date(s.created_at) >= weekStart
    ).length;

    return { avgScore, bestScore, thisWeek };
  }, [sessions]);

  const activeSessions = useMemo(
    () =>
      sessions.filter(
        (s) => s.status !== "completed" && s.status !== "error"
      ),
    [sessions]
  );

  const scoreTrend = useMemo(
    () =>
      sessions
        .filter((s) => s.overall_score !== null && s.status === "completed")
        .slice(0, 8)
        .reverse(),
    [sessions]
  );

  const recentSessions = sessions.slice(0, 5);

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const greeting = getGreeting();

  /* Stat card data */

  const statCards = [
    {
      icon: BarChart3,
      label: "Total Sessions",
      value: totalSessions.toString(),
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: TrendingUp,
      label: "Avg Score",
      value: stats.avgScore !== null ? `${stats.avgScore}` : "—",
      suffix: stats.avgScore !== null ? "/10" : "",
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      icon: Trophy,
      label: "Best Score",
      value: stats.bestScore !== null ? `${stats.bestScore}` : "—",
      suffix: stats.bestScore !== null ? "/10" : "",
      color: "text-amber-400",
      bgColor: "bg-amber-400/10",
    },
    {
      icon: Calendar,
      label: "This Week",
      value: stats.thisWeek.toString(),
      suffix: stats.thisWeek === 1 ? " session" : " sessions",
      color: "text-green-400",
      bgColor: "bg-green-400/10",
    },
  ];

  /* Loading state */

  if (loading) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </main>
    );
  }

  /* Error state */

  if (error && sessions.length === 0) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              setLoading(true);
              interviewAPI
                .getHistory(1, 20)
                .then((data) => {
                  setSessions(data.sessions);
                  setTotalSessions(data.total);
                })
                .catch(() => setError("Failed to load dashboard data"))
                .finally(() => setLoading(false));
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </main>
    );
  }

  /* Empty state (no sessions ever) */

  if (totalSessions === 0 && !loading) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="space-y-8"
          >
            <motion.div variants={fadeUp}>
              <h1 className="text-3xl sm:text-4xl font-bold">
                {greeting},{" "}
                <span className="gradient-text">{firstName}</span> 👋
              </h1>
              <p className="text-muted-foreground mt-2">
                Welcome to Interview AI. Let&apos;s get you started.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="glass rounded-3xl p-10 sm:p-14 text-center glow"
            >
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                Start Your First Interview
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Upload your resume and a job description, and our AI will
                generate a personalized mock interview with detailed coaching
                feedback.
              </p>
              <Link href="/interview/start">
                <Button size="lg" className="glow text-base px-10">
                  Start Interview
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </main>
    );
  }

  /* Main dashboard */

  return (
    <main className="pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="space-y-8"
        >
          {/* Welcome Header */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">
                {greeting},{" "}
                <span className="gradient-text">{firstName}</span> 👋
              </h1>
              <p className="text-muted-foreground mt-1">
                Here&apos;s your interview practice overview.
              </p>
            </div>
            <Link href="/interview/start" className="shrink-0">
              <Button className="glow gap-2">
                <Play className="h-4 w-4" />
                New Interview
              </Button>
            </Link>
          </motion.div>

          {/* Stat Cards */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {statCards.map((card) => (
              <div
                key={card.label}
                className="glass rounded-2xl p-5 hover:bg-white/4 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`h-10 w-10 rounded-xl ${card.bgColor} flex items-center justify-center`}
                  >
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-3xl font-bold">
                      {card.value}
                    </span>
                    {card.suffix && (
                      <span className="text-sm text-muted-foreground">
                        {card.suffix}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Active Session Banner */}
          <AnimatePresence>
            {activeSessions.length > 0 && (
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, height: 0 }}
                className="glass rounded-2xl p-5 border border-blue-500/20 bg-blue-500/3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        You have {activeSessions.length} interview
                        {activeSessions.length > 1 ? "s" : ""} in progress
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeSessions[0].interview_type} ·{" "}
                        {activeSessions[0].difficulty} · Started{" "}
                        {timeAgo(activeSessions[0].created_at)}
                      </p>
                    </div>
                  </div>
                  <Link href={`/interview/${activeSessions[0].session_id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-blue-500/20 text-blue-400 hover:bg-blue-500/10"
                    >
                      Continue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Score Trend + Quick Actions */}
          <motion.div
            variants={fadeUp}
            className="grid lg:grid-cols-3 gap-6"
          >
            {/* Score Trend */}
            <div className="lg:col-span-2 glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Score Trend
                </h2>
                <span className="text-xs text-muted-foreground">
                  Last {scoreTrend.length} sessions
                </span>
              </div>

              {scoreTrend.length > 0 ? (
                <div className="flex items-end gap-2 sm:gap-3 h-40">
                  {scoreTrend.map((session, i) => {
                    const score = session.overall_score || 0;
                    const heightPct = Math.max(score, 5);

                    return (
                      <div
                        key={session.session_id}
                        className="flex-1 flex flex-col items-center gap-1.5 group"
                      >
                        <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          {score}
                        </span>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{
                            duration: 0.6,
                            delay: i * 0.08,
                            ease: "easeOut",
                          }}
                          className={`w-full rounded-t-md bg-linear-to-t ${scoreBarColor(score)} cursor-pointer hover:opacity-80 transition-opacity min-h-1`}
                          onClick={() =>
                            router.push(
                              `/interview/${session.session_id}/report`
                            )
                          }
                          title={`${session.interview_type} · ${session.difficulty} · Score: ${score}`}
                        />
                        <span className="text-[10px] text-muted-foreground capitalize truncate w-full text-center">
                          {session.interview_type?.slice(0, 4)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Complete interviews to see your score trend
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="glass rounded-2xl p-6">
              <h2 className="font-semibold mb-5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Quick Actions
              </h2>
              <div className="space-y-3">
                <Link href="/interview/start" className="block">
                  <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Play className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Start Interview</p>
                      <p className="text-xs text-muted-foreground">
                        New mock session
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                <Link href="/history" className="block">
                  <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                    <div className="h-10 w-10 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0">
                      <History className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">View History</p>
                      <p className="text-xs text-muted-foreground">
                        {totalSessions} total sessions
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                {activeSessions.length > 0 && (
                  <Link
                    href={`/interview/${activeSessions[0].session_id}`}
                    className="block"
                  >
                    <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                      <div className="h-10 w-10 rounded-xl bg-blue-400/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Continue Session
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Resume in-progress
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>

          {/* Recent Sessions */}
          <motion.div variants={fadeUp} className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Recent Sessions
              </h2>
              {totalSessions > 5 && (
                <Link href="/history">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              )}
            </div>

            <div className="space-y-2">
              {recentSessions.map((session) => {
                const st = statusConfig(session.status);
                const isActive =
                  session.status !== "completed" &&
                  session.status !== "error";
                const reportHref = `/interview/${session.session_id}/report`;
                const continueHref = `/interview/${session.session_id}`;

                return (
                  <div
                    key={session.session_id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl hover:bg-white/3 transition-colors"
                  >
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {session.candidate_name && (
                          <span className="text-sm font-medium truncate">
                            {session.candidate_name}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] capitalize"
                        >
                          {session.interview_type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {session.difficulty}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${st.className}`}
                        >
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {timeAgo(session.created_at)}
                        {session.completed_at &&
                          ` · Completed ${timeAgo(session.completed_at)}`}
                      </p>
                    </div>

                    {/* Score + Action */}
                    <div className="flex items-center gap-3 sm:gap-4">
                      {session.overall_score !== null ? (
                        <div className="text-right">
                          <span className="text-lg font-bold">
                            {Math.round(session.overall_score)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            /10
                          </span>
                          {session.overall_grade && (
                            <span
                              className={`ml-2 text-sm font-semibold ${gradeColor(session.overall_grade)}`}
                            >
                              {session.overall_grade}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}

                      <Link href={isActive ? continueHref : reportHref}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs"
                        >
                          {isActive ? "Continue" : "Report"}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}