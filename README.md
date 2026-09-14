# Querex — AI Research Workspace

Querex is a full-stack AI workspace for research and writing. Five tools share one account,
one admin panel, and one set of runtime controls:

| Tool | What it does | Backend |
|---|---|---|
| **Research Copilot** | Chat with your PDFs. Page-cited, document-grounded answers; multi-document compare; one-click research actions (summary, key findings, full report, compare, references, study questions); follow-up suggestions. | `POST /chat`, `/upload`, `/documents`, `/sessions` |
| **Humanizer** | Rewrites AI-sounding text. *Basic* is a 3-pass GPT pipeline (analyze → best-of-N rewrite → verify); *Ultra Human* is a locally-served fine-tuned LoRA (Qwen2.5-7B). | `POST /humanize`, `/humanize/ultra`, `/humanizer/runs` |
| **AI Checker** | AI-probability detection with per-paragraph signals, plus Writing Feedback. | `POST /checker/text`, `/checker/document`, `/checker/feedback` |
| **Real-time AI** | Web-grounded chat (Tavily search) with cited sources and its own session history. | `POST /realtime/chat`, `/realtime/sessions` |
| **Paper Analyzer** | Measures a PDF's real layout (margins, spacing, fonts) against a style guide. | `POST /paper-analyzer/analyze` |

Text can be imported into any tool from a URL or an image (`POST /extract/url`, `/extract/image`).

**Live:** frontend on Vercel · backend on Render · database on Neon (PostgreSQL + pgvector) · files on Cloudflare R2.

---

## Architecture

```
Next.js 16 (App Router, React 19, TanStack Query, Zustand, Tailwind v4)
        │  HTTPS /api/v1/*   (JWT access token + httpOnly refresh cookie)
        ▼
FastAPI ──┬── auth: email OTP + OAuth (Google, GitHub), one-time code exchange
          ├── documents: upload → background ingestion (pypdf + vision captions) → pgvector
          ├── chat: retrieval modes (top-k / whole document / exact page) + research actions
          ├── humanizer, checker, realtime, paper analyzer, extract
          ├── admin: stats, analytics, users, documents, settings, audit log, system
          └── middleware: request ids, maintenance mode, per-tool usage events
        │
        ├── PostgreSQL (Neon) — users, sessions, documents, chunks (pgvector), settings, audit, usage
        ├── Cloudflare R2 — private PDF storage (local disk in development)
        ├── OpenAI — chat, embeddings, vision, classification
        ├── Tavily — web search for Real-time AI
        └── Ollama (local) — `humaniser-lora` for Ultra Human
```

### Key engineering decisions

- **Multi-tenant isolation at every layer.** Vector chunks carry `user_email`; services verify
  ownership before any mutation; session lookups include the user id in the query.
- **Grounded retrieval with three modes.** Plain questions use top-k similarity; counting and
  "list all" questions get the whole document; "what's on page N" uses an exact page filter.
  Research actions always run over the whole selected document set.
- **Tokens never in URLs.** OAuth callbacks hand the browser a 120-second single-use code that is
  exchanged server-side; the refresh token lives in an httpOnly cookie.
- **Runtime control without redeploys.** Every limit, rate limit, tool kill switch, the
  announcement banner, sign-up state and maintenance mode live in `app_settings` and are editable
  from `/admin` (30-second cache).
- **Observability built in.** Every tool request is recorded as a lean `usage_events` row (tool,
  status, latency, user — never content) and every admin action is written to `admin_audit_log`.
- **Free-tier retention.** Documents and chats older than `retention_days` are purged by a
  cleanup that piggybacks on the uptime ping; at most one worker runs it per day.

---

## Admin panel (`/admin`)

Admins are bootstrapped with the `ADMIN_EMAILS` env var and can promote others from the panel.

- **Overview** — live counters, daily charts (requests, errors, sign-ups, messages, uploads,
  humanizer runs), usage per tool with error rate and p95 latency, most active users.
- **Users** — search, status/role filters, sort, CSV export, suspend/reinstate, promote/demote,
  mark email verified, sign out everywhere, delete with full data purge, per-user drawer with
  30-day usage, documents and sessions.
- **Documents** — every document across users with status filter, re-ingest, delete.
- **Settings** — grouped runtime settings: platform (maintenance mode, sign-ups, announcement),
  feature switches per tool, uploads & retention, and per-tool limits.
- **Audit & activity** — the admin audit log and recent tool requests (filter by tool, errors only).
- **System** — environment, schema version, storage backend, model configuration, integration
  status (with an optional live probe), and a "run retention cleanup now" action.

---

## Local development

```bash
# Backend (uses backend/.env; DATABASE_URL may point at Neon or a local sqlite file)
cd backend && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and
`NEXT_PUBLIC_API_PREFIX` (`/api/v1`). Without an email provider configured, the OTP code is
returned in the API response and auto-filled in the sign-in form.

Note: vector storage requires PostgreSQL with the pgvector extension. On SQLite the app boots and
every non-RAG feature works, but document ingestion fails.

### Tests and checks

```bash
cd backend && python -m pytest app/tests -q      # 350+ contract and service tests
cd frontend && npx tsc --noEmit && npx eslint app features components services shared stores && npm run build
```

CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend type-check + build.

---

## Deployment

- **Render** — `backend/render.yaml`: `alembic upgrade head && uvicorn app.main:app`. Required env:
  `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET_KEY`, `FRONTEND_ORIGINS`, `FRONTEND_URL`,
  `APP_BASE_URL`, `ENVIRONMENT=production`, `ADMIN_EMAILS`, the four `R2_*` variables, and
  optionally `RESEND_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_CLIENT_*`, `GITHUB_CLIENT_*`.
- **Vercel** — root `frontend`, env `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_API_PREFIX=/api/v1`.
- **Ultra Human** is local-only until the model is hosted; the endpoint returns a clear 503 elsewhere.

Full backend variable reference: `backend/.env.example`.

---

## Repository layout

```
backend/
  app/api/routes/        every HTTP route (auth, chat, documents, admin, app_config, ...)
  app/api/middleware/    request context, maintenance mode, usage tracking hook
  app/services/          business logic (chat, humanizer/, checker, retention, runtime_settings, ...)
  app/modules/rag/       embedding, ingestion, pgvector store, retrieval
  app/db/models/         SQLAlchemy models · app/db/repositories/  data access
  app/tests/             pytest suite · alembic/  migrations
  scripts/finetune/      Humanizer LoRA training pipeline (see STATE.md there)
frontend/
  app/                   routes (chat, humanizer, checker, realtime, paper-analyzer, admin, login)
  features/              per-product components and hooks (admin/, chat/, humanizer/, ...)
  services/api/          typed API clients · shared/  types and helpers · stores/  Zustand
```
