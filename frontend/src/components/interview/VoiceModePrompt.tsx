"use client";

import { Mic, Keyboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface VoiceModePromptProps {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export default function VoiceModePrompt({
  open,
  onEnable,
  onDismiss,
}: VoiceModePromptProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-60 flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onDismiss}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative glass rounded-2xl p-8 max-w-sm w-full text-center space-y-6"
          >
            {/* Icon */}
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Mic className="h-8 w-8 text-primary" />
            </div>

            {/* Text */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Enable Voice Mode?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI will read questions aloud and you can answer by speaking.
                You can still edit your answers before submitting.
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <Button
                onClick={onEnable}
                className="w-full glow gap-2"
                size="lg"
              >
                <Mic className="h-4 w-4" />
                Enable Voice
              </Button>
              <Button
                onClick={onDismiss}
                variant="outline"
                className="w-full gap-2"
                size="lg"
              >
                <Keyboard className="h-4 w-4" />
                Type Instead
              </Button>
            </div>

            {/* Note */}
            <p className="text-[11px] text-muted-foreground">
              You can switch between voice and typing at any time.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}