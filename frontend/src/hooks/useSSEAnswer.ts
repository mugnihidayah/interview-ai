import { useState, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { API_URL } from "@/lib/api";
import type { Evaluation, SubmitAnswerResponse } from "@/lib/api";

export type SSEPhase =
  | "idle"
  | "processing"
  | "evaluating"
  | "evaluated"
  | "generating_question"
  | "generating_report"
  | "follow_up"
  | "result"
  | "error";

interface SSEState {
  phase: SSEPhase;
  phaseMessage: string;
  evaluation: Evaluation | null;
  result: SubmitAnswerResponse | null;
  error: string | null;
  isStreaming: boolean;
}

const INITIAL_STATE: SSEState = {
  phase: "idle",
  phaseMessage: "",
  evaluation: null,
  result: null,
  error: null,
  isStreaming: false,
};

export function useSSEAnswer() {
  const [state, setState] = useState<SSEState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false, phase: "idle" }));
  }, []);

  const submitStream = useCallback(
    async (
      sessionId: string,
      answer: string,
      options: {
        prefetchTTS?: boolean;
      } = {}
    ) => {
      // Abort previous stream if any
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState({
        phase: "processing",
        phaseMessage: "Processing your answer...",
        evaluation: null,
        result: null,
        error: null,
        isStreaming: true,
      });

      try {
        // Build headers with auth fallback
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = Cookies.get("access_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${API_URL}/api/interview/answer/stream`,
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              session_id: sessionId,
              answer,
              prefetch_tts: options.prefetchTTS ?? false,
            }),
            signal: abortRef.current.signal,
          }
        );

        // Handle HTTP-level errors (auth, rate limit, ownership, etc.)
        if (!response.ok) {
          let errorMsg = "Failed to submit answer";
          try {
            const errorData = await response.json();
            if (typeof errorData.detail === "string") {
              errorMsg = errorData.detail;
            } else if (
              typeof errorData.detail === "object" &&
              errorData.detail?.error
            ) {
              errorMsg = errorData.detail.error;
            }
          } catch {
            // ignore parse error
          }

          // 401 → redirect to login
          if (response.status === 401) {
            Cookies.remove("access_token");
            window.location.href = "/auth/login";
            return;
          }

          setState((prev) => ({
            ...prev,
            phase: "error",
            error: errorMsg,
            isStreaming: false,
          }));
          return;
        }

        // Read SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const trimmed = chunk.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const payload = trimmed.slice(6);
            if (payload === "[DONE]") {
              setState((prev) => ({ ...prev, isStreaming: false }));
              return;
            }

            try {
              const event = JSON.parse(payload);

              switch (event.phase) {
                case "processing":
                  setState((prev) => ({
                    ...prev,
                    phase: "processing",
                    phaseMessage: event.message || "Processing...",
                  }));
                  break;

                case "evaluating":
                  setState((prev) => ({
                    ...prev,
                    phase: "evaluating",
                    phaseMessage: event.message || "Evaluating...",
                  }));
                  break;

                case "evaluated":
                  setState((prev) => ({
                    ...prev,
                    phase: "evaluated",
                    phaseMessage: "Evaluation complete",
                    evaluation: event.evaluation || null,
                  }));
                  break;

                case "generating_question":
                  setState((prev) => ({
                    ...prev,
                    phase: "generating_question",
                    phaseMessage:
                      event.message || "Preparing next question...",
                  }));
                  break;

                case "generating_report":
                  setState((prev) => ({
                    ...prev,
                    phase: "generating_report",
                    phaseMessage:
                      event.message || "Generating coaching report...",
                  }));
                  break;

                case "follow_up":
                  setState((prev) => ({
                    ...prev,
                    phase: "follow_up",
                    result: event.data || null,
                    isStreaming: false,
                  }));
                  return;

                case "result":
                  setState((prev) => ({
                    ...prev,
                    phase: "result",
                    result: event.data || null,
                    isStreaming: false,
                  }));
                  return;

                case "error":
                  setState((prev) => ({
                    ...prev,
                    phase: "error",
                    error: event.message || "An error occurred",
                    isStreaming: false,
                  }));
                  return;
              }
            } catch {
              console.warn("Failed to parse SSE event:", payload);
            }
          }
        }

        // Stream ended without [DONE]
        setState((prev) => {
          if (prev.isStreaming) return { ...prev, isStreaming: false };
          return prev;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setState((prev) => ({
          ...prev,
          phase: "error",
          error: err instanceof Error ? err.message : "Connection failed",
          isStreaming: false,
        }));
      }
    },
    []
  );

  return {
    ...state,
    submitStream,
    cancel,
    reset,
  };
}
