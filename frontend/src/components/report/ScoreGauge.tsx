"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
  score: number;
  grade: string;
}

function gradeColor(score: number) {
  if (score >= 9) return "text-emerald-400";
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  if (score >= 3) return "text-orange-400";
  return "text-red-400";
}

function strokeColor(score: number) {
  if (score >= 9) return "#34d399";
  if (score >= 7) return "#4ade80";
  if (score >= 5) return "#facc15";
  if (score >= 3) return "#fb923c";
  return "#f87171";
}

export default function ScoreGauge({ score, grade }: ScoreGaugeProps) {
  const radius = 80;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const offset = circumference - progress;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-48 h-48">
        <svg
          width="192"
          height="192"
          viewBox="0 0 192 192"
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-white/5"
          />
          {/* Progress circle */}
          <motion.circle
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            stroke={strokeColor(score)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className={cn("text-5xl font-bold", gradeColor(score))}
          >
            {score.toFixed(1)}
          </motion.span>
          <span className="text-xs text-muted-foreground mt-1">out of 10</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className={cn(
          "px-4 py-1.5 rounded-full border text-sm font-medium",
          score >= 7
            ? "bg-green-400/10 border-green-400/20 text-green-400"
            : score >= 5
              ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
              : "bg-red-400/10 border-red-400/20 text-red-400"
        )}
      >
        {grade}
      </motion.div>
    </div>
  );
}
