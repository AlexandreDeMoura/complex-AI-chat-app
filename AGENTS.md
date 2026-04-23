## Project Overview

**AgoraCode** is a human-in-the-loop AI chat interface built on LangGraph agent orchestration, with a companion quiz feature for structured self-assessment.
Both features follow an explicit MVVM structure so rendering, orchestration, and data access stay decoupled.

### Tech Stack
- **Frontend:** React 19 + TypeScript, Vite 8, Tailwind CSS 4, Radix UI, Framer Motion
- **Backend:** Express 5 (Node.js, port 8788), Zod validation
- **AI:** LangChain Core + LangGraph (`createAgent`, `MemorySaver`) with a model registry and lazy per-model agent cache (`ChatOpenAI`, `ChatAnthropic`, `ChatMistralAI`)
- Dev proxy: Vite forwards `/api/*` → `:8788`; env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `PORT`

### Architecture

```
src/
  components/thread/
    thread-surface.tsx   # Embeddable chat surface (messages, composers, controls) reused by chat page and quiz modal
    index.tsx            # Full chat page shell: sidebar + header + routing, delegates to ThreadSurface
  components/ui/         # Radix-based design system primitives
  features/chat/
    model/               # Domain types shared across chat flow (messages, interrupts, thread summaries, model options)
    data/                # API clients and SSE parsing (health, threads, models, stream, resume)
    view-model/          # useChatViewModel orchestration hook for send/stop/resume/regenerate/thread/model ops
  features/quiz/
    model/               # Quiz domain types, Zod upload schema, buildQuizPrelude helper
    data/                # quiz-upload parser, feedback-client (POST /api/quiz/feedback)
    view-model/          # useQuizState: question navigation, mode toggle, submission lock, feedback lifecycle, handoff state
    view/                # QuizPage (upload + question UI), QuizChatModal (fullscreen Radix Dialog embedding ThreadSurface)
  hooks/                 # useDarkMode, useMediaQuery, useCopyToClipboard
server/
  index.js               # Interface layer: route definitions, validation, HTTP/SSE serialization
  application/
    chat-service.js      # Application layer: send/stream/resume orchestration + SSE event mapping
    thread-service.js    # Application layer: thread listing use case
    quiz-service.js      # Application layer: direct ChatAnthropic invocation for quiz feedback (isolated from chat agent stack)
  domain/
    tools.js             # Domain layer: tool definitions with interrupt behavior
    message-utils.js     # Domain layer: model content parsing helpers
  infrastructure/
    agent.js             # Infrastructure layer: model registry + lazy per-model agent cache
    thread-store.js      # Infrastructure layer: in-memory thread repository + per-thread model lock
```

**Backend routes:**
- `GET /api/health` — health check used by the chat ViewModel
- `GET /api/threads` — thread summaries for history sidebar
- `GET /api/models` — available model options filtered by configured provider keys
- `POST /api/chat` — non-streaming, auto-approves interrupts (accepts optional `model`)
- `POST /api/chat/stream` — SSE streaming with interrupt support (accepts optional `model`, optional `systemContext` injected as system message on first thread write)
- `POST /api/chat/resume` — resumes a paused agent with approve/reject decision (model resolved from thread store)
- `POST /api/quiz/feedback` — returns AI feedback comparing a user's open answer to the expected answer (direct `ChatAnthropic` call, isolated from agent stack)

**State:** threads are in-memory (Map); no database. Thread IDs are UUIDs generated on the frontend and passed on every request. The model is persisted on first thread write and then treated as immutable for that thread.

### Chat MVVM Boundaries

- **View (`src/components/thread`)**: Rendering and local UI-only state (e.g., input text, sidebar open/close, hide tool calls). No direct fetch/SSE parsing. `ThreadSurface` is the reusable chat surface (messages, composers, controls) used by both the main chat page and `QuizChatModal`.
- **ViewModel (`src/features/chat/view-model/use-chat-view-model.ts`)**: Chat orchestration and state transitions for send, stop, interrupt approve/reject, regenerate, new thread, thread select, history refresh, and model selection.
- **Model (`src/features/chat/model`)**: Shared domain types (`ChatMessage`, `InterruptState`, tool payloads, `ThreadSummary`, `ModelOption`).
- **Data (`src/features/chat/data`)**: Backend integration (`/api/health`, `/api/threads`, `/api/models`, `/api/chat/stream`, `/api/chat/resume`) and typed SSE event parsing. `openChatStream` supports an optional `systemContext` string forwarded to the backend for prelude injection.

### Quiz Feature

The quiz is a frontend-driven self-assessment tool accessible at `/quiz`, separate from the chat. Users upload a JSON file of pre-authored questions, then answer them one by one in open-answer or MCQ mode.

**Core flow:** upload JSON → Zod-validated against a strict schema (4 MCQ options, exactly 1 correct) → navigate questions with mode toggle (open/mcq), per-mode submission lock, and `Previous`/`Next`/`Finish` controls. State is in-memory only; refresh clears the quiz.

