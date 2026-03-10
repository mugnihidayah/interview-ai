"""
Voice API routes: Text-to-Speech (edge-tts) and Speech-to-Text (Groq Whisper).
"""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limiter import RateLimiter
from app.models.tables import UserTable
from app.services import interview as interview_service
from app.services.database import verify_session_ownership
from app.services.stt_context import build_stt_context, looks_like_prompt_echo
from app.services.tts_prefetch import generate_tts_audio_bytes, get_cached_tts_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview/voice", tags=["Voice"])

# Rate limiters for voice endpoints
tts_limiter = RateLimiter(max_requests=30, window_seconds=300, key_prefix="tts")
stt_limiter = RateLimiter(max_requests=20, window_seconds=300, key_prefix="stt")

# Max audio file size: 10MB
MAX_AUDIO_SIZE = 10 * 1024 * 1024


class TTSRequest(BaseModel):
    """Request body for text-to-speech."""

    text: str = Field(..., min_length=1, max_length=5000)
    language: str = Field(default="en", pattern="^(en|id)$")


@router.post("/tts")
async def text_to_speech_endpoint(
    request: TTSRequest,
    current_user: UserTable = Depends(get_current_user),
):
    """
    Convert text to speech using edge-tts.

    Returns audio/mpeg stream.
    """
    tts_limiter.check(f"user:{current_user.id}")

    try:
        audio_bytes = await generate_tts_audio_bytes(request.text, request.language)

        async def audio_stream():
            yield audio_bytes

        return StreamingResponse(
            audio_stream(),
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-cache",
                "Content-Disposition": "inline",
            },
        )

    except Exception as exc:
        logger.error("TTS failed: %s", str(exc))
        raise HTTPException(
            status_code=500,
            detail="Text-to-speech generation failed.",
        )


@router.get("/tts/prefetch/{cache_key}")
async def get_prefetched_tts_endpoint(
    cache_key: str,
    current_user: UserTable = Depends(get_current_user),
):
    """
    Return prefetched TTS audio if it exists in the warm cache.
    """
    tts_limiter.check(f"user:{current_user.id}")

    audio_bytes = await get_cached_tts_audio(cache_key)
    if audio_bytes is None:
        raise HTTPException(status_code=404, detail="Prefetched audio not found")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache",
            "Content-Disposition": "inline",
        },
    )


@router.post("/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: str = Form(default="en"),
    session_id: str | None = Form(default=None),
    current_user: UserTable = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Transcribe audio to text using Groq Whisper.

    Accepts audio file (webm, mp4, wav, mp3).
    Returns transcription text.
    """
    stt_limiter.check(f"user:{current_user.id}")

    if language not in ("en", "id"):
        raise HTTPException(status_code=400, detail="Language must be 'en' or 'id'")

    session_row = None
    stt_context = None
    if session_id:
        try:
            session_row = await verify_session_ownership(db, session_id, current_user.id)
        except PermissionError:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this session",
            )
        except ValueError:
            raise HTTPException(status_code=404, detail="Session not found")

        current_question = None
        try:
            session_data = await interview_service.get_session_status(db, session_id)
            current_question = session_data["state"].current_question or None
        except Exception:
            logger.warning("Failed to load live session context for STT", exc_info=True)

        stt_context = build_stt_context(
            session_row,
            current_question=current_question,
        )

    allowed_types = [
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/x-m4a",
        "video/webm",
    ]

    content_type = file.content_type or ""
    if not any(ct in content_type for ct in allowed_types):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported audio format: {content_type}. "
                "Supported: webm, mp4, wav, mp3, ogg"
            ),
        )

    try:
        audio_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to read audio file")

    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file too large. Maximum size: {MAX_AUDIO_SIZE // (1024 * 1024)}MB",
        )

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    ext_map = {
        "audio/webm": "webm",
        "video/webm": "webm",
        "audio/mp4": "mp4",
        "audio/x-m4a": "m4a",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "audio/ogg": "ogg",
    }
    file_ext = "webm"
    for candidate_type, extension in ext_map.items():
        if candidate_type in content_type:
            file_ext = extension
            break

    whisper_lang = "en" if language == "en" else "id"
    if stt_context:
        whisper_lang = stt_context.whisper_language
    prompt = stt_context.prompt if stt_context else None

    try:

        def _transcribe():
            client = Groq(api_key=settings.GROQ_API_KEY)
            request_kwargs: dict[str, Any] = {
                "file": (f"recording.{file_ext}", audio_bytes),
                "model": settings.WHISPER_MODEL,
                "response_format": "text",
                "temperature": 0,
            }
            if whisper_lang:
                request_kwargs["language"] = whisper_lang
            if prompt:
                request_kwargs["prompt"] = prompt

            return client.audio.transcriptions.create(**request_kwargs)

        transcript = await asyncio.to_thread(_transcribe)

        text = transcript if isinstance(transcript, str) else str(transcript)
        text = text.strip()

        if not text:
            return {
                "text": "",
                "status": "empty",
                "message": "No speech detected in the audio.",
            }

        if looks_like_prompt_echo(text, prompt):
            logger.warning(
                "Rejected suspicious STT transcript that echoed the prompt (session: %s)",
                session_id[:8] if session_id else "none",
            )
            return {
                "text": "",
                "status": "empty",
                "message": "Transcription matched the prompt instead of speech.",
            }

        logger.info(
            "Transcribed %d bytes of audio -> %d chars (lang: %s, session: %s, glossary: %d)",
            len(audio_bytes),
            len(text),
            whisper_lang or "auto",
            session_id[:8] if session_id else "none",
            len(stt_context.glossary_terms) if stt_context else 0,
        )

        return {
            "text": text,
            "status": "success",
        }

    except Exception as exc:
        error_msg = str(exc).lower()
        logger.error("Whisper transcription failed: %s", str(exc))

        if "rate limit" in error_msg or "429" in error_msg:
            raise HTTPException(
                status_code=429,
                detail="Transcription rate limit reached. Please wait a moment.",
            )

        raise HTTPException(
            status_code=500,
            detail="Transcription failed. Please try again.",
        )
