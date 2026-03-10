"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileText,
  Brain,
  BarChart3,
  ArrowRight,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import ForceDark from "@/components/layout/ForceDark";

const features = [
  {
    icon: FileText,
    title: "Resume Analysis",
    description:
      "Upload your resume and job description. Our AI extracts key skills and experience to craft personalized interview questions.",
  },
  {
    icon: Brain,
    title: "Adaptive Questions",
    description:
      "8 dynamic questions that adapt based on your answers. Includes follow-ups that dig deeper into your responses.",
  },
  {
    icon: BarChart3,
    title: "Coaching Report",
    description:
      "Get a detailed breakdown of every answer with scores, feedback, and better answer suggestions from your AI coach.",
  },
];

const stats = [
  { value: "8", label: "Adaptive Questions" },
  { value: "2", label: "Interview Types" },
  { value: "3", label: "Difficulty Levels" },
  { value: "10", label: "Point Scoring" },
];

const steps = [
  {
    number: "01",
    icon: FileText,
    title: "Upload Resume",
    description: "Paste your resume or upload a PDF. Add the job description you're targeting.",
  },
  {
    number: "02",
    icon: Target,
    title: "Configure Interview",
    description: "Choose behavioral or technical, pick your difficulty level, and start the session.",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Answer Questions",
    description: "Respond to AI-generated questions in a chat interface. Get real-time evaluation after each answer.",
  },
  {
    number: "04",
    icon: TrendingUp,
    title: "Review Report",
    description: "Receive a comprehensive coaching report with scores, strengths, and actionable improvements.",
  },
];

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export default function HomePage() {
  const { user } = useAuthStore();
  const ctaHref = user ? "/dashboard" : "/auth/register";
  const ctaLabel = user ? "Start Interview" : "Get Started";

  return (
    <ForceDark>
      <main className="pt-16">
        {/* Hero */}
        <section className="relative min-h-[85vh] flex items-center justify-center px-4 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-400/12 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-400/10 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-amber-300/8 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="space-y-6"
            >
              <motion.div variants={fadeUp}>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-muted-foreground mb-4">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  AI-Powered Interview Practice
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight"
              >
                Nail Your Next
                <br />
                <span className="gradient-text">Interview</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
              >
                Practice with an AI interviewer that adapts to your resume, asks
                smart follow-ups, and delivers detailed coaching feedback to help
                you land the role.
              </motion.p>

              <motion.div
                variants={fadeUp}
                className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
              >
                <Link href={ctaHref}>
                  <Button size="lg" className="glow text-base px-8 w-full sm:w-auto">
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                {!user && (
                  <Link href="/auth/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-base px-8 w-full sm:w-auto"
                    >
                      Sign In
                    </Button>
                  </Link>
                )}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 px-4 border-t border-white/5">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                className="text-center"
              >
                <div className="text-3xl sm:text-4xl font-bold gradient-text">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Features */}
        <section className="py-20 px-4">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-14"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl font-bold"
              >
                Everything You Need to{" "}
                <span className="gradient-text">Prepare</span>
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="text-muted-foreground mt-3 max-w-xl mx-auto"
              >
                From resume parsing to detailed coaching, every step is designed to
                make you interview-ready.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid md:grid-cols-3 gap-6"
            >
              {features.map((feature) => (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="glass rounded-2xl p-6 hover:glow transition-shadow duration-300"
                >
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-4 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="text-center mb-14"
            >
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl font-bold"
              >
                How It <span className="gradient-text">Works</span>
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="text-muted-foreground mt-3 max-w-xl mx-auto"
              >
                Four simple steps from uploading your resume to getting actionable
                interview feedback.
              </motion.p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={stagger}
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {steps.map((step) => (
                <motion.div
                  key={step.number}
                  variants={fadeUp}
                  className="relative glass rounded-2xl p-6"
                >
                  <span className="text-4xl font-bold text-white/5 absolute top-4 right-5 select-none">
                    {step.number}
                  </span>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
              variants={fadeUp}
              className="glass rounded-3xl p-10 sm:p-14 glow-strong"
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Ready to <span className="gradient-text">Practice?</span>
              </h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                Set up your first mock interview in under a minute. No credit card
                required.
              </p>
              <Link href={ctaHref}>
                <Button size="lg" className="glow text-base px-10">
                  {ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-8 px-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <span className="font-semibold gradient-text">Interview AI</span>
            <span>&copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>
        </footer>
      </main>
    </ForceDark>
  );
}