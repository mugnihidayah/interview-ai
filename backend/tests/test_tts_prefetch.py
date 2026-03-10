import unittest

from app.services.tts_prefetch import (
    build_tts_cache_key,
    clear_cached_tts_audio,
    get_cached_tts_audio,
    store_cached_tts_audio,
)


class TTSPrefetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_store_and_get_cached_tts_audio(self):
        cache_key = build_tts_cache_key(
            session_id="session-1",
            question_number=2,
            text="Explain your API design approach.",
            language="en",
        )

        await store_cached_tts_audio(cache_key, b"audio-bytes", ttl_seconds=5)

        cached = await get_cached_tts_audio(cache_key)
        self.assertEqual(cached, b"audio-bytes")

        await clear_cached_tts_audio(cache_key)
        self.assertIsNone(await get_cached_tts_audio(cache_key))

    async def test_cache_key_changes_when_text_changes(self):
        first = build_tts_cache_key(
            session_id="session-1",
            question_number=2,
            text="Question A",
            language="en",
        )
        second = build_tts_cache_key(
            session_id="session-1",
            question_number=2,
            text="Question B",
            language="en",
        )

        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
