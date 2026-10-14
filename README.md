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

## Getting Started (Original)

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.
