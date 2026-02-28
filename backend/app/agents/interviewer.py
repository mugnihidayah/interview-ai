import logging

from langchain_core.messages import HumanMessage

from app.core.config import settings
from app.core.llm import invoke_llm
from app.core.utils import sanitize_for_prompt, extract_json
from app.core.prompts import (
    FOLLOW_UP_DECISION_PROMPT,
    FOLLOW_UP_QUESTION_PROMPT,
    INTERVIEW_PLANNER_PROMPT,
    INTERVIEWER_QUESTION_PROMPT,
    SECURITY_GUARDRAIL,
)
from app.models.schemas import (
    FollowUpDecision,
    InterviewPlan,
    InterviewState,
    QAPair,
)

logger = logging.getLogger(__name__)


def _format_qa_history(qa_pairs: list[QAPair]) -> str:
    """Format Q&A history for injecting into prompt."""
    if not qa_pairs:
        return "No previous questions yet."

    history = []
    for qa in qa_pairs:
        entry = f"Q{qa.question_number}: {qa.question}\nA: {qa.answer}"
        if qa.follow_up_question:
            entry += f"\nFollow-up Q: {qa.follow_up_question}"
            entry += f"\nFollow-up A: {qa.follow_up_answer or 'No answer'}"
        history.append(entry)

    return "\n\n".join(history)


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


def plan_interview(state: InterviewState) -> InterviewState:
    """
    Generate interview plan based on candidate profile.
    Create a list of topics to cover during the interview.
    """
    logger.info("Planning interview...")

    state.status = "planning"

    try:
        prompt = INTERVIEW_PLANNER_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            candidate_profile=_format_candidate_profile(state),
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            max_questions=settings.MAX_QUESTIONS,
        )

        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        raw_json = extract_json(content)
        interview_plan = InterviewPlan(**raw_json)

        # Ensure we have exactly MAX_QUESTIONS topics
        if len(interview_plan.topics) > settings.MAX_QUESTIONS:
            interview_plan.topics = interview_plan.topics[:settings.MAX_QUESTIONS]

        state.interview_plan = interview_plan
        state.status = "interviewing"

        logger.info("Interview planned with %d topics.", len(interview_plan.topics))
        return state

    except ValueError as e:
        logger.error("Failed to parse interview plan: %s", str(e))
        state.status = "error"
        state.error_message = "Interview planning failed: Could not parse response"
        return state

    except Exception as e:
        logger.error("Interview planning error: %s", str(e))
        state.status = "error"
        state.error_message = f"Interview planning failed: {type(e).__name__}"
        return state


def generate_question(state: InterviewState) -> InterviewState:
    """
    Generate the next interview question based on the current topic.
    """
    logger.info(
        "Generating question %d of %d...",
        state.current_question_index + 1,
        settings.MAX_QUESTIONS,
    )

    try:
        # get current topic from plan
        if not state.interview_plan or not state.interview_plan.topics:
            state.status = "error"
            state.error_message = "No interview plan available"
            return state

        topic_index = min(
            state.current_question_index,
            len(state.interview_plan.topics) - 1,
        )
        current_topic = state.interview_plan.topics[topic_index]

        prompt = INTERVIEWER_QUESTION_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            candidate_profile=_format_candidate_profile(state),
            current_topic=f"Area: {current_topic.area}\nFocus: {current_topic.focus}\nWhy: {current_topic.why}",
            qa_history=_format_qa_history(state.qa_pairs),
        )

        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        question = content.strip().strip('"').strip("'")

        state.current_question = question
        state.is_follow_up = False
        state.follow_up_count = 0

        logger.info("Generated question: %s", question[:80])

        return state

    except Exception as e:
        logger.error("Question generation error: %s", str(e))
        state.status = "error"
        state.error_message = f"Question generation failed: {type(e).__name__}"
        return state


def decide_follow_up(state: InterviewState, answer: str) -> InterviewState:
    """
    Decide whether a follow-up question is needed based on the answer.
    """
    logger.info("Evaluating if follow-up is needed...")

    try:
        # Skip follow-up if already at max
        if state.follow_up_count >= settings.MAX_FOLLOW_UPS:
            logger.info("Max follow-ups reached, skipping.")
            state.is_follow_up = False
            return state

        safe_answer = sanitize_for_prompt(answer)

        prompt = FOLLOW_UP_DECISION_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            question=state.current_question,
            answer=safe_answer,
        )

        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        raw_json = extract_json(content)
        decision = FollowUpDecision(**raw_json)

        state.is_follow_up = decision.needs_follow_up

        logger.info(
            "Follow-up decision: %s (reason: %s)",
            decision.needs_follow_up,
            decision.reason[:50],
        )

        return state

    except Exception as e:
        logger.error("Follow-up decision error: %s", str(e))
        # On error, skip follow-up (safe default)
        state.is_follow_up = False
        return state


def generate_follow_up(state: InterviewState, answer: str) -> InterviewState:
    """
    Generate a follow-up question based on the candidate's answer.
    """
    logger.info("Generating follow-up question...")

    try:
        safe_answer = sanitize_for_prompt(answer)

        prompt = FOLLOW_UP_QUESTION_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            question=state.current_question,
            answer=safe_answer,
            reason="The answer needs more depth or specificity.",
        )

        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        follow_up = content.strip().strip('"').strip("'")

        state.current_question = follow_up
        state.is_follow_up = True
        state.follow_up_count += 1

        logger.info("Follow-up generated: %s", follow_up[:80])

        return state

    except Exception as e:
        logger.error("Follow-up generation error: %s", str(e))
        # On error, skip follow-up
        state.is_follow_up = False
        return state


def record_answer(
    state: InterviewState,
    answer: str,
    follow_up_question: str | None = None,
    follow_up_answer: str | None = None,
) -> InterviewState:
    """
    Record a Q&A pair into the state.
    """
    safe_answer = sanitize_for_prompt(answer)
    safe_follow_up_answer = None
    if follow_up_answer:
        safe_follow_up_answer = sanitize_for_prompt(follow_up_answer)

    qa_pair = QAPair(
        question_number=state.current_question_index + 1,
        question=state.current_question
        if not follow_up_question
        else state.qa_pairs[-1].question
        if state.qa_pairs
        else state.current_question,
        answer=safe_answer,
        follow_up_question=follow_up_question,
        follow_up_answer=safe_follow_up_answer,
    )

    state.qa_pairs.append(qa_pair)

    logger.info("Recorded Q&A pair #%d", qa_pair.question_number)

    return state


def has_more_questions(state: InterviewState) -> bool:
    """Check if there are more questions to ask."""
    return state.current_question_index < settings.MAX_QUESTIONS


def advance_question(state: InterviewState) -> InterviewState:
    """Move to the next question."""
    state.current_question_index += 1
    state.is_follow_up = False
    state.follow_up_count = 0
    return state
