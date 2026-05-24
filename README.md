# AI Research Copilot

An AI-powered research workspace combining ChatGPT + NotebookLM + Perplexity + ChatPDF. Upload PDFs, chat with documents using RAG, and maintain persistent research sessions.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| State | Zustand, TanStack Query |
| Backend | FastAPI, Python 3.10+ |
| AI | OpenAI GPT-4.1-mini, OpenAI Embeddings |
| RAG | LangChain, ChromaDB (vector store), pypdf |
| Database | SQLite + SQLAlchemy + Alembic |
| Auth | JWT (access + refresh tokens), bcrypt |

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

Backend runs at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Frontend runs at `http://localhost:3000`.

## Deployment

### Render (Backend)

1. Create a new **Web Service** in Render.
2. Connect your GitHub repo, set **Root Directory** to `backend`.
3. Set these environment variables in Render:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-...` |
| `JWT_SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `FRONTEND_ORIGINS` | Your Vercel frontend URL (e.g. `https://your-app.vercel.app`) |
| `DATABASE_URL` | `sqlite:///./app.db` (or a Render PostgreSQL URL) |
| `ENVIRONMENT` | `production` |

The `render.yaml` handles the build and start commands automatically (including running `alembic upgrade head`).

### Vercel (Frontend)

1. Import the repo in Vercel, set **Root Directory** to `frontend`.
2. Set these environment variables in Vercel:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Render backend URL (e.g. `https://your-api.onrender.com`) |
| `NEXT_PUBLIC_API_PREFIX` | Leave empty (uses legacy routes) |

## Environment Variables

### Backend (`backend/.env`)

```
OPENAI_API_KEY=sk-...
JWT_SECRET_KEY=<random 32+ char secret>
DATABASE_URL=sqlite:///./app.db
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OPENAI_CHAT_MODEL=gpt-4.1-mini
ENVIRONMENT=development
```

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_PREFIX=
```
