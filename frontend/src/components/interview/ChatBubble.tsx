"use client";

import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  role: "ai" | "user";
  content: string;
  isFollowUp?: boolean;
}

export default function ChatBubble({
  role,
  content,
  isFollowUp,
}: ChatBubbleProps) {
  const isAI = role === "ai";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("flex gap-3 max-w-[85%]", !isAI && "ml-auto flex-row-reverse")}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
          isAI ? "bg-white/5" : "bg-primary/20"
        )}
      >
        {isAI ? (
          <Bot className="h-4 w-4 text-muted-foreground" />
        ) : (
          <User className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className="space-y-1.5 min-w-0">
        {isFollowUp && isAI && (
          <span className="inline-block text-xs font-medium text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-md">
            Follow-up Question
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word",
            isAI
              ? "glass rounded-tl-md"
              : "bg-primary/15 border border-primary/20 rounded-tr-md"
          )}
        >
          {content}
        </div>
      </div>
    </motion.div>
  );
}