import logging

from langchain_core.messages import HumanMessage

from app.core.llm import invoke_llm
from app.core.utils import sanitize_for_prompt, extract_json
from app.core.prompts import EVALUATOR_PROMPT, SECURITY_GUARDRAIL, LANGUAGE_INSTRUCTION, LANGUAGE_NAMES
from app.models.schemas import InterviewState, QuestionEvaluation

logger = logging.getLogger(__name__)


def evaluate_answer(state: InterviewState) -> InterviewState:
    """
    Evaluator Agent.

    Evaluates the most recent Q&A pair in the state.
    Updates the evaluation field of the last QAPair.
    """
    logger.info("Evaluating answer...")

    state.status = "evaluating"

    try:
        # Get the latest Q&A pair
        if not state.qa_pairs:
            logger.error("No Q&A pairs to evaluate")
            state.status = "error"
            state.error_message = "No Q&A pairs available for evaluation"
            return state

        latest_qa = state.qa_pairs[-1]

        # Sanitize user answers
        safe_answer = sanitize_for_prompt(latest_qa.answer)
        safe_follow_up_answer = ""
        if latest_qa.follow_up_answer:
            safe_follow_up_answer = sanitize_for_prompt(latest_qa.follow_up_answer)

        # Build prompt
        prompt = EVALUATOR_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            language_instruction=LANGUAGE_INSTRUCTION.format(
                language_name=LANGUAGE_NAMES.get(state.language.value, "English")
            ),
            interview_type=state.interview_type.value,
            difficulty=state.difficulty.value,
            question=latest_qa.question,
            answer=safe_answer,
            follow_up_question=latest_qa.follow_up_question or "N/A",
            follow_up_answer=safe_follow_up_answer or "N/A",
        )

        # Call LLM
        response = invoke_llm([HumanMessage(content=prompt)])

        content = response.content
        if not isinstance(content, str):
            content = str(content)

        # Parse and validate
        raw_json = extract_json(content)
        evaluation = QuestionEvaluation(**raw_json)

        # Update the latest Q&A pair with evaluation
        latest_qa.evaluation = evaluation

        logger.info(
            "Answer evaluated. Score: %d/10 | Strengths: %d | Weaknesses: %d",
            evaluation.score,
            len(evaluation.strengths),
            len(evaluation.weaknesses),
        )

        return state

    except ValueError as e:
        logger.error("Failed to parse evaluation: %s", str(e))
        # Assign a default evaluation on parse failure
        _assign_default_evaluation(state)
        return state

    except Exception as e:
        logger.error("Evaluation error: %s", str(e))
        _assign_default_evaluation(state)
        return state


def _assign_default_evaluation(state: InterviewState) -> None:
    """
    Assign a safe default evaluation when LLM evaluation fails.
    Better to have a default score than crash the entire interview.
    """
    if not state.qa_pairs:
        return

    latest_qa = state.qa_pairs[-1]

    latest_qa.evaluation = QuestionEvaluation(
        score=5,
        strengths=["Evaluation could not be completed automatically"],
        weaknesses=["Please review this answer manually"],
        notes="Default evaluation assigned due to processing error",
    )

    logger.warning(
        "Default evaluation assigned for Q%d",
        latest_qa.question_number,
    )