**AI feedback (open mode only):** on submission, the frontend calls `POST /api/quiz/feedback` which invokes `ChatAnthropic` (`claude-sonnet-4-6`) directly — no `createAgent`, no model registry, no thread store, no tools/interrupts. The feedback compares the user answer to the expected answer and is displayed once (no regeneration).

**Quiz-to-chat handoff:** an "Ask guidance to AI" button on every question opens a fullscreen `QuizChatModal` (Radix Dialog embedding `ThreadSurface`) with a fresh chat thread. A hidden system prelude (`buildQuizPrelude`) injects quiz context (question, answers, feedback) into the thread's first message via the `systemContext` field on `/api/chat/stream`. The quiz state is preserved behind the modal.

**Quiz MVVM boundaries:**
- **Model (`src/features/quiz/model`)**: Zod upload schema, domain types (`QuizQuestion`, per-question state), `buildQuizPrelude` helper.
- **Data (`src/features/quiz/data`)**: `quiz-upload.ts` (file parsing + validation), `feedback-client.ts` (`POST /api/quiz/feedback`).
- **ViewModel (`src/features/quiz/view-model/use-quiz-state.ts`)**: Question index, mode toggle, submission lock, feedback lifecycle (`idle|loading|success|error`), handoff state (modal open/close + `threadId` + captured `systemContext`).
- **View (`src/features/quiz/view`)**: `QuizPage` (upload screen + question UI), `QuizChatModal` (fullscreen dialog wrapping `ThreadSurface`).

### AI & Orchestration

Agents are created lazily per model ID and cached:
```js
const agent = getAgent(modelId) // createAgent(...) on first use for each model
```
Current bootstrap location: `server/infrastructure/agent.js`.

Tools are defined with `tool()` + Zod schema. Any tool can call `interrupt()` to pause the graph.
Current tool location: `server/domain/tools.js`.

**Streaming flow:**
1. `agent.stream()` yields typed chunks (`'ai'`, `'tool'`, etc.)
2. Application layer (`server/application/chat-service.js`) maps chunks/state to SSE events: `token` | `tool_result` | `interrupt` | `done` | `error`
3. Frontend ViewModel (`src/features/chat/view-model/use-chat-view-model.ts`) consumes SSE via `readChatStream` and updates chat state consumed by thread view components

**Human-in-the-loop:**
- Tool calls `interrupt()` → backend emits `{ type: 'interrupt', toolCalls }` → ViewModel stores interrupt state → UI renders `ThreadInterruptSection`/`InterruptView`
- User approves/rejects → `POST /api/chat/resume` with `Command({ resume })` → graph continues

Thread memory is scoped by `thread_id` via LangGraph's checkpointer config, and `/api/chat/resume` always reuses the model persisted for that thread.

---

## How To Write Code 
### When Writing Front-End Code 
Always think of your front-end code as layered architecture:
- Presentation layer: UI that handles user interactions and display logic; custom hooks can act as adapters between domain objects and components.
- Domain layer: Business logic, rules, calculations, and validations that define app behavior.
- Data layer: API integration, external-state synchronization, conversions, and mapping functions.

For chat and quiz, enforce MVVM boundaries:
- Chat: View in `src/components/thread`, ViewModel in `src/features/chat/view-model`, Model in `src/features/chat/model`, Data in `src/features/chat/data`
- Quiz: View in `src/features/quiz/view`, ViewModel in `src/features/quiz/view-model`, Model in `src/features/quiz/model`, Data in `src/features/quiz/data`

Each layer does not need a dedicated file, but boundaries must be clear and explicit.

### When Writing Back-End Code
Always think of your back-end code as 4 separate layers:
- Interface layer: HTTP handlers, request validation, response serialization, authentication/authorization checks. This layer translates external protocols into internal calls and vice versa.
- Application layer: Use cases and orchestration. Coordinates domain objects to perform tasks, handles transactions, and enforces application-specific rules (as opposed to universal business rules).
- Domain layer: Core business entities, value objects, and domain rules that exist independent of any delivery mechanism or persistence strategy. This layer should have zero dependencies on the others.
- Infrastructure layer: Database repositories, external service clients, message queues, caching. Implements interfaces defined by the domain/application layers.
Each layer doesn't need its own file, BUT even within a single file, the separation should be clear and explicit. Dependencies must point inward: Interface → Application → Domain ← Infrastructure.

### Comments: high-signal only
- Comments must explain **why / constraints / invariants / “why not”** (tradeoffs), not narrate the code.
- Delete or avoid comments that simply restate names, control flow, or obvious intent.

### Robustness over happy-path
- Make failure modes explicit (timeouts, retries only when justified, idempotency where needed).
- Avoid blanket `try/catch` that hides errors; handle known cases and surface unknown ones.
- Don’t guess API contracts—verify in-repo types/clients or add a defensive check + `TODO`.
