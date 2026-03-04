import { useEffect, useRef, useCallback } from "react";

const DRAFT_PREFIX = "interview_draft";

export function useAutoSave(sessionId: string, questionNumber: number) {
  const STORAGE_KEY = `${DRAFT_PREFIX}:${sessionId}:q${questionNumber}`;
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const save = useCallback(
    (text: string) => {
      if (!text.trim()) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            text,
            savedAt: Date.now(),
          })
        );
      } catch {
        // localStorage full or unavailable — ignore
      }
    },
    [STORAGE_KEY]
  );

  /** Debounced save — call this on every keystroke */
  const debouncedSave = useCallback(
    (text: string) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => save(text), 800);
    },
    [save]
  );

  /** Load saved draft. Returns empty string if expired or missing. */
  const load = useCallback((): string => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";

      const { text, savedAt } = JSON.parse(raw);

      // Only restore if saved within last 60 minutes
      if (Date.now() - savedAt > 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return "";
      }

      return text || "";
    } catch {
      return "";
    }
  }, [STORAGE_KEY]);

  /** Clear draft after successful submit */
  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, [STORAGE_KEY]);

  /** Clear all drafts for this session (on interview complete) */
  const clearAll = useCallback(() => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(`${DRAFT_PREFIX}:${sessionId}:`)) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // ignore
    }
  }, [sessionId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return { save: debouncedSave, load, clear, clearAll };
}