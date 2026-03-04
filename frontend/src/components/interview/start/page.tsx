"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Code,
  Crown,
  FileCheck2,
  GraduationCap,
  Languages,
  Loader2,
  RotateCcw,
  Sparkles,
  Users,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import ResumeUpload from "@/components/interview/ResumeUpload";
import { interviewAPI, getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type InterviewType = "behavioral" | "technical";
type Difficulty = "junior" | "mid" | "senior";
type Language = "en" | "id";
type SetupStep = 1 | 2 | 3;

interface SetupDraft {
  resumeText: string;
  jobDescription: string;
  interviewType: InterviewType;
  difficulty: Difficulty;
  language: Language;
  currentStep: SetupStep;
}

interface OptionItem<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const DRAFT_KEY = "interview_setup_draft_v2";
const AUTOSAVE_DELAY_MS = 350;

const interviewTypes: OptionItem<InterviewType>[] = [
  {
    value: "behavioral",
    label: "Behavioral",
    icon: Users,
    description:
      "Leadership, teamwork, conflict resolution, and situational questions.",
  },
  {
    value: "technical",
    label: "Technical",
    icon: Code,
    description:
      "System design, problem solving, architecture, and technical depth.",
  },
];

const difficulties: OptionItem<Difficulty>[] = [
  {
    value: "junior",
    label: "Junior",
    icon: GraduationCap,
    description: "0-2 years experience.",
  },
  {
    value: "mid",
    label: "Mid-Level",
    icon: Briefcase,
    description: "3-5 years experience.",
  },
  {
    value: "senior",
    label: "Senior",
    icon: Crown,
    description: "6+ years experience.",
  },
];

const languages: OptionItem<Language>[] = [
  {
    value: "en",
    label: "English",
    icon: Languages,
    description: "Questions and feedback in English.",
  },
  {
    value: "id",
    label: "Bahasa Indonesia",
    icon: Languages,
    description: "Pertanyaan dan feedback dalam Bahasa Indonesia.",
  },
];

const steps: Array<{ id: SetupStep; title: string; detail: string }> = [
  { id: 1, title: "Documents", detail: "Resume and role target" },
  { id: 2, title: "Configuration", detail: "Interview preferences" },
  { id: 3, title: "Review", detail: "Final check before start" },
];

const validInterviewTypes = new Set<InterviewType>(["behavioral", "technical"]);
const validDifficulties = new Set<Difficulty>(["junior", "mid", "senior"]);
const validLanguages = new Set<Language>(["en", "id"]);

function parseStep(value: unknown): SetupStep {
  return value === 2 || value === 3 ? value : 1;
}

function interviewTypeLabel(value: InterviewType): string {
  return interviewTypes.find((item) => item.value === value)?.label ?? value;
}

function difficultyLabel(value: Difficulty): string {
  return difficulties.find((item) => item.value === value)?.label ?? value;
}

function languageLabel(value: Language): string {
  return languages.find((item) => item.value === value)?.label ?? value;
}

function summarizeTextLength(text: string): string {
  const length = text.trim().length;
  if (length === 0) return "Empty";
  if (length < 200) return "Short";
  if (length < 1200) return "Good";
  return "Detailed";
}

export default function InterviewStartPage() {
  const router = useRouter();

  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("behavioral");
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [language, setLanguage] = useState<Language>("en");
  const [currentStep, setCurrentStep] = useState<SetupStep>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const resumeLength = resumeText.trim().length;
  const jobDescriptionLength = jobDescription.trim().length;

  const canContinueFromStep1 = useMemo(() => {
    return resumeLength >= 50 && jobDescriptionLength >= 20;
  }, [resumeLength, jobDescriptionLength]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawDraft = window.localStorage.getItem(DRAFT_KEY);
      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const parsed = JSON.parse(rawDraft) as Partial<SetupDraft>;

      if (typeof parsed.resumeText === "string") setResumeText(parsed.resumeText);
      if (typeof parsed.jobDescription === "string") {
        setJobDescription(parsed.jobDescription);
      }
      if (validInterviewTypes.has(parsed.interviewType as InterviewType)) {
        setInterviewType(parsed.interviewType as InterviewType);
      }
      if (validDifficulties.has(parsed.difficulty as Difficulty)) {
        setDifficulty(parsed.difficulty as Difficulty);
      }
      if (validLanguages.has(parsed.language as Language)) {
        setLanguage(parsed.language as Language);
      }

      setCurrentStep(parseStep(parsed.currentStep));
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady || typeof window === "undefined") return;

    const timeout = window.setTimeout(() => {
      const draft: SetupDraft = {
        resumeText,
        jobDescription,
        interviewType,
        difficulty,
        language,
        currentStep,
      };

      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [
    currentStep,
    difficulty,
    draftReady,
    interviewType,
    jobDescription,
    language,
    resumeText,
  ]);

  function validateStepOne(): string | null {
    if (resumeLength < 50) {
      return "Resume must be at least 50 characters.";
    }
    if (jobDescriptionLength < 20) {
      return "Job description must be at least 20 characters.";
    }
    return null;
  }

  function goToStep(step: SetupStep) {
    if (loading) return;
    if (step > currentStep) return;
    setError(null);
    setCurrentStep(step);
  }

  function handleNextStep() {
    if (currentStep === 1) {
      const stepError = validateStepOne();
      if (stepError) {
        setError(stepError);
        return;
      }
    }

    setError(null);
    setCurrentStep((prev) => (prev < 3 ? ((prev + 1) as SetupStep) : prev));
  }

  function handlePreviousStep() {
    setError(null);
    setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as SetupStep) : prev));
  }

  function handleResetDraft() {
    setResumeText("");
    setJobDescription("");
    setInterviewType("behavioral");
    setDifficulty("mid");
    setLanguage("en");
    setCurrentStep(1);
    setError(null);
    setDraftSavedAt(null);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }

  async function startInterview() {
    const stepError = validateStepOne();
    if (stepError) {
      setError(stepError);
      setCurrentStep(1);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await interviewAPI.start({
        resume_text: resumeText.trim(),
        job_description: jobDescription.trim(),
        interview_type: interviewType,
        difficulty,
        language,
      });

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_KEY);
      }

      router.push(`/interview/${response.session_id}`);
    } catch (err) {
      setLoading(false);
      setError(getErrorMessage(err));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (currentStep < 3) {
      handleNextStep();
      return;
    }

    await startInterview();
  }

  return (
    <main className="pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-7"
        >
          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <WandSparkles className="h-3.5 w-3.5 text-primary" />
              Personalized setup in 3 steps
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl">Set Up Your Interview</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Build a tailored interview from your resume and target role.
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {draftSavedAt ? `Draft saved at ${draftSavedAt}` : "Draft autosave is on"}
              </div>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
            {steps.map((step) => {
              const active = currentStep === step.id;
              const completed = currentStep > step.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    active
                      ? "border-primary/45 bg-primary/15"
                      : "border-white/10 bg-white/5",
                    completed && "border-emerald-300/35 bg-emerald-300/10"
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                        active
                          ? "border-primary/60 bg-primary/25 text-primary"
                          : "border-white/20 text-muted-foreground",
                        completed && "border-emerald-300/45 bg-emerald-300/20 text-emerald-200"
                      )}
                    >
                      {completed ? <Check className="h-4 w-4" /> : step.id}
                    </span>
                    <p className="text-sm font-semibold">{step.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </button>
              );
            })}
          </section>

          <form onSubmit={handleSubmit} className="glass rounded-2xl p-5 sm:p-7 space-y-7">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {currentStep === 1 && (
              <div className="space-y-7">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Resume</Label>
                    <span className="text-xs text-muted-foreground">Minimum 50 chars</span>
                  </div>
                  <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="w-full">
                      <TabsTrigger value="upload" className="flex-1">
                        Upload PDF
                      </TabsTrigger>
                      <TabsTrigger value="paste" className="flex-1">
                        Paste Text
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="mt-4">
                      <ResumeUpload value={resumeText} onChange={setResumeText} />
                    </TabsContent>
                    <TabsContent value="paste" className="mt-4">
                      <div className="space-y-1.5">
                        <Textarea
                          placeholder="Paste your resume content here..."
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                          rows={8}
                          className="resize-y"
                          disabled={loading}
                        />
                        <p className="text-right text-xs text-muted-foreground">
                          {resumeText.length.toLocaleString()} characters
                          {resumeLength > 0 && resumeLength < 50 && (
                            <span className="text-destructive"> - minimum 50</span>
                          )}
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="job_description" className="text-base font-semibold">
                      Job Description
                    </Label>
                    <span className="text-xs text-muted-foreground">Minimum 20 chars</span>
                  </div>
                  <Textarea
                    id="job_description"
                    placeholder="Paste the job description you are targeting..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={6}
                    className="resize-y"
                    disabled={loading}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {jobDescription.length.toLocaleString()} characters
                    {jobDescriptionLength > 0 && jobDescriptionLength < 20 && (
                      <span className="text-destructive"> - minimum 20</span>
                    )}
                  </p>
                </section>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-7">
                <SelectionSection
                  title="Interview Type"
                  options={interviewTypes}
                  value={interviewType}
                  disabled={loading}
                  onChange={setInterviewType}
                  columns="sm:grid-cols-2"
                />

                <SelectionSection
                  title="Difficulty"
                  options={difficulties}
                  value={difficulty}
                  disabled={loading}
                  onChange={setDifficulty}
                  columns="sm:grid-cols-3"
                />

                <SelectionSection
                  title="Language"
                  options={languages}
                  value={language}
                  disabled={loading}
                  onChange={setLanguage}
                  columns="sm:grid-cols-2"
                />
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-5">
                <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-medium text-primary">
                    <FileCheck2 className="h-4 w-4" />
                    Ready to generate your interview
                  </div>
                  <p className="text-muted-foreground">
                    Review your setup below. You can still go back and edit before starting.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SummaryCard
                    label="Resume"
                    value={`${resumeText.length.toLocaleString()} chars`}
                    detail={`${summarizeTextLength(resumeText)} depth`}
                  />
                  <SummaryCard
                    label="Job Description"
                    value={`${jobDescription.length.toLocaleString()} chars`}
                    detail={`${summarizeTextLength(jobDescription)} depth`}
                  />
                  <SummaryCard
                    label="Interview Type"
                    value={interviewTypeLabel(interviewType)}
                    detail="Question style"
                  />
                  <SummaryCard
                    label="Difficulty"
                    value={difficultyLabel(difficulty)}
                    detail="Question complexity"
                  />
                  <SummaryCard
                    label="Language"
                    value={languageLabel(language)}
                    detail="Question and feedback output"
                  />
                  <SummaryCard
                    label="Estimated Time"
                    value="15-25 minutes"
                    detail="Based on 8 adaptive questions"
                  />
                </div>
              </div>
            )}

            <footer className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="justify-start text-muted-foreground hover:text-foreground"
                onClick={handleResetDraft}
                disabled={loading}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Draft
              </Button>

              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={loading || currentStep === 1}
                  className="flex-1 sm:flex-none"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                {currentStep < 3 ? (
                  <Button
                    type="submit"
                    className="glow flex-1 sm:flex-none"
                    disabled={loading || (currentStep === 1 && !canContinueFromStep1)}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" className="glow flex-1 sm:flex-none" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        Start Interview
                        <Sparkles className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </footer>
          </form>
        </motion.div>
      </div>
    </main>
  );
}

interface SelectionSectionProps<T extends string> {
  title: string;
  value: T;
  options: OptionItem<T>[];
  disabled: boolean;
  columns: string;
  onChange: (value: T) => void;
}

function SelectionSection<T extends string>({
  title,
  value,
  options,
  disabled,
  columns,
  onChange,
}: SelectionSectionProps<T>) {
  return (
    <section className="space-y-3">
      <Label className="text-base font-semibold">{title}</Label>
      <div className={cn("grid grid-cols-1 gap-3", columns)}>
        {options.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200",
                "border-white/10 bg-white/5 hover:bg-white/10",
                active && "border-primary/50 bg-primary/10"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                  )}
                >
                  <option.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
