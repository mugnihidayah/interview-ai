import logging

from langchain_core.messages import HumanMessage

from app.core.llm import invoke_llm
from app.core.utils import sanitize_for_prompt, extract_json
from app.core.prompts import RESUME_ANALYZER_PROMPT, SECURITY_GUARDRAIL
from app.models.schemas import CandidateProfile, InterviewState

logger = logging.getLogger(__name__)


def analyze_resume(state: InterviewState) -> InterviewState:
    """
    Resume Analyzer Agent.

    Takes resume and job description from state.
    Analyzes them and returns update state with candidate profile.
    """
    logger.info("Starting resume analysis...")

    # update status
    state.status = "analyzing"

    try:
        # sanitize user inputs before injecting into prompt
        safe_resume = sanitize_for_prompt(state.resume_text)
        safe_jd = sanitize_for_prompt(state.job_description)

        # build prompt
        prompt = RESUME_ANALYZER_PROMPT.format(
            security_guardrail=SECURITY_GUARDRAIL,
            resume_text=safe_resume,
            job_description=safe_jd,
        )

        # call LLM
        response = invoke_llm([HumanMessage(content=prompt)])

        # extract and parse JSON response
        content = response.content
        if not isinstance(content, str):
            content = str(content)

        raw_json = extract_json(content)

        # validate candidate profile
        candidate_profile = CandidateProfile(**raw_json)

        # sanitize candidate name
        candidate_profile.candidate_name = candidate_profile.candidate_name.strip()
        if len(candidate_profile.candidate_name) > 100:
            candidate_profile.candidate_name = candidate_profile.candidate_name[:100]

        # update state
        state.candidate_profile = candidate_profile

        logger.info(
            "Resume analysis completed. Match: %s",
            candidate_profile.overall_match.value,
        )

        return state

    except ValueError as e:
        logger.error("Failed to parse LLM response: %s", str(e))
        state.status = "error"
        state.error_message = "Resume analysis failed: Could not parse response"
        return state

    except Exception as e:
        logger.error("Resume analysis error: %s", str(e))
        state.status = "error"
        state.error_message = f"Resume analysis failed: {type(e).__name__}"
        return state
