# Querex — AI Research Workspace

A production-grade RAG (Retrieval-Augmented Generation) application that lets users upload PDF documents and chat with them using GPT-4. Built to demonstrate full-stack AI engineering: multi-tenant data isolation, streaming inference, secure OAuth, and resilient background processing.

**Live:** [querex.vercel.app](https://ai-research-copilot-kappa.vercel.app) · API: [render backend](https://ai-research-copilot-xtmd.onrender.com/docs)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                    │
│  App Router · React 19 · Zustand · TanStack Query       │
│  SSE streaming chat · JWT + OAuth · Theme system        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS  /api/v1/*
┌──────────────────────▼──────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Auth layer │  │  RAG pipeline│  │  Document svc │  │
│  │  JWT+bcrypt │  │  Embed→Store │  │  Async ingest │  │
│  │  OTP+OAuth  │  │  Retrieve    │  │  BG tasks     │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                           │                             │
│  ┌────────────────────────▼────────────────────────┐   │
│  │  OpenAI API  (embeddings + GPT-4.1-mini chat)   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────┐          ┌──────────────────────────┐ │
│  │  PostgreSQL  │          │  ChromaDB (cosine space) │ │
│  │  Users/docs/ │          │  Per-user vector chunks  │ │
│  │  sessions    │          └──────────────────────────┘ │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Key Engineering Decisions

### Multi-Tenant Data Isolation (Defence-in-Depth)
Every data access path enforces user ownership independently:
- **Vector store:** every chunk carries `user_email` metadata; retrieval always filters by it
- **Documents:** service layer verifies ownership before any mutation — cannot be bypassed by callers
- **Sessions:** `get_by_id_and_user(session_id, user_id)` — ownership in the query, not a post-fetch check
- **Chat:** document ownership re-verified in the route before the SSE stream opens

This means that even if a route bug skips an auth check, the service layer still enforces isolation.

### RAG Pipeline — Similarity Threshold
Retrieval returns only chunks whose cosine distance to the query is below a configurable threshold (`RAG_SIMILARITY_THRESHOLD`, default 1.0). When a document contains no relevant content, the LLM receives an empty context block and tells the user the document doesn't contain the answer — rather than confabulating an answer from unrelated text.

### OAuth Security — One-Time Code Exchange
OAuth callbacks do **not** embed tokens in the redirect URL (which would expose them in browser history, server logs, and `Referer` headers). Instead:
1. Callback handler stores tokens server-side under a 120-second single-use code
2. Redirects the frontend with only: `?code=<opaque-32-byte-code>`
3. Frontend exchanges the code for tokens via `POST /api/v1/auth/oauth/exchange`

### Async PDF Ingestion
Uploads return `202 Accepted` immediately. A `BackgroundTask` runs PDF parsing and OpenAI embedding after the response is sent, using its own database session decoupled from the request lifecycle. The document list polls every 3 seconds while any document is `processing`, stopping automatically when all reach a terminal state.

### Auth Resilience
`get_current_user_email` auto-provisions the user row when a valid JWT is presented but the row doesn't exist (Render ephemeral database reset scenario). Users are never logged out by infrastructure events unless the JWT itself has expired.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| State | Zustand, TanStack Query |
| Backend | FastAPI, Python 3.10+, Uvicorn |
| AI / RAG | OpenAI GPT-4.1-mini, OpenAI Embeddings, ChromaDB, LangChain |
| Database | PostgreSQL (production) · SQLite (local dev) + SQLAlchemy + Alembic |
| Auth | JWT (access 60 min + refresh 30 days), bcrypt, OTP email, OAuth (Google, GitHub) |
| Rate Limiting | slowapi (per-IP, with X-Forwarded-For proxy support) |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in OPENAI_API_KEY and JWT_SECRET_KEY
alembic upgrade head
uvicorn main:app --reload --port 8000
```

Interactive API docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # defaults to http://localhost:8000 + /api/v1 prefix
npm run dev
```

Frontend: `http://localhost:3000`

### Running Tests

```bash
cd backend
source venv/bin/activate
pytest app/tests/ -v
```

Tests run against an in-memory SQLite database and never touch `app.db`.

---

## Deployment

### Render (Backend)

1. Create a **PostgreSQL** database in Render. Copy the **Internal Connection String**.
2. Create a **Web Service**, root directory `backend`.
3. Set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL Internal Connection String from step 1 |
| `OPENAI_API_KEY` | `sk-...` |
| `JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `FRONTEND_ORIGINS` | Your Vercel URL, e.g. `https://querex.vercel.app` |
| `FRONTEND_URL` | Same as above (no trailing slash) |
| `APP_BASE_URL` | Your Render service URL |
| `RESEND_API_KEY` | For OTP emails (get one free at resend.com) |
| `ENVIRONMENT` | `production` |

`render.yaml` handles build + start commands automatically.

### Vercel (Frontend)

1. Import the repo, root directory `frontend`.
2. Set environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Render backend URL |
| `NEXT_PUBLIC_API_PREFIX` | `/api/v1` |

### OAuth Setup (Optional)

**Google:** Create an OAuth 2.0 Client ID in Google Cloud Console.
- Authorized redirect URI: `https://<your-render-url>/auth/callback/google`
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Render

**GitHub:** Create an OAuth App in GitHub Settings → Developer settings.
- Callback URL: `https://<your-render-url>/auth/callback/github`
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Render

---

## API Reference

All endpoints are versioned under `/api/v1`. Interactive docs available at `/docs`.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/signup` | Begin email signup (returns OTP gate) |
| `POST` | `/api/v1/auth/send-otp` | Send/resend OTP code |
| `POST` | `/api/v1/auth/verify-otp` | Verify OTP, complete account creation |
| `POST` | `/api/v1/login` | Password login |
| `POST` | `/api/v1/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/oauth/exchange` | Exchange one-time OAuth code for tokens |
| `DELETE` | `/api/v1/auth/account` | Delete account + all data |

### Documents
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/upload` | Upload PDF (returns 202, processes in background) |
| `GET` | `/api/v1/documents` | List documents (`?skip=0&limit=100`) |
| `GET` | `/api/v1/documents/{id}/status` | Poll ingestion status |
| `DELETE` | `/api/v1/documents/{id}` | Delete document + vectors |

### Chat
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/chat` | Stream chat response (SSE, `text/event-stream`) |

---

## Environment Variables

### Backend (`backend/.env`)

```
OPENAI_API_KEY=sk-...
JWT_SECRET_KEY=<random 32+ char secret>
DATABASE_URL=sqlite:///./app.db         # local only; use PostgreSQL in production
FRONTEND_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
APP_BASE_URL=http://localhost:8000
OPENAI_CHAT_MODEL=gpt-4.1-mini
ENVIRONMENT=development
RESEND_API_KEY=                          # leave empty to use dev mode (OTP printed to logs)
```

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_PREFIX=/api/v1
```
