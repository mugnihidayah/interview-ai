import logging

from langchain_core.messages import HumanMessage

from app.core.llm import invoke_llm
from app.core.utils import sanitize_for_prompt, extract_json
from app.core.prompts import COACH_PROMPT, SECURITY_GUARDRAIL
from app.models.schemas import FinalReport, InterviewState, QAPair

logger = logging.getLogger(__name__)


def _format_candidate_profile(state: InterviewState) -> str:
    """Format candidate profile as string for prompt."""
    if not state.candidate_profile:
        return "No profile available."

    profile = state.candidate_profile
    return (
        f"Name: {profile.candidate_name}\n"
        f"Skills: {', '.join(profile.skills)}\n"
        f"Experience: {profile.experience_years}\n"
        f"Strengths: {', '.join(profile.strengths)}\n"
        f"Gaps: {', '.join(profile.gaps)}\n"
        f"Education: {profile.education}\n"
        f"Match: {profile.overall_match.value}"
    )


def _format_transcript(qa_pairs: list[QAPair]) -> str:
    """Format full interview transcript with evaluations for Coach."""
    if not qa_pairs:
        return "No interview data available."

    transcript = []
    for qa in qa_pairs:
        entry = f"--- Question {qa.question_number} ---\n"
        entry += f"Q: {qa.question}\n"
        entry += f"A: {sanitize_for_prompt(qa.answer)}\n"

        if qa.follow_up_question:
            entry += f"Follow-up Q: {qa.follow_up_question}\n"
            follow_up_a = qa.follow_up_answer or "No answer"
            entry += f"Follow-up A: {sanitize_for_prompt(follow_up_a)}\n"

        if qa.evaluation:
            entry += f"Score: {qa.evaluation.score}/10\n"
            entry += f"Strengths: {', '.join(qa.evaluation.strengths)}\n"
            entry += f"Weaknesses: {', '.join(qa.evaluation.weaknesses)}\n"
        else:
            entry += "Score: Not evaluated\n"

        transcript.append(entry)

    return "\n\n".join(transcript)


def generate_coaching_report(state: InterviewState) -> InterviewState:
    """
    Coach Agent.

    Analyzes the full interview transcript and evaluations,
    then generates a comprehensive feedback report.
    """
    logger.info("Generating coaching report...")

    state.status = "coaching"

    try:
        # Validate we have data to work with
        if not state.qa_pairs:
            state.status = "error"
            state.error_message = "No interview data available for coaching"
            return state

        # Build prompt
        prompt = COACH_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            candidate_profile=_format_candidate_profile(state),
            full_transcript=_format_transcript(state.qa_pairs),
        )

        # Call LLM
        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        # Parse and validate
        raw_json = extract_json(content)
        final_report = FinalReport(**raw_json)

        # Validate overall_score is reasonable
        scores = [
            qa.evaluation.score
            for qa in state.qa_pairs
            if qa.evaluation
        ]
        if scores:
            actual_avg = round(sum(scores) / len(scores), 1)
            # Allow small deviation, but correct if too far off
            if abs(final_report.overall_score - actual_avg) > 1.0:
                logger.warning(
                    "Coach score %.1f deviates from actual avg %.1f. Correcting.",
                    final_report.overall_score,
                    actual_avg,
                )
                final_report.overall_score = actual_avg

        # Update state
        state.final_report = final_report
        state.status = "completed"

        logger.info(
            "Coaching report generated. Overall: %.1f/10 (%s)",
            final_report.overall_score,
            final_report.overall_grade.value,
        )

        return state

    except ValueError as e:
        logger.error("Failed to parse coaching report: %s", str(e))
        _assign_default_report(state)
        return state

    except Exception as e:
        logger.error("Coaching error: %s", str(e))
        _assign_default_report(state)
        return state


def _assign_default_report(state: InterviewState) -> None:
    """Assign a default report when Coach Agent fails."""
    scores = [
        qa.evaluation.score
        for qa in state.qa_pairs
        if qa.evaluation
    ]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 5.0

    from app.models.schemas import OverallGrade

    # Determine grade from average score
    if avg_score >= 9.0:
        grade = OverallGrade.EXCELLENT
    elif avg_score >= 7.0:
        grade = OverallGrade.VERY_GOOD
    elif avg_score >= 5.0:
        grade = OverallGrade.GOOD
    elif avg_score >= 3.0:
        grade = OverallGrade.BELOW_AVERAGE
    else:
        grade = OverallGrade.POOR

    state.final_report = FinalReport(
        overall_score=avg_score,
        overall_grade=grade,
        summary="Coaching report could not be fully generated. Scores are based on individual evaluations.",
        per_question_feedback=[],
        top_strengths=["Review individual question evaluations for details"],
        areas_to_improve=["Review individual question evaluations for details"],
        action_items=["Review each question and answer manually for improvement areas"],
        ready_for_role=avg_score >= 6.0,
        ready_explanation="Assessment based on average score from individual evaluations.",
    )

    state.status = "completed"

    logger.warning("Default coaching report assigned. Average score: %.1f", avg_score)