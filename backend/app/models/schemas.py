from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field, field_validator
import re


# ENUMS
class InterviewType(str, Enum):
    """Supported interview types."""

    BEHAVIORAL = "behavioral"
    TECHNICAL = "technical"


class Difficulty(str, Enum):
    """Supported difficulty levels."""

    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"


class OverallMatch(str, Enum):
    """Resume job description match levels."""

    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"


class OverallGrade(str, Enum):
    """Final interview grade."""

    EXCELLENT = "Excellent"
    VERY_GOOD = "Very Good"
    GOOD = "Good"
    BELOW_AVERAGE = "Below Average"
    POOR = "Poor"


class Language(str, Enum):
    """Supported interview languages."""
    ENGLISH = "en"
    INDONESIAN = "id"


# INPUT SCHEMAS
class InterviewConfig(BaseModel):
    """User input to start an interview session."""

    resume_text: str = Field(
        ...,
        min_length=50,
        max_length=50000,
        description="Resume content as plain text",
    )
    job_description: str = Field(
        ...,
        min_length=20,
        max_length=20000,
        description="Job description as plain text",
    )
    interview_type: InterviewType = Field(
        ...,
        description="Type of interview: behavioral or technical",
    )
    difficulty: Difficulty = Field(
        ...,
        description="Difficulty level of the interview: junior, mid, senior",
    )
    language: Language = Field(
        default=Language.ENGLISH,
        description="Interview language: en or id",
    )

    @field_validator("resume_text", "job_description")
    @classmethod
    def sanitize_text(cls, value: str) -> str:
        """Basic sanitization to remove excessive whitespace"""
        value = value.strip()
        value = re.sub(r"\n{3,}", "\n\n", value)
        value = re.sub(r" {2,}", " ", value)
        return value


class UserAnswer(BaseModel):
    """User's answer to an interview question."""

    answer: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Candidate's answer to the interview question",
    )

    @field_validator("answer")
    @classmethod
    def sanitize_answer(cls, value: str) -> str:
        """Sanitize user answer"""
        value = value.strip()
        value = re.sub(r"\n{3,}", "\n\n", value)
        value = re.sub(r" {2,}", " ", value)
        return value


# RESUME ANALYZER OUTPUT
class CandidateProfile(BaseModel):
    """Output from resume analyzer agent."""

    candidate_name: str = "Unknown"
    skills: list[str] = Field(default_factory=list)
    experience_years: str = ""
    relevant_experience: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    education: str = ""
    overall_match: OverallMatch = OverallMatch.MODERATE


# INTERVIEW PLANNER OUTPUT
class InterviewTopic(BaseModel):
    """Single topic in the interview plan."""

    area: str
    focus: str
    why: str


class InterviewPlan(BaseModel):
    """Output from interview planner."""

    topics: list[InterviewTopic] = Field(default_factory=list)


# FOLLOW-UP DECISION OUTPUT
class FollowUpDecision(BaseModel):
    """Output from follow-up question logic."""

    needs_follow_up: bool = False
    reason: str = ""


# EVALUATOR OUTPUT
class QuestionEvaluation(BaseModel):
    """Output from evaluator agent for a single question."""

    score: int = Field(..., ge=1, le=10, description="Score from 1 to 10")
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    notes: str = ""

    @field_validator("score")
    @classmethod
    def clamp_score(cls, value: int) -> int:
        """Ensure score stays within valid range."""
        return max(1, min(10, value))


# Q&A PAIR (tracks each question-answer exchange)
class QAPair(BaseModel):
    """Single question-answer exchange with evaluation."""

    question_number: int
    question: str
    answer: str
    follow_up_question: Optional[str] = None
    follow_up_answer: Optional[str] = None
    evaluation: Optional[QuestionEvaluation] = None


# COACH OUTPUT
class PerQuestionFeedback(BaseModel):
    """Feedback for a single question in the final report."""

    question_number: int
    question: str
    candidate_answer: str
    score: int = Field(..., ge=1, le=10)
    feedback: str
    better_answer: str


class FinalReport(BaseModel):
    """Output from Coach Agent."""

    overall_score: float = Field(..., ge=1.0, le=10.0)
    overall_grade: OverallGrade
    summary: str
    per_question_feedback: list[PerQuestionFeedback] = Field(default_factory=list)
    top_strengths: list[str] = Field(default_factory=list)
    areas_to_improve: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)
    ready_for_role: bool = False
    ready_explanation: str = ""


# LANGGRAPH STATE
class InterviewState(BaseModel):
    """
    Main state object that flows through the LangGraph.
    This tracks everything about an interview session.
    """

    # --- Input (set once at start) ---
    resume_text: str = ""
    job_description: str = ""
    interview_type: InterviewType = InterviewType.BEHAVIORAL
    difficulty: Difficulty = Difficulty.JUNIOR
    language: Language = Language.ENGLISH

    # --- Resume Analysis ---
    candidate_profile: Optional[CandidateProfile] = None

    # --- Interview Plan ---
    interview_plan: Optional[InterviewPlan] = None

    # --- Interview Progress ---
    current_question_index: int = 0
    current_question: str = ""
    is_follow_up: bool = False
    follow_up_count: int = 0

    # --- Q&A History ---
    qa_pairs: list[QAPair] = Field(default_factory=list)

    # --- Final Report ---
    final_report: Optional[FinalReport] = None

    # --- Flow Control ---
    status: str = "initialized"  # initialized | analyzing | planning | interviewing | evaluating | coaching | completed | error
    error_message: Optional[str] = None