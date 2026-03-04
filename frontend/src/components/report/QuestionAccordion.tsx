"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageSquare, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PerQuestionFeedback } from "@/lib/api";

interface QuestionAccordionProps {
  feedback: PerQuestionFeedback[];
}

function scoreColor(score: number) {
  if (score >= 8) return "text-green-400 bg-green-400/10 border-green-400/20";
  if (score >= 6) return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (score >= 4) return "text-orange-400 bg-orange-400/10 border-orange-400/20";
  return "text-red-400 bg-red-400/10 border-red-400/20";
}

export default function QuestionAccordion({
  feedback,
}: QuestionAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <div className="space-y-2">
      {feedback.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <div key={item.question_number} className="glass rounded-xl overflow-hidden">
            {/* Header */}
            <button
              onClick={() => toggle(index)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  Q{item.question_number}
                </span>
                <p className="text-sm font-medium truncate">
                  {item.question}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-md border text-xs font-bold",
                    scoreColor(item.score)
                  )}
                >
                  {item.score}/10
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </button>

            {/* Content */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                    {/* Question */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Question
                      </p>
                      <p className="text-sm leading-relaxed">{item.question}</p>
                    </div>

                    {/* User Answer */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" />
                        Your Answer
                      </p>
                      <div className="bg-white/5 rounded-lg px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                        {item.candidate_answer}
                      </div>
                    </div>

                    {/* Feedback */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Feedback
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {item.feedback}
                      </p>
                    </div>

                    {/* Better Answer */}
                    {item.better_answer && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-primary uppercase tracking-wide flex items-center gap-1.5">
                          <Lightbulb className="h-3 w-3" />
                          Suggested Better Answer
                        </p>
                        <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                          {item.better_answer}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}