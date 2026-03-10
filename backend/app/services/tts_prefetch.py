"""
Helpers for pre-generating TTS audio so playback can start immediately after
an SSE question payload reaches the client.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import hashlib
import time

import edge_tts

from app.core.config import settings

TTS_CACHE_TTL_SECONDS = 600


@dataclass(slots=True)
class CachedTTSAudio:
    audio_bytes: bytes
    expires_at: float


_tts_cache: dict[str, CachedTTSAudio] = {}
_tts_cache_lock = asyncio.Lock()


def build_tts_cache_key(
    *,
    session_id: str,
    question_number: int,
    text: str,
    language: str,
    is_follow_up: bool = False,
) -> str:
    text_digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
    kind = "fu" if is_follow_up else "q"
    return f"{session_id}:{question_number}:{kind}:{language}:{text_digest}"


async def prefetch_tts_audio(
    *,
    session_id: str,
    question_number: int,
    text: str,
    language: str,
    is_follow_up: bool = False,
) -> str | None:
    if not text.strip():
        return None

    cache_key = build_tts_cache_key(
        session_id=session_id,
        question_number=question_number,
        text=text,
        language=language,
        is_follow_up=is_follow_up,
    )

    cached = await get_cached_tts_audio(cache_key)
    if cached is not None:
        return cache_key

    audio_bytes = await generate_tts_audio_bytes(text, language)
    await store_cached_tts_audio(cache_key, audio_bytes)
    return cache_key


async def generate_tts_audio_bytes(text: str, language: str) -> bytes:
    voice = settings.TTS_VOICE_EN if language == "en" else settings.TTS_VOICE_ID
    communicate = edge_tts.Communicate(text, voice)

    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio" and "data" in chunk:
            chunks.append(chunk["data"])

    return b"".join(chunks)


async def store_cached_tts_audio(
    cache_key: str,
    audio_bytes: bytes,
    *,
    ttl_seconds: int = TTS_CACHE_TTL_SECONDS,
) -> None:
    expires_at = time.time() + ttl_seconds
    async with _tts_cache_lock:
        _prune_expired_locked()
        _tts_cache[cache_key] = CachedTTSAudio(
            audio_bytes=audio_bytes,
            expires_at=expires_at,
        )


async def get_cached_tts_audio(cache_key: str) -> bytes | None:
    async with _tts_cache_lock:
        _prune_expired_locked()
        cached = _tts_cache.get(cache_key)
        if not cached:
            return None
        return cached.audio_bytes


async def clear_cached_tts_audio(cache_key: str) -> None:
    async with _tts_cache_lock:
        _tts_cache.pop(cache_key, None)


def _prune_expired_locked() -> None:
    now = time.time()
    expired_keys = [
        cache_key
        for cache_key, value in _tts_cache.items()
        if value.expires_at <= now
    ]
    for cache_key in expired_keys:
        _tts_cache.pop(cache_key, None)
