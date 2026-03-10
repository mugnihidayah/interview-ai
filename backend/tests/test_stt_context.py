import unittest

from app.models.tables import InterviewSessionTable
from app.services.stt_context import build_stt_context, looks_like_prompt_echo


class STTContextTests(unittest.TestCase):
    def test_indonesian_technical_session_uses_auto_for_mixed_language(self):
        session = InterviewSessionTable(
            id="session-1",
            user_id="user-1",
            resume_text="Built backend services with FastAPI, Redis, PostgreSQL, and Docker.",
            job_description="Looking for engineers with React, Next.js, CI/CD, and system design experience.",
            interview_type="technical",
            difficulty="mid",
            language="id",
            candidate_profile={
                "candidate_name": "Ayu",
                "skills": ["FastAPI", "Redis", "Next.js", "CI/CD"],
                "relevant_experience": ["Designed REST API for analytics platform"],
            },
            interview_plan={
                "topics": [
                    {"area": "System Design", "focus": "Caching with Redis", "why": ""},
                ]
            },
            status="interviewing",
            error_message=None,
        )

        context = build_stt_context(
            session,
            current_question="Bagaimana Anda mendesain caching layer di Next.js dan Redis?",
        )

        self.assertIsNone(context.whisper_language)
        self.assertIn("FastAPI", context.glossary_terms)
        self.assertIn("Next.js", context.glossary_terms)
        self.assertIn("Redis", context.glossary_terms)
        self.assertIsNotNone(context.prompt)
        self.assertIn("Keep exact spellings", context.prompt or "")
        self.assertNotIn("Current interview question", context.prompt or "")

    def test_behavioral_indonesian_session_stays_on_id(self):
        session = InterviewSessionTable(
            id="session-2",
            user_id="user-1",
            resume_text="Led a cross-functional team and improved onboarding process.",
            job_description="Behavioral interview focused on teamwork and leadership.",
            interview_type="behavioral",
            difficulty="mid",
            language="id",
            candidate_profile={
                "candidate_name": "Budi",
                "skills": ["Communication", "Leadership"],
            },
            interview_plan=None,
            status="interviewing",
            error_message=None,
        )

        context = build_stt_context(
            session,
            current_question="Ceritakan konflik terbesar yang pernah Anda hadapi di tim.",
        )

        self.assertEqual(context.whisper_language, "id")
        self.assertNotIn("Leadership", context.glossary_terms)

    def test_detects_prompt_echo_transcript(self):
        prompt = "Indonesian interview answer. Keep exact spellings: FastAPI, Redis."

        self.assertTrue(
            looks_like_prompt_echo(
                "Keep exact spellings FastAPI Redis",
                prompt,
            )
        )
        self.assertFalse(looks_like_prompt_echo("ngga tau", prompt))


if __name__ == "__main__":
    unittest.main()
