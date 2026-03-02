

<div align="center">

# Interview AI

### AI-Powered Interview Simulator

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=for-the-badge&logo=langgraph&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com)
[![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A multi-agent interview simulator that analyzes your resume, conducts adaptive interviews, and delivers detailed coaching feedback.**

[Features](#features) • [Quick Start](#quick-start) • [API](#api-endpoints) • [Architecture](#architecture) • [Tech Stack](#tech-stack)

</div>

---

## Features

- Resume analysis against job description: skills extraction, gap identification, match assessment.
- Structured interview plan generated from candidate profile and role requirements.
- Adaptive questioning with automatic follow-ups when answers lack depth.
- Per-answer evaluation using STAR method (behavioral) and accuracy/depth framework (technical).
- Comprehensive coaching report: scores, per-question feedback, better answer examples, action items.
- Interview types: `behavioral`, `technical` at `junior`, `mid`, `senior` difficulty levels.
- Auto-fallback LLM: Groq (primary) → Gemini (fallback) with retry logic.
- Prompt injection guardrails and input sanitization on all user-provided content.

---

## Quick Start

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- API keys for [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/interview-ai.git
cd interview-ai
```

Create a `.env` file in the root directory:

```env
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
```

Install dependencies and run:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
# open http://localhost:8000/docs
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/interview/start` | Start a new interview session |
| `POST` | `/api/interview/answer` | Submit an answer to the current question |
| `GET` | `/api/interview/history` | List all sessions with pagination |
| `GET` | `/api/interview/session/{id}` | Check session status |
| `GET` | `/api/interview/{id}/report` | Get coaching report |
| `DELETE` | `/api/interview/session/{id}` | Delete a session |
| `GET` | `/health` | Health check |
| `DELETE` | `/system/cleanup` | Cleanup old sessions |

### Typical Flow

```bash
# 1) Start interview
curl -X POST localhost:8000/api/interview/start \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "Your resume content here...",
    "job_description": "The job description here...",
    "interview_type": "technical",
    "difficulty": "senior"
  }'
# → returns session_id + first question

# 2) Submit answer
curl -X POST localhost:8000/api/interview/answer \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your_session_id",
    "answer": "Your answer here..."
  }'
# → returns evaluation + next question
# → if follow-up needed: is_follow_up=true, answer the follow-up
# → after Q8: returns final coaching report

# 3) Check session status (optional)
curl localhost:8000/api/interview/session/your_session_id
```

### Response Statuses

| Status | Meaning |
|--------|---------|
| `interviewing` | Interview in progress, question ready |
| `awaiting_follow_up` | Follow-up question asked, waiting for answer |
| `completed` | All questions answered, final report available |
| `error` | Something went wrong |

### Coaching Report

After completing all 8 questions, the final response includes:

```json
{
  "final_report": {
    "overall_score": 8.5,
    "overall_grade": "Very Good",
    "summary": "...",
    "per_question_feedback": [
      {
        "question_number": 1,
        "score": 9,
        "feedback": "...",
        "better_answer": "..."
      }
    ],
    "top_strengths": ["...", "...", "..."],
    "areas_to_improve": ["...", "...", "..."],
    "action_items": ["...", "...", "..."],
    "ready_for_role": true,
    "ready_explanation": "..."
  }
}
```

---

## Architecture

Four specialized agents orchestrated through LangGraph:

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Resume    │───▶│  Interview   │───▶│  Generate   │
│  Analyzer   │    │   Planner    │    │  Question   │
└─────────────┘    └──────────────┘    └──────┬──────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │   User Answers     │
                                    │                    │
                                    │  ┌──────────────┐  │
                                    │  │  Follow-up   │  │
                                    │  │  Decision    │  │
                                    │  └──────────────┘  │
                                    └─────────┬─────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │    Evaluator      │
                                    └─────────┬─────────┘
                                              │
                               ┌──────────────┴──────────────┐
                               │                             │
                        More questions?              All done?
                               │                             │
                        ┌──────▼──────┐              ┌───────▼──────┐
                        │    Next     │              │    Coach     │
                        │  Question   │              │   Report     │
                        └─────────────┘              └──────────────┘
```

### Agent Responsibilities

| Agent | Role |
|-------|------|
| **Resume Analyzer** | Extracts skills, experience, gaps from resume against JD |
| **Interviewer** | Generates adaptive questions, decides follow-ups |
| **Evaluator** | Scores answers (1-10) using STAR or technical frameworks |
| **Coach** | Produces final report with feedback and improvement plan |

### LLM Fallback Strategy

```
Request → Groq (primary, fast)
            ├── Success → return
            ├── Rate limited → retry with backoff (2 attempts)
            └── Still failing → Gemini (fallback, reliable)
                                  ├── Success → return
                                  └── Failed → raise error
```

---

## Project Structure

```
interview-ai/
├── backend/
│   ├── app/
│   │   ├── agents/          # Resume analyzer, interviewer, evaluator, coach, graph orchestrator
│   │   ├── core/            # Config, LLM setup, prompt templates, shared utilities
│   │   ├── models/          # Pydantic schemas and LangGraph state definitions
│   │   ├── api/             # FastAPI route handlers
│   │   └── services/        # Business logic, session management, follow-up handling
│   ├── tests/
│   └── pyproject.toml
├── frontend/                # Coming soon (Next.js)
├── .env
└── README.md
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Framework | LangGraph |
| Primary LLM | Groq (GPT-OSS 120B) |
| Fallback LLM | Google Gemini 2.5 Flash |
| Backend | FastAPI, Pydantic, Uvicorn |
| Database | PostgreSQL (Neon) |
| Cache | Redis (Upstash) |
| ORM | SQLAlchemy (async) |
| Package Manager | uv |

---

## Configuration

### Environment Variables

```env
# Required
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=postgresql+asyncpg://user:password@host/dbname
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token

# Optional (defaults shown)
PRIMARY_MODEL=openai/gpt-oss-120b
FALLBACK_MODEL=gemini-2.5-flash
LLM_TEMPERATURE=0.7
MAX_QUESTIONS=8
MAX_FOLLOW_UPS=1
SESSION_TTL_SECONDS=7200
APP_ENV=development
```

---

## Known Limitations

- Groq has payload size limits; large coaching reports fall back to Gemini.
- No authentication on API endpoints (planned for Phase 3).
- Sessions expire from Redis cache after 2 hours of inactivity; data persists in database.
- Free tier database (Neon 512MB) supports approximately 10,000 sessions.

---

## License

MIT