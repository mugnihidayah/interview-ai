import json
import logging
import re

logger = logging.getLogger(__name__)


def normalize_unicode(text: str) -> str:
    """Normalize unicode characters that commonly break JSON parsing."""
    replacements = {
        "\u2011": "-",  # non-breaking hyphen
        "\u2010": "-",  # hyphen
        "\u2012": "-",  # figure dash
        "\u2013": "-",  # en dash
        "\u2014": "-",  # em dash
        "\u201c": '"',  # left double quote
        "\u201d": '"',  # right double quote
        "\u2018": "'",  # left single quote
        "\u2019": "'",  # right single quote
        "\u00a0": " ",  # non-breaking space
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def sanitize_for_prompt(text: str) -> str:
    """
    Sanitize user-provided text before injecting into prompt.
    Prevents prompt injection by escaping potential instruction patterns.
    """
    suspicious_patterns = [
        r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)",
        r"disregard\s+(all\s+)?(previous|above|prior)",
        r"you\s+are\s+now\s+a",
        r"new\s+instructions?\s*:",
        r"system\s*prompt\s*:",
        r"forget\s+(everything|all)",
    ]

    sanitized = text
    for pattern in suspicious_patterns:
        sanitized = re.sub(pattern, "[FILTERED]", sanitized, flags=re.IGNORECASE)

    return sanitized


def extract_json(text: str) -> dict:
    """
    Extract JSON from LLM response.
    Handles unicode, markdown code blocks, and extra text.
    """
    # Normalize unicode first
    text = normalize_unicode(text)

    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block
    json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } block
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from LLM response: {text[:200]}")