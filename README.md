# ResearchPilot AI

An Agentic AI Research Assistant powered by RAG, LangChain & LangGraph. This repository contains a premium Next.js UI and a Gemini-powered chat endpoint.

## Phase 3: Gemini API Integration & Working Chatbot

### Prerequisites

- Node.js 20+ (matches existing project)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Setup

1. Copy `.env.example` to `.env.local` and add your key:
   ```bash
   cp .env.example .env.local
   ```
2. Fill the required variable:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   # Optional: GEMINI_MODEL=gemini-3.6-flash
   ```

3. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```

### Usage

1. Open [http://localhost:3000](http://localhost:3000).
2. Type a question in the Research Assistant composer and press Enter.
3. The response streams in real time from Gemini. You can send follow-ups in the same session.

### Notes

- API key is read server-side only; never exposed to the browser.
- Streaming uses Server-Sent Events (`text/event-stream`).
- Phase 4+ features (RAG, documents, agent tools, memory, reports) are not implemented yet.
- Tests: run `npm run lint`, `npm run build`, and `npx tsc --noEmit`. If you add tests, run `npm test`.

## Deployment (Vercel)

Set these in **Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Variable | Value | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API key | Required for chat + embeddings |
| `CHROMA_API_KEY` | Chroma Cloud API key | Enables `CloudClient` |
| `CHROMA_TENANT` | Chroma Cloud tenant | From the Chroma Cloud dashboard |
| `CHROMA_DATABASE` | Chroma Cloud database name | e.g. `researchpilot` |
| `CHROMA_HOST` | `api.trychroma.com` | Defaults to this when `CHROMA_API_KEY` is set |
| `DATABASE_URL` | Postgres connection string | Vercel Postgres / Neon; stores document, conversation, and user account state |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token | Stores uploaded PDFs (private blobs) |
| `STORAGE_DRIVER` | `vercel` or `fs` | Optional override; auto-detected when Postgres + Blob are set |

Optional: `GEMINI_MODEL`, `EMBEDDINGS_CONTENTS_PER_MINUTE`, `DOCUMENT_PROCESSING_TIMEOUT_MS`, `USER_STORE_PATH`.

### Storage

Two drivers are supported and selected automatically:

- **`fs`** (default) — document metadata in `data/documents/documents.json`, conversations in `data/conversations/conversations.json`, user accounts/sessions in `data/users/users.json`, PDFs under `data/documents/files`. Used for local development, tests, and hosts with a writable persistent disk (Railway/Render with a volume).
- **`vercel`** — document/conversation/account state in Postgres (`app_state` JSONB table, created automatically) and PDFs in a private Vercel Blob store. Mutations run in a Postgres transaction with `SELECT ... FOR UPDATE`, so concurrent serverless invocations do not lose updates.

`STORAGE_DRIVER=vercel` is chosen automatically when both `DATABASE_URL` (or `POSTGRES_URL`) and `BLOB_READ_WRITE_TOKEN` are present. Force either driver with `STORAGE_DRIVER`.

User accounts only need Postgres, so setting `DATABASE_URL` (without a Blob token) is enough to keep sign-up, login, and sessions working on serverless hosts. Without a database, Vercel's read-only filesystem cannot persist accounts and the auth endpoints return a 503 explaining the missing configuration.

To move existing local data (JSON stores + PDFs) into Postgres/Blob, run once with both variables exported:

```bash
npm run migrate:storage
```

## Getting Started (Original)

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.
