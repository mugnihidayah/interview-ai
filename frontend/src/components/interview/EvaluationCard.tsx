"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Evaluation } from "@/lib/api";

interface EvaluationCardProps {
  evaluation: Evaluation;
}

function scoreColor(score: number) {
  if (score >= 8) return "text-green-400 bg-green-400/10 border-green-400/20";
  if (score >= 6) return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  if (score >= 4) return "text-orange-400 bg-orange-400/10 border-orange-400/20";
  return "text-red-400 bg-red-400/10 border-red-400/20";
}

export default function EvaluationCard({ evaluation }: EvaluationCardProps) {
  const { score, strengths, weaknesses } = evaluation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="glass rounded-xl p-4 max-w-[85%] mx-auto"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            "px-3 py-1 rounded-lg border text-sm font-bold",
            scoreColor(score)
          )}
        >
          {score}/10
        </div>
        <span className="text-xs text-muted-foreground">Answer Evaluation</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {strengths.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-green-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              Strengths
            </p>
            <ul className="space-y-1">
              {strengths.map((item, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground leading-relaxed pl-4 relative before:content-['·'] before:absolute before:left-1 before:text-green-400/60"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {weaknesses.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-orange-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Areas to Improve
            </p>
            <ul className="space-y-1">
              {weaknesses.map((item, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground leading-relaxed pl-4 relative before:content-['·'] before:absolute before:left-1 before:text-orange-400/60"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}