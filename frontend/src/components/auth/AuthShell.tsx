"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, type LucideIcon } from "lucide-react";

interface AuthHighlight {
  text: string;
  icon: LucideIcon;
}

interface AuthShellProps {
  badgeText: string;
  headline: string;
  description: string;
  highlights: AuthHighlight[];
  formTitle: string;
  formDescription: string;
  footer: ReactNode;
  children: ReactNode;
}

export default function AuthShell({
  badgeText,
  headline,
  description,
  highlights,
  formTitle,
  formDescription,
  footer,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-screen px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <section className="glass rounded-2xl p-6 sm:p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {badgeText}
          </Link>

          <h1 className="mt-5 text-3xl sm:text-4xl">{headline}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>

          <div className="mt-7 space-y-3">
            {highlights.map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm text-muted-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">{formTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formDescription}</p>

          {children}

          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </section>
      </motion.div>
    </main>
  );
}
