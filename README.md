# Elegant LangChain Chat App

A simple, polished AI chat application built with React + Vite on the frontend and a LangChain `createAgent()` API on the backend.

## Stack

- React + TypeScript + Vite
- LangChain agent (`createAgent`) with `MemorySaver` for thread memory
- OpenAI model via `@langchain/openai`
- Express API (`/api/chat`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Set `OPENAI_API_KEY` in `.env`.

## Run

```bash
npm run dev
```

This starts:
- Frontend: `http://localhost:5173`
- API: `http://localhost:8787`

Vite proxies `/api/*` to the API server in development.

## Notes

- The frontend persists a `threadId` in local storage to keep conversation memory across requests.
- Click `New chat` to reset the conversation and start a fresh thread.
