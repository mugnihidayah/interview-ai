import logging
import time

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from pydantic import SecretStr

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_primary() -> BaseChatModel:
    """Primary LLM: Groq (GPT-OSS 120B)."""
    return ChatGroq(
        model=settings.PRIMARY_MODEL,
        api_key=SecretStr(settings.GROQ_API_KEY),
        temperature=settings.LLM_TEMPERATURE,
    )


def get_fallback() -> BaseChatModel:
    """Fallback LLM: Google Gemini."""
    return ChatGoogleGenerativeAI(
        model=settings.FALLBACK_MODEL,
        google_api_key=SecretStr(settings.GOOGLE_API_KEY),
        temperature=settings.LLM_TEMPERATURE,
    )


def invoke_llm(
    messages: list[BaseMessage],
    retry_count: int = 2,
    retry_delay: float = 3.0,
) -> BaseMessage:
    """
    Invoke LLM with automatic fallback and retry logic.

    Strategy:
    1. Try primary (Groq)
    2. If rate limited → wait and retry
    3. If still fails → fallback to Gemini
    4. If Gemini also fails → raise error
    """

    # Attempt 1: Try primary with retries
    for attempt in range(retry_count + 1):
        try:
            llm = get_primary()
            response = llm.invoke(messages)
            return response
        except Exception as e:
            error_msg = str(e).lower()
            is_rate_limit = any(
                keyword in error_msg
                for keyword in ["rate limit", "429", "quota", "resource exhausted"]
            )

            if is_rate_limit and attempt < retry_count:
                wait_time = retry_delay * (attempt + 1)
                logger.warning(
                    "Primary LLM rate limited (attempt %d/%d). Waiting %.1fs...",
                    attempt + 1,
                    retry_count + 1,
                    wait_time,
                )
                time.sleep(wait_time)
                continue
            else:
                logger.warning(
                    "Primary LLM failed (attempt %d/%d): %s. Falling back...",
                    attempt + 1,
                    retry_count + 1,
                    type(e).__name__,
                )
                break

    # Attempt 2: Fallback to Gemini
    try:
        llm = get_fallback()
        response = llm.invoke(messages)
        logger.info("Fallback LLM successful")
        return response
    except Exception as e:
        logger.error("Fallback LLM also failed: %s", type(e).__name__)
        raise RuntimeError(
            "Both primary and fallback LLMs failed"
        ) from e