"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  Loader2,
  Search,
  Trash2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { interviewAPI, getErrorMessage } from "@/lib/api";
import type { SessionSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "completed" | "in_progress" | "error";

function statusVariant(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-400/10 border-green-400/20 text-green-300";
    case "interviewing":
    case "awaiting_follow_up":
      return "bg-yellow-400/10 border-yellow-400/20 text-yellow-300";
    case "error":
      return "bg-red-400/10 border-red-400/20 text-red-300";
    default:
      return "bg-white/5 border-white/10 text-muted-foreground";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Completed";
    case "interviewing":
    case "awaiting_follow_up":
      return "In Progress";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function scoreColor(score: number) {
  if (score >= 8) return "text-green-300";
  if (score >= 6) return "text-yellow-300";
  if (score >= 4) return "text-orange-300";
  return "text-red-300";
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return status === "completed";
  if (filter === "error") return status === "error";
  return status === "interviewing" || status === "awaiting_follow_up";
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, delay: i * 0.04 },
  }),
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.16 } },
};

export default function HistoryPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await interviewAPI.getHistory(p, 10);
      setSessions(response.sessions);
      setPage(response.page);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(page);
  }, [page, loadHistory]);

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await interviewAPI.deleteSession(deleteTarget.session_id);
      setDeleteTarget(null);

      if (sessions.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await loadHistory(page);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function handleRowClick(session: SessionSummary) {
    if (session.status === "completed") {
      router.push(`/interview/${session.session_id}/report`);
      return;
    }
    if (session.status === "interviewing" || session.status === "awaiting_follow_up") {
      router.push(`/interview/${session.session_id}`);
    }
  }

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sessions.filter((session) => {
      if (!matchesStatusFilter(session.status, statusFilter)) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        session.candidate_name ?? "",
        session.interview_type,
        session.difficulty,
        statusLabel(session.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [query, sessions, statusFilter]);

  return (
    <main className="pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Interview History</h1>
              {!loading && total > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {total} {total === 1 ? "session" : "sessions"} total
                </p>
              )}
            </div>
            <Button onClick={() => router.push("/interview/start")} className="glow">
              New Interview
            </Button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => loadHistory(page)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            </motion.div>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass rounded-xl p-5 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 w-32 rounded bg-white/10" />
                      <div className="h-3 w-48 rounded bg-white/10" />
                    </div>
                    <div className="h-8 w-20 rounded bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && sessions.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                <Inbox className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mb-1 text-lg font-semibold">No interviews yet</h2>
              <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                Start your first mock interview to track progress over time.
              </p>
              <Button onClick={() => router.push("/interview/start")} className="glow">
                Start Your First Interview
              </Button>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="space-y-4">
              <div className="glass rounded-xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, type, or difficulty..."
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "All" },
                      { value: "in_progress", label: "In Progress" },
                      { value: "completed", label: "Completed" },
                      { value: "error", label: "Error" },
                    ].map((item) => (
                      <Button
                        key={item.value}
                        size="sm"
                        variant={statusFilter === item.value ? "default" : "outline"}
                        onClick={() => setStatusFilter(item.value as StatusFilter)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing {filteredSessions.length} of {sessions.length} sessions on this page
                </p>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-8 text-center">
                  <p className="font-medium">No sessions match your filter.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try clearing the search query or choosing a different status.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {filteredSessions.map((session, index) => (
                      <motion.div
                        key={session.session_id}
                        custom={index}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={fadeUp}
                        layout
                        onClick={() => handleRowClick(session)}
                        className={cn(
                          "glass rounded-xl p-5 transition-colors duration-200",
                          (session.status === "completed" ||
                            session.status === "interviewing" ||
                            session.status === "awaiting_follow_up") &&
                            "cursor-pointer hover:bg-white/10"
                        )}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {session.candidate_name && (
                                <span className="text-sm font-medium">{session.candidate_name}</span>
                              )}
                              <Badge variant="outline" className="text-xs capitalize">
                                {session.interview_type}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {session.difficulty}
                              </Badge>
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-xs font-medium",
                                  statusVariant(session.status)
                                )}
                              >
                                {statusLabel(session.status)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(session.created_at)}
                              </span>
                              <span>{formatTime(session.created_at)}</span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            {session.status === "completed" && session.overall_score !== null && (
                              <div className="text-right">
                                <p className={cn("text-xl font-bold", scoreColor(session.overall_score))}>
                                  {session.overall_score.toFixed(1)}
                                </p>
                                {session.overall_grade && (
                                  <p className="text-xs text-muted-foreground">{session.overall_grade}</p>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-1">
                              {session.status === "completed" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/interview/${session.session_id}/report`);
                                  }}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(session);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="px-3 text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Interview Session</DialogTitle>
            <DialogDescription>
              This action will permanently remove the session and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="glass space-y-1 rounded-lg p-3 text-sm">
              {deleteTarget.candidate_name && (
                <p className="font-medium">{deleteTarget.candidate_name}</p>
              )}
              <p className="text-muted-foreground">
                {deleteTarget.interview_type} - {deleteTarget.difficulty} -{" "}
                {formatDate(deleteTarget.created_at)}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
