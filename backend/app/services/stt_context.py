"""
Session-aware helpers for Whisper transcription.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from app.models.tables import InterviewSessionTable

MAX_GLOSSARY_TERMS = 24
MAX_PROMPT_CHARS = 320
MIXED_LANGUAGE_AUTO_THRESHOLD = 3

KNOWN_TECH_PHRASES = {
    "api design": "API design",
    "behavioral interview": "behavioral interview",
    "ci/cd": "CI/CD",
    "clean architecture": "clean architecture",
    "clean code": "clean code",
    "code review": "code review",
    "data structure": "data structure",
    "deep learning": "deep learning",
    "design pattern": "design pattern",
    "distributed system": "distributed system",
    "distributed systems": "distributed systems",
    "fast api": "FastAPI",
    "machine learning": "machine learning",
    "microservice architecture": "microservice architecture",
    "microservices architecture": "microservices architecture",
    "next js": "Next.js",
    "node js": "Node.js",
    "object oriented": "object oriented",
    "postgre sql": "PostgreSQL",
    "problem solving": "problem solving",
    "prompt engineering": "prompt engineering",
    "pull request": "pull request",
    "rest api": "REST API",
    "system design": "system design",
    "technical interview": "technical interview",
    "time complexity": "time complexity",
    "unit test": "unit test",
}

KNOWN_TECH_WORDS = {
    "agile",
    "ai",
    "algorithm",
    "algorithms",
    "api",
    "apis",
    "architecture",
    "auth",
    "authorization",
    "aws",
    "azure",
    "backend",
    "cache",
    "cloud",
    "css",
    "database",
    "debugging",
    "deployment",
    "devops",
    "docker",
    "endpoint",
    "express",
    "fastapi",
    "figma",
    "firebase",
    "frontend",
    "gcp",
    "git",
    "github",
    "gitlab",
    "golang",
    "graphql",
    "html",
    "http",
    "https",
    "javascript",
    "jwt",
    "kubernetes",
    "langchain",
    "linux",
    "llm",
    "mongodb",
    "mysql",
    "nextjs",
    "nginx",
    "nlp",
    "nodejs",
    "nosql",
    "npm",
    "oauth",
    "orm",
    "postgres",
    "postgresql",
    "prompt",
    "python",
    "pytorch",
    "query",
    "react",
    "redis",
    "rest",
    "scalability",
    "schema",
    "sdk",
    "seo",
    "serverless",
    "sql",
    "sse",
    "streaming",
    "tailwind",
    "typescript",
    "ui",
    "ux",
    "vite",
    "webhook",
    "websocket",
    "whisper",
    "yaml",
}

TOKEN_PATTERN = re.compile(
    r"(?:C\+\+|C#|\.NET|[A-Za-z][A-Za-z0-9]*(?:[.+#/_-][A-Za-z0-9#+/_-]+)+|[A-Z]{2,}(?:/[A-Z]{2,})*)"
)
WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+#.-]*")
CAMEL_CASE_PATTERN = re.compile(r"[a-z]+(?:[A-Z][A-Za-z0-9]*)+")


@dataclass(frozen=True, slots=True)
class STTContext:
    glossary_terms: list[str]
    prompt: str | None
    whisper_language: str | None


PROMPT_ECHO_MARKERS = (
    "transcribe the interview answer accurately",
    "preferred spellings",
    "current interview question",
    "keep exact spellings",
    "indonesian interview answer",
    "english interview answer",
)


def build_stt_context(
    session_row: InterviewSessionTable,
    *,
    current_question: str | None = None,
) -> STTContext:
    glossary_terms = extract_glossary_terms(
        session_row,
        current_question=current_question,
    )
    whisper_language = select_whisper_language(
        session_language=session_row.language,
        interview_type=session_row.interview_type,
        glossary_terms=glossary_terms,
        current_question=current_question,
    )
    prompt = build_transcription_prompt(
        session_language=session_row.language,
        candidate_name=_extract_candidate_name(session_row),
        current_question=current_question,
        glossary_terms=glossary_terms,
        whisper_language=whisper_language,
    )
    return STTContext(
        glossary_terms=glossary_terms,
        prompt=prompt,
        whisper_language=whisper_language,
    )


def extract_glossary_terms(
    session_row: InterviewSessionTable,
    *,
    current_question: str | None = None,
) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()

    candidate_profile = session_row.candidate_profile or {}
    interview_plan = session_row.interview_plan or {}

    direct_terms: list[str] = []
    direct_terms.extend(_coerce_string_list(candidate_profile.get("skills")))
    direct_terms.extend(_coerce_string_list(candidate_profile.get("relevant_experience")))
    direct_terms.extend(_coerce_string_list(candidate_profile.get("strengths")))

    for topic in interview_plan.get("topics", []) or []:
        if isinstance(topic, dict):
            for key in ("area", "focus"):
                value = topic.get(key)
                if isinstance(value, str):
                    direct_terms.append(value)

    for term in direct_terms:
        normalized = _normalize_term(term)
        if normalized and _looks_glossary_term(normalized):
            _append_term(terms, seen, normalized)

    text_sources = [
        current_question or "",
        session_row.resume_text,
        session_row.job_description,
    ]
    for text in text_sources:
        if not text:
            continue
        for phrase in _extract_known_phrases(text):
            _append_term(terms, seen, phrase)
        for token in TOKEN_PATTERN.findall(text):
            if _looks_glossary_term(token):
                _append_term(terms, seen, token)
        for token in WORD_PATTERN.findall(text):
            if _looks_glossary_term(token):
                _append_term(terms, seen, token)

    return terms[:MAX_GLOSSARY_TERMS]


def select_whisper_language(
    *,
    session_language: str,
    interview_type: str | None,
    glossary_terms: list[str],
    current_question: str | None,
) -> str | None:
    if session_language != "id":
        return "en"

    mixed_signal = 0
    if interview_type == "technical":
        mixed_signal += 2

    tech_term_count = sum(1 for term in glossary_terms if _looks_glossary_term(term))
    if tech_term_count >= 6:
        mixed_signal += 2
    elif tech_term_count >= 3:
        mixed_signal += 1

    question_signal = _count_technical_signals(current_question or "")
    if question_signal >= 3:
        mixed_signal += 2
    elif question_signal >= 1:
        mixed_signal += 1

    return None if mixed_signal >= MIXED_LANGUAGE_AUTO_THRESHOLD else "id"


def build_transcription_prompt(
    *,
    session_language: str,
    candidate_name: str | None,
    current_question: str | None,
    glossary_terms: list[str],
    whisper_language: str | None,
) -> str | None:
    prompt_parts: list[str] = []

    if session_language == "id":
        if whisper_language is None:
            prompt_parts.append("Indonesian interview answer with English technical terms.")
        else:
            prompt_parts.append("Indonesian interview answer.")
    else:
        prompt_parts.append("English interview answer.")

    if glossary_terms:
        prompt_parts.append("Keep exact spellings: " + ", ".join(glossary_terms) + ".")

    prompt = " ".join(prompt_parts).strip()
    return _truncate(prompt, MAX_PROMPT_CHARS) or None


def looks_like_prompt_echo(transcript: str, prompt: str | None) -> bool:
    normalized_transcript = _normalize_space(transcript).lower()
    if len(normalized_transcript) < 16:
        return False

    if any(marker in normalized_transcript for marker in PROMPT_ECHO_MARKERS):
        return True

    if not prompt:
        return False

    normalized_prompt = _normalize_space(prompt).lower()
    if normalized_transcript == normalized_prompt:
        return True

    if normalized_transcript in normalized_prompt and len(normalized_transcript) >= 24:
        return True

    transcript_tokens = set(normalized_transcript.split())
    prompt_tokens = set(normalized_prompt.split())
    if len(transcript_tokens) < 4:
        return False

    overlap = len(transcript_tokens & prompt_tokens) / len(transcript_tokens)
    return overlap >= 0.75


def _extract_candidate_name(session_row: InterviewSessionTable) -> str | None:
    candidate_profile = session_row.candidate_profile or {}
    candidate_name = candidate_profile.get("candidate_name")
    return candidate_name if isinstance(candidate_name, str) else None


def _extract_known_phrases(text: str) -> list[str]:
    normalized_text = f" {_normalize_space(text).lower()} "
    phrases: list[str] = []
    for raw_phrase, display_phrase in KNOWN_TECH_PHRASES.items():
        if f" {raw_phrase} " in normalized_text:
            phrases.append(display_phrase)
    return phrases


def _count_technical_signals(text: str) -> int:
    count = len(_extract_known_phrases(text))
    for token in TOKEN_PATTERN.findall(text):
        if _looks_glossary_term(token):
            count += 1
    return count


def _looks_glossary_term(term: str) -> bool:
    normalized = _normalize_term(term)
    if not normalized:
        return False

    lower = normalized.lower()
    compact = lower.replace(".", "").replace("-", "").replace("/", "").replace(" ", "")

    if lower in KNOWN_TECH_WORDS or compact in KNOWN_TECH_WORDS:
        return True

    if lower in KNOWN_TECH_PHRASES or lower.replace(".", " ") in KNOWN_TECH_PHRASES:
        return True

    if normalized in {"C#", "C++", ".NET"}:
        return True

    if CAMEL_CASE_PATTERN.fullmatch(normalized):
        return True

    if any(symbol in normalized for symbol in (".", "/", "#", "+", "-")) and re.search(
        r"[A-Za-z]",
        normalized,
    ):
        return True

    return normalized.isupper() and 2 <= len(normalized) <= 10


def _append_term(terms: list[str], seen: set[str], value: str) -> None:
    normalized = _normalize_term(value)
    if not normalized:
        return
    key = normalized.lower()
    if key in seen:
        return
    seen.add(key)
    terms.append(normalized)


def _coerce_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _normalize_term(term: str) -> str:
    term = _normalize_space(term).strip(".,:;!?()[]{}\"'")
    if len(term) < 2 or len(term) > 60:
        return ""
    return term


def _normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _truncate(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."
