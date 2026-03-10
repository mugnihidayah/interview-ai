"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

interface VoiceInputProps {
  sessionId?: string;
  language: string;
  onTranscriptReady: (text: string) => void;
  disabled?: boolean;
  isSpeaking?: boolean;
  onStopTTS?: () => void;
}

export default function VoiceInput({
  sessionId,
  language,
  onTranscriptReady,
  disabled = false,
  isSpeaking = false,
  onStopTTS,
}: VoiceInputProps) {
  const {
    isRecording,
    isTranscribing,
    previewText,
    error,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder(language, sessionId);

  if (!isSupported) return null;

  async function handleStop() {
    const transcript = await stopRecording();
    if (transcript) {
      onTranscriptReady(transcript);
    }
  }

  return (
    <div className="space-y-3">
      {/* TTS indicator */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2"
          >
            <button
              onClick={onStopTTS}
              className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition"
            >
              <VolumeX className="h-3.5 w-3.5" />
              Stop reading
            </button>
            {/* Audio wave animation */}
            <div className="flex items-center gap-0.5">
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-0.5 bg-primary rounded-full"
                  animate={{
                    height: [4, 12, 4],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording controls */}
      <div className="flex items-center gap-3">
        {!isRecording && !isTranscribing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={disabled || isSpeaking}
            className="gap-2"
          >
            <Mic className="h-4 w-4" />
            {language === "id" ? "Mulai Bicara" : "Start Speaking"}
          </Button>
        )}

        {isRecording && (
          <div className="flex items-center gap-3 flex-1">
            {/* Pulse indicator */}
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-red-500/20"
              />
              <div className="relative h-3 w-3 rounded-full bg-red-500" />
            </div>

            <span className="text-xs text-red-400">
              {language === "id" ? "Merekam..." : "Recording..."}
            </span>

            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStop}
                className="gap-2 border-red-500/20 text-red-400 hover:bg-red-500/10"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelRecording}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isTranscribing && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {language === "id" ? "Mentranskrip..." : "Transcribing..."}
            </span>
          </div>
        )}
      </div>

      {/* Preview text (from Web Speech API) */}
      <AnimatePresence>
        {isRecording && previewText && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2"
          >
            <p className="text-xs text-muted-foreground italic">
              💬 {previewText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
