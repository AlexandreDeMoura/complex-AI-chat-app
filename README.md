
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

3. Set provider/auth keys in `.env`:
   - `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` and/or `MISTRAL_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_PUBLISHABLE_KEY` is safe for browser usage when RLS is enabled.
`SUPABASE_SECRET_KEY` must stay server-side only.

## Run

```bash
npm run dev
```

This starts:
- Frontend: `http://localhost:5174`
- API: `http://localhost:8788`

Vite proxies `/api/*` to the API server in development.

## Notes

- The frontend persists a `threadId` in local storage to keep conversation memory across requests.
- Click `New chat` to reset the conversation and start a fresh thread.
