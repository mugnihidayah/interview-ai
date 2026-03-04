"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  ArrowRight,
  AlertCircle,
  Bot,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import ChatBubble from "@/components/interview/ChatBubble";
import EvaluationCard from "@/components/interview/EvaluationCard";
import ProgressBar from "@/components/interview/ProgressBar";
import { interviewAPI, getErrorMessage } from "@/lib/api";
import { useSSEAnswer } from "@/hooks/useSSEAnswer";
import type { Evaluation } from "@/lib/api";
import { useAutoSave } from "@/hooks/useAutoSave";

interface Message {
  id: string;
  role: "ai" | "user";
  content: string;
  isFollowUp?: boolean;
  evaluation?: Evaluation;
}

export default function InterviewSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(8);
  const [status, setStatus] = useState("interviewing");
  const [interviewType, setInterviewType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [reloadingSession, setReloadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSE Hook
  const {
    phase: ssePhase,
    phaseMessage,
    evaluation: sseEvaluation,
    result: sseResult,
    error: sseError,
    isStreaming,
    submitStream,
    cancel,
  } = useSSEAnswer();

  // Refs for SSE reaction tracking
  const lastProcessedPhaseRef = useRef<string>("");
  const pendingAnswerRef = useRef<string>("");
  const userMessageIdRef = useRef<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitting = isStreaming;

  // Auto-save
  const autoSave = useAutoSave(sessionId, questionNumber);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  // Load Session
  const loadSession = useCallback(async () => {
    setError(null);
    setReloadingSession(true);

    try {
      const session = await interviewAPI.getSession(sessionId);

      setQuestionNumber(session.question_number);
      setTotalQuestions(session.total_questions);
      setStatus(session.status);
      setInterviewType(session.interview_type || "");
      setDifficulty(session.difficulty || "");
      setCandidateName(session.candidate_name || "");

      if (session.status === "completed") {
        router.replace(`/interview/${sessionId}/report`);
        return;
      }

      if (session.current_question) {
        setMessages([
          {
            id: `q-${session.question_number}`,
            role: "ai",
            content: session.current_question,
            isFollowUp: session.is_follow_up,
          },
        ]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setInitialLoading(false);
      setReloadingSession(false);
    }
  }, [sessionId, router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Restore draft when question changes
  useEffect(() => {
    if (!submitting) {
      const draft = autoSave.load();
      if (draft) {
        setAnswer(draft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionNumber]);

  // Scroll on message/stream changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  // SSE Phase Reactions
  useEffect(() => {
    // Skip phases already processed
    if (ssePhase === lastProcessedPhaseRef.current) return;

    // Passthrough phases — just track
    if (
      ssePhase === "idle" ||
      ssePhase === "processing" ||
      ssePhase === "evaluating" ||
      ssePhase === "generating_question" ||
      ssePhase === "generating_report"
    ) {
      lastProcessedPhaseRef.current = ssePhase;
      return;
    }

    // Evaluated → add evaluation card
    if (ssePhase === "evaluated" && sseEvaluation) {
      lastProcessedPhaseRef.current = "evaluated";
      const evalMessage: Message = {
        id: `e-${Date.now()}`,
        role: "ai",
        content: "",
        evaluation: sseEvaluation,
      };
      setMessages((prev) => [...prev, evalMessage]);
    }

    // Follow-up → add follow-up question
    if (ssePhase === "follow_up" && sseResult) {
      lastProcessedPhaseRef.current = "follow_up";
      setQuestionNumber(sseResult.question_number);
      setStatus(sseResult.status);

      if (sseResult.current_question) {
        const followUpQ: Message = {
          id: `q-followup-${Date.now()}`,
          role: "ai",
          content: sseResult.current_question,
          isFollowUp: true,
        };
        setMessages((prev) => [...prev, followUpQ]);
      }

      textareaRef.current?.focus();
    }

    // Result → next question or redirect to report
    if (ssePhase === "result" && sseResult) {
      lastProcessedPhaseRef.current = "result";
      setQuestionNumber(sseResult.question_number);
      setStatus(sseResult.status);

      if (sseResult.status === "completed") {
        autoSave.clearAll();
        setTimeout(() => {
          router.push(`/interview/${sessionId}/report`);
        }, 1500);
        return;
      }

      if (sseResult.current_question) {
        setTimeout(() => {
          const nextQ: Message = {
            id: `q-${sseResult.question_number}-${Date.now()}`,
            role: "ai",
            content: sseResult.current_question!,
            isFollowUp: sseResult.is_follow_up,
          };
          setMessages((prev) => [...prev, nextQ]);
          textareaRef.current?.focus();
        }, 600);
      }
    }

    // Error → show error, rollback user message
    if (ssePhase === "error") {
      lastProcessedPhaseRef.current = "error";
      setError(sseError || "An unexpected error occurred");
      setAnswer(pendingAnswerRef.current);
      if (userMessageIdRef.current) {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== userMessageIdRef.current)
        );
      }
    }
  }, [ssePhase, sseEvaluation, sseResult, sseError, sessionId, router, autoSave]);

  // Submit Handler (SSE)
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmed = answer.trim();
    if (!trimmed || submitting) return;

    if (trimmed.length > 10000) {
      setError("Answer must be under 10,000 characters.");
      return;
    }

    setError(null);

    // Store for rollback on error
    pendingAnswerRef.current = trimmed;

    // Optimistically add user message
    const userMsgId = `a-${Date.now()}`;
    userMessageIdRef.current = userMsgId;
    const userMessage: Message = {
      id: userMsgId,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setAnswer("");

    // Reset tracking and start SSE stream
    lastProcessedPhaseRef.current = "";
    autoSave.clear();
    submitStream(sessionId, trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  // Loading State
  if (initialLoading) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="text-center">
            <p className="font-medium">Preparing your interview...</p>
            <p className="text-sm text-muted-foreground mt-1">
              This may take a moment
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Error State (no messages)
  if (error && messages.length === 0) {
    return (
      <main className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive max-w-md">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loadSession}
              disabled={reloadingSession}
            >
              {reloadingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retry
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/interview/start")}
            >
              Back to Setup
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const isCompleted = status === "completed";
  const isAwaitingFollowUp = status === "awaiting_follow_up";

  return (
    <main className="pt-16 flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-md px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {candidateName && (
                <span className="text-sm font-medium">{candidateName}</span>
              )}
              <div className="flex gap-1.5">
                {interviewType && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {interviewType}
                  </Badge>
                )}
                {difficulty && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {difficulty}
                  </Badge>
                )}
                {isAwaitingFollowUp && (
                  <Badge
                    variant="outline"
                    className="text-xs border-yellow-400/30 text-yellow-300"
                  >
                    Follow-up Required
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ProgressBar current={questionNumber} total={totalQuestions} />
        </div>
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => {
              if (msg.evaluation) {
                return (
                  <EvaluationCard key={msg.id} evaluation={msg.evaluation} />
                );
              }

              return (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  isFollowUp={msg.isFollowUp}
                />
              );
            })}
          </AnimatePresence>

          {/* Streaming Phase Indicator */}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 max-w-[85%]"
            >
              <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="glass rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {phaseMessage}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-white/5 bg-background/80 backdrop-blur-md px-4 py-4">
        <div className="max-w-3xl mx-auto">
          {isCompleted ? (
            <Button
              className="w-full glow"
              size="lg"
              onClick={() => router.push(`/interview/${sessionId}/report`)}
            >
              View Coaching Report
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    autoSave.save(e.target.value);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer... (Shift+Enter for new line)"
                  rows={2}
                  disabled={submitting}
                  className="resize-none pr-12 min-h-13 max-h-40"
                />
                <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                  {answer.length > 0 && answer.length.toLocaleString()}
                </span>
              </div>
              <Button
                type="submit"
                size="icon"
                className="h-13 w-13 shrink-0 glow"
                disabled={submitting || !answer.trim()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}

          {error && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="underline underline-offset-2"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}