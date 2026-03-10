<div align="center">

# Interview AI

### AI-Powered Interview Simulator

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=for-the-badge&logo=langgraph&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com)
[![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A full-stack multi-agent interview simulator that analyzes your resume, conducts adaptive interviews with real-time streaming feedback, and delivers detailed coaching reports.**

[Features](#features) • [Quick Start](#quick-start) • [API](#api-endpoints) • [Architecture](#architecture) • [Tech Stack](#tech-stack)

</div>

---

## Features

### AI & Interview
- Resume analysis against job description: skills extraction, gap identification, match assessment.
- Structured interview plan generated from candidate profile and role requirements.
- Adaptive questioning with automatic follow-ups when answers lack depth.
- Per-answer evaluation using STAR method (behavioral) and accuracy/depth framework (technical).
- Comprehensive coaching report: scores, per-question feedback, better answer examples, action items.
- Interview types: `behavioral`, `technical` at `junior`, `mid`, `senior` difficulty levels.
- Bilingual support: English and Bahasa Indonesia.
- Auto-fallback LLM: Groq (primary) -> Gemini (fallback) with retry logic.

### Voice Mode
- Voice interview mode with browser microphone input and AI voice playback.
- Speech-to-text powered by Groq Whisper (`whisper-large-v3`).
- Session-aware STT prompting: Whisper receives live interview context, technical glossary hints, and prompt-echo protection.
- Browser audio is normalized to WAV when possible before upload to improve transcription stability.
- Text-to-speech powered by `edge-tts` with English and Bahasa Indonesia voices.
- TTS warm-cache prefetch for the first question, follow-up questions, and streamed next questions to reduce playback delay after text appears.

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) package manager (backend)
- API keys for [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com)
- PostgreSQL database ([Neon](https://neon.tech) free tier works)
- Redis instance ([Upstash](https://upstash.com) free tier works)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/interview-ai.git
cd interview-ai
```

#### Backend

Create `backend/.env`:

```env
# Required
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=postgresql+asyncpg://user:password@host/dbname
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
JWT_SECRET=your_jwt_secret_key

# Optional (defaults shown)
PRIMARY_MODEL=llama-3.3-70b-versatile
FALLBACK_MODEL=gemini-2.5-flash
LLM_TEMPERATURE=0.7
MAX_QUESTIONS=8
MAX_FOLLOW_UPS=1
SESSION_TTL_SECONDS=7200
ACCESS_TOKEN_EXPIRE_MINUTES=10080
TTS_VOICE_EN=en-US-AriaNeural
TTS_VOICE_ID=id-ID-GadisNeural
WHISPER_MODEL=whisper-large-v3
```

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

#### Frontend

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:3000
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create a new account |
| `POST` | `/auth/login` | Login and receive JWT |
| `POST` | `/auth/logout` | Clear auth cookie |
| `GET` | `/auth/me` | Get current user info |

### Interview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/interview/start` | Start a new interview session |
| `POST` | `/api/interview/answer` | Submit an answer (standard) |
| `POST` | `/api/interview/answer/stream` | Submit an answer (SSE streaming) |
| `GET` | `/api/interview/history` | List sessions with pagination |
| `GET` | `/api/interview/session/{id}` | Get session status |
| `GET` | `/api/interview/{id}/report` | Get coaching report |
| `DELETE` | `/api/interview/session/{id}` | Delete a session |

### Voice

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/interview/voice/tts` | Generate on-demand TTS audio |
| `GET` | `/api/interview/voice/tts/prefetch/{cache_key}` | Fetch prefetched TTS audio from warm cache |
| `POST` | `/api/interview/voice/transcribe` | Transcribe recorded audio with Whisper |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check with service status |
| `DELETE` | `/system/cleanup` | Cleanup old sessions (auth required) |

### Typical Flow

```bash
# 1) Register / Login
curl -X POST localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword",
    "full_name": "John Doe"
  }'
# → returns access_token + sets httpOnly cookie

# 2) Start interview
curl -X POST localhost:8000/api/interview/start \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=your_token" \
  -d '{
    "resume_text": "Your resume content here...",
    "job_description": "The job description here...",
    "interview_type": "technical",
    "difficulty": "senior",
    "language": "en"
  }'
# → returns session_id + first question

# 3) Submit answer (standard)
curl -X POST localhost:8000/api/interview/answer \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=your_token" \
  -d '{
    "session_id": "your_session_id",
    "answer": "Your answer here..."
  }'
# → returns evaluation + next question (or follow-up, or final report)

# 4) Submit answer (streaming — real-time phase updates)
curl -X POST localhost:8000/api/interview/answer/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=your_token" \
  -d '{
    "session_id": "your_session_id",
    "answer": "Your answer here...",
    "prefetch_tts": true
  }' --no-buffer
# → streams SSE events:
#   data: {"phase": "processing", "message": "Processing your answer..."}
#   data: {"phase": "evaluating", "message": "Evaluating your answer..."}
#   data: {"phase": "evaluated", "evaluation": {"score": 8, ...}}
#   data: {"phase": "generating_question", "message": "Preparing next question..."}
#   data: {"phase": "result", "data": {...}}
#   data: [DONE]
```

For voice-first playback on initial load, the frontend can request:

```bash
GET /api/interview/session/{id}?prefetch_tts=true
```

### Response Statuses

| Status | Meaning |
|--------|---------|
| `interviewing` | Interview in progress, question ready |
| `awaiting_follow_up` | Follow-up question asked, waiting for answer |
| `completed` | All questions answered, final report available |
| `error` | Something went wrong |

### Rate Limits

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| Auth (login/register/logout) | 10 requests | 60 seconds | IP address |
| Start interview | 5 requests | 5 minutes | User ID |
| Submit answer | 30 requests | 5 minutes | User ID |
| Read endpoints | 60 requests | 60 seconds | User ID |

---

## Architecture

### System Overview

```
┌────────────────┐       ┌────────────────┐       ┌──────────────┐
│                │       │                │       │              │
│   Next.js 16   │──────▶│   FastAPI      │──────▶│  PostgreSQL  │
│   Frontend     │  API  │   Backend      │  ORM  │  (Neon)      │
│                │       │                │       │              │
└────────────────┘       └───────┬────────┘       └──────────────┘
                                 │
                          ┌──────┴──────┐
                          │             │
                    ┌─────▼─────┐ ┌─────▼─────┐
                    │  Upstash  │ │ LangGraph  │
                    │  Redis    │ │  Agents    │
                    │  (cache)  │ │            │
                    └───────────┘ └─────┬──────┘
                                        │
                                 ┌──────┴──────┐
                                 │             │
                           ┌─────▼─────┐ ┌────▼──────┐
                           │   Groq    │ │  Gemini   │
                           │ (primary) │ │ (fallback)│
                           └───────────┘ └───────────┘
```

### Agent Pipeline

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

### Voice Pipeline

```
Browser microphone
    -> MediaRecorder
    -> optional client-side WAV normalization
    -> POST /api/interview/voice/transcribe
    -> Groq Whisper + session-aware glossary/prompt
    -> transcript inserted into interview composer

AI question generated
    -> backend prefetches edge-tts audio
    -> SSE / session response includes tts_cache_key
    -> frontend fetches /api/interview/voice/tts/prefetch/{cache_key}
    -> text and audio start much closer together
```

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/auth/login` | Login page |
| `/auth/register` | Registration page |
| `/dashboard` | User dashboard with stats & recent sessions |
| `/interview/start` | 3-step interview setup wizard |
| `/interview/[id]` | Live interview chat interface (SSE) |
| `/interview/[id]/report` | Coaching report with PDF export |
| `/history` | Session history with search & filters |

---

## Project Structure

```
interview-ai/
├── backend/
│   ├── app/
│   │   ├── agents/            # AI agents: resume analyzer, interviewer, evaluator, coach
│   │   │   ├── graph.py       # LangGraph orchestration (setup + process-answer graphs)
│   │   │   ├── resume_analyzer.py
│   │   │   ├── interviewer.py
│   │   │   ├── evaluator.py
│   │   │   └── coach.py
│   │   ├── api/               # FastAPI route handlers
│   │   │   ├── routes.py      # Interview endpoints (REST + SSE streaming)
│   │   │   ├── voice_routes.py # Voice endpoints (TTS + STT)
│   │   │   └── auth_routes.py # Authentication endpoints
│   │   ├── core/              # Config, LLM setup, prompts, auth, rate limiting
│   │   │   ├── config.py
│   │   │   ├── llm.py         # Groq/Gemini with fallback logic
│   │   │   ├── auth.py        # JWT authentication
│   │   │   ├── rate_limiter.py # Redis-based rate limiting
│   │   │   ├── redis.py       # Upstash Redis client
│   │   │   ├── prompts.py     # Agent prompt templates
│   │   │   └── utils.py       # Sanitization, JSON extraction
│   │   ├── models/            # Pydantic schemas + SQLAlchemy table definitions
│   │   │   ├── schemas.py
│   │   │   └── tables.py
│   │   ├── services/          # Business logic
│   │   │   ├── interview.py   # Session management, answer processing, SSE streaming
│   │   │   ├── database.py    # CRUD operations, ownership verification
│   │   │   ├── stt_context.py # Session-aware Whisper prompt/glossary helpers
│   │   │   ├── tts_prefetch.py # Warm-cache TTS generation for low-latency playback
│   │   │   └── users.py       # User management
│   │   └── main.py            # FastAPI app, CORS, health check, lifespan
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   │   ├── page.tsx       # Landing page
│   │   │   ├── layout.tsx     # Root layout with AuthProvider
│   │   │   ├── dashboard/     # Dashboard page
│   │   │   ├── auth/          # Login & Register pages
│   │   │   ├── interview/
│   │   │   │   ├── start/     # 3-step setup wizard
│   │   │   │   └── [id]/      # Live interview + report pages
│   │   │   └── history/       # Session history page
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/            # shadcn/Radix primitives
│   │   │   ├── layout/        # Navbar, AuthProvider
│   │   │   ├── auth/          # AuthShell, AuthErrorBanner
│   │   │   ├── interview/     # ChatBubble, EvaluationCard, ProgressBar
│   │   │   └── report/        # ScoreGauge, QuestionAccordion
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useSSEAnswer.ts    # SSE streaming for answer submission
│   │   │   ├── useAutoSave.ts     # Draft auto-save to localStorage
│   │   │   ├── useTextToSpeech.ts # AI voice playback
│   │   │   └── useVoiceRecorder.ts # Microphone recording + STT upload
│   │   ├── lib/               # Utilities
│   │   │   ├── api.ts         # Axios client + API functions
│   │   │   ├── audio.ts       # Audio format detection + WAV conversion helpers
│   │   │   ├── exportReportPDF.ts # jsPDF report export
│   │   │   └── utils.ts       # cn() helper
│   │   └── store/
│   │       └── authStore.ts   # Zustand auth state
│   ├── proxy.ts               # Next.js route protection middleware
│   ├── package.json
│   └── tailwind.config.ts
├── .env
└── README.md
```

---

## Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Runtime | Python 3.12+ |
| Framework | FastAPI |
| Agent Framework | LangGraph + LangChain |
| Primary LLM | Groq |
| Fallback LLM | Google Gemini |
| Database | PostgreSQL (Neon) |
| Cache | Redis (Upstash) |
| ORM | SQLAlchemy Async + asyncpg |
| Auth | JWT (httpOnly cookie) |
| STT | Groq Whisper |
| TTS | edge-tts |
| Package Manager | uv |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| UI Library | React 19 |
| Styling | Tailwind CSS v4 |
| State Management | Zustand |
| HTTP Client | Axios + native fetch (SSE) |
| Animations | Framer Motion |
| UI Primitives | Radix UI / shadcn |
| PDF Parsing | pdfjs-dist |
| PDF Export | jsPDF |

---

## Security

### Authentication
- JWT tokens stored in httpOnly cookies (not accessible via JavaScript).
- Fallback Authorization header for environments where cookies don't work.
- Auth state verified server-side via `/auth/me` on every page load.

### Authorization
- All interview endpoints verify session ownership (`session.user_id == current_user.id`).
- Sessions without an owner (legacy) are inaccessible to all users.
- Delete operations include defense-in-depth ownership re-verification.

### Rate Limiting
- Redis-based fixed-window counters.
- Auth endpoints limited by IP address.
- Interview endpoints limited by authenticated user ID.
- Fail-open design: if Redis is unavailable, requests are allowed (no user blocking).

### Input Sanitization
- All user-provided content (resume, answers) sanitized before inclusion in LLM prompts.
- Prompt injection guardrails embedded in all agent system prompts.

---

## Configuration

### Backend Environment Variables

```env
# Required
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=postgresql+asyncpg://user:password@host/dbname
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
JWT_SECRET=your_jwt_secret_key

# Optional (defaults shown)
PRIMARY_MODEL=openai/gpt-oss-120b
FALLBACK_MODEL=gemini-2.5-flash
LLM_TEMPERATURE=0.7
MAX_QUESTIONS=8
MAX_FOLLOW_UPS=1
SESSION_TTL_SECONDS=7200
ACCESS_TOKEN_EXPIRE_MINUTES=10080
TTS_VOICE_EN=en-US-AriaNeural
TTS_VOICE_ID=id-ID-GadisNeural
WHISPER_MODEL=whisper-large-v3
```

### Frontend Environment Variables

```env
# Required (if backend is not on localhost:8000)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Known Limitations

- Groq has payload size limits; large coaching reports automatically fall back to Gemini.
- Sessions expire from Redis cache after 2 hours of inactivity; data persists in PostgreSQL.
- Free tier database (Neon 512MB) supports approximately 10,000 sessions.
- Voice mode depends on browser microphone support, `MediaRecorder`, and autoplay permissions.
- Web Speech / browser speech recognition preview can differ from the final Whisper transcript.
- TTS prefetch cache is currently in-memory per backend process; multi-worker or multi-instance deployments need a shared cache layer.
- No formal database migration tool (Alembic) set up yet — schema changes require manual migration.
- Test coverage is minimal; no integration or E2E test suites yet.

---

## License

MIT
