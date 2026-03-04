"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  History,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  ListChecks,
  Loader2,
  AlertCircle,
  RotateCcw,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ScoreGauge from "@/components/report/ScoreGauge";
import QuestionAccordion from "@/components/report/QuestionAccordion";
import { interviewAPI, getErrorMessage } from "@/lib/api";
import { exportReportPDF } from "@/lib/exportReportPDF";
import type { FinalReport } from "@/lib/api";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.08 },
  }),
};

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [report, setReport] = useState<FinalReport | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await interviewAPI.getReport(sessionId);
      setSessionStatus(response.status);

      if (response.status !== "completed" || !response.report) {
        setReport(null);
        return;
      }

      setReport(response.report);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function handleExportPDF() {
    if (!report) return;
    setExporting(true);
    try {
      await exportReportPDF(sessionId, report);
    } catch {
      setError("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your coaching report...</p>
        </div>
      </main>
    );
  }

  if (error || !report) {
    const inProgress =
      !error && sessionStatus !== null && sessionStatus !== "completed";
    const reportMissing = !error && sessionStatus === "completed";
    const message = error
      ? error
      : inProgress
        ? "Interview is still in progress. Complete the session to unlock your report."
        : reportMissing
          ? "Report not found."
          : "Unable to load report.";

    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="flex max-w-md items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={loadReport}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {inProgress ? (
              <Button variant="outline" onClick={() => router.push(`/interview/${sessionId}`)}>
                Continue Interview
              </Button>
            ) : (
              <Button variant="outline" onClick={() => router.push("/history")}>
                Go to History
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-10">
        <motion.section
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="flex flex-col items-center text-center"
        >
          <div className="flex items-center justify-between w-full mb-6">
            <h1 className="text-2xl font-bold">Coaching Report</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={exporting}
              className="gap-2"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export PDF
            </Button>
          </div>
          <ScoreGauge score={report.overall_score} grade={report.overall_grade} />
        </motion.section>

        <motion.section
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold mb-3">Summary</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
        </motion.section>

        <motion.section
          custom={2}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className={cn(
            "glass rounded-2xl p-6 border",
            report.ready_for_role ? "border-green-400/20" : "border-orange-400/20"
          )}
        >
          <div className="flex items-start gap-3">
            {report.ready_for_role ? (
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-lg font-semibold">Ready for Role</h2>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    report.ready_for_role
                      ? "bg-green-400/10 border-green-400/20 text-green-400"
                      : "bg-orange-400/10 border-orange-400/20 text-orange-400"
                  )}
                >
                  {report.ready_for_role ? "Yes" : "Not Yet"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report.ready_explanation}
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="grid md:grid-cols-3 gap-4"
        >
          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <h3 className="text-sm font-semibold">Top Strengths</h3>
            </div>
            <ul className="space-y-2">
              {report.top_strengths.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="shrink-0 text-green-400/60">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-semibold">Areas to Improve</h3>
            </div>
            <ul className="space-y-2">
              {report.areas_to_improve.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="shrink-0 text-orange-400/60">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Action Items</h3>
            </div>
            <ul className="space-y-2">
              {report.action_items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="shrink-0 text-primary/60">-</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>

        <motion.section custom={4} initial="hidden" animate="visible" variants={fadeUp}>
          <h2 className="mb-4 text-lg font-semibold">Question-by-Question Breakdown</h2>
          <QuestionAccordion feedback={report.per_question_feedback} />
        </motion.section>

        <motion.section
          custom={5}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row"
        >
          <Link href="/interview/start">
            <Button size="lg" className="glow w-full sm:w-auto">
              Start New Interview
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/history">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <History className="mr-2 h-4 w-4" />
              View History
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={handleExportPDF}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export PDF
          </Button>
        </motion.section>
      </div>
    </main>
  );
}