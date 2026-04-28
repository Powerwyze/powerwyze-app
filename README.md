# PowerWyze

A closed-beta operating system for PowerWyze, built for Bryan and Stephanie.

- **Three shared boards** — PowerWyze (company), Sales Objectives, Bryan – Technical & Logistics
- **Two private boards** — Bryan – Personal, Stephanie – Personal (only the owner can see)
- **Per-board chat agent** — ask the agent anything about the board you're on
- **Standup + EOD voice calls** — Twilio + ElevenLabs Conversational AI calls each user at their chosen time, parses the transcript, and auto-creates cards on the right board

## Local development

```bash
npm install
npm run dev
```

Visit http://localhost:5000 and sign in:

- **bryan.stewart@powerwyze.com** / `powerwyze123`
- **stephanie@powerwyze.com** / `powerwyze123`

The SQLite DB is auto-created at `data.db` on first boot and seeded with both users plus the five boards.

## Environment variables

Create a `.env` file in the project root:

```
# Session signing secret
SESSION_SECRET=replace-with-32-byte-random-string

# Optional — enables real LLM responses for the board chat agent
# and intelligent transcript parsing into action items.
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Twilio (for outbound calls)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# ElevenLabs Conversational AI
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_SHARED_SECRET=replace-with-random-string
```

When `OPENAI_API_KEY` is missing, the chat agent and call parser run in deterministic fallback mode so the UI still works.

## Voice calls — production wiring

The browser-based call simulation works without any external services. To enable real phone calls:

1. **Provision a Twilio number** and point its Voice webhook at `POST /api/webhooks/twilio/voice` on your deployed URL.
2. **Create an ElevenLabs Conversational AI agent** with the system prompt from `server/routes.ts` (search for `runVoiceAgentTurn`). Copy the `agent_id` into `ELEVENLABS_AGENT_ID`.
3. **Configure the post-call webhook** in ElevenLabs to `POST /api/webhooks/elevenlabs/post-call` with header `X-Shared-Secret: <ELEVENLABS_SHARED_SECRET>`.
4. **Schedule the daily calls** — add a Vercel Cron (see `vercel.json` below) or any external scheduler that hits `/api/cron/place-calls` once per minute. The handler checks every user's `standupTime` / `eodTime` and dials Twilio for any user whose time matches.

A starter `vercel.json` is included as `vercel.json.example`.

## Deploying to Vercel

This codebase runs as a single Express server. To deploy on Vercel as the user originally requested:

- The cleanest path is to keep this Express server and deploy via Vercel's Node.js runtime (or Render / Railway / Fly).
- A pure Vercel + Vercel Postgres + NextAuth port is a 1-2 day rewrite of the same UI/API surface; the schema, business logic, and prompts in this repo translate directly. See `docs/VERCEL_PORT.md` for the migration map.

## Project layout

```
client/src/          React frontend (Vite + Tailwind + shadcn/ui)
  pages/             login, board, profile, calls
  components/        AppShell, ChatPanel, CardDialog, Logo
  lib/auth.tsx       Session-cookie auth context
server/
  index.ts           Express bootstrap
  routes.ts          All API routes + LLM helpers
  storage.ts         Drizzle storage layer + bootstrap seed
shared/schema.ts     Drizzle schema (users, boards, columns, cards, comments, calls)
```

## What's seeded

| Board                          | Kind     | Owner     | Visible to |
| ------------------------------ | -------- | --------- | ---------- |
| PowerWyze                      | company  | —         | everyone   |
| Sales Objectives               | business | Stephanie | everyone   |
| Bryan – Technical & Logistics  | business | Bryan     | everyone   |
| Stephanie – Personal           | personal | Stephanie | Stephanie only |
| Bryan – Personal               | personal | Bryan     | Bryan only |

Each board ships with the four columns: Backlog, In Progress, Blocked, Done.
