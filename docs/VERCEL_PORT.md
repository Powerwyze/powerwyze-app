# Porting to Vercel + Vercel Postgres + NextAuth

This codebase is intentionally written so the business logic, schema, and UI all translate to a Next.js + Vercel Postgres deployment without changes. Use this as a checklist.

## 1. Replace the Express server with Next.js route handlers

| This repo (Express) | Next.js equivalent |
|---|---|
| `server/index.ts` (bootstrap) | `next.config.mjs` + `middleware.ts` for session check |
| `server/routes.ts` `app.post("/api/auth/login", ...)` | `app/api/auth/[...nextauth]/route.ts` (NextAuth credentials provider) |
| `server/routes.ts` `/api/boards`, `/api/cards`, etc. | `app/api/boards/route.ts`, `app/api/cards/route.ts` (one folder per resource) |
| `server/routes.ts` `/api/webhooks/...` | `app/api/webhooks/twilio/voice/route.ts` etc. (mark `dynamic = "force-dynamic"`) |
| `server/storage.ts` Drizzle on `better-sqlite3` | Drizzle on `@vercel/postgres` driver — same schema, swap the driver |

## 2. NextAuth credentials provider

Use the `Credentials` provider with `bcrypt.compare` against the `users` table. Keep the same `users` schema (email, name, password hash, phone, standupTime, eodTime, timezone). The session callback must add `user.id` to the JWT so route handlers can read `session.user.id`.

## 3. Database migration

```ts
// db.ts
import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
export const db = drizzle(sql);
```

The schema in `shared/schema.ts` uses `sqliteTable`. Switch each table to `pgTable` from `drizzle-orm/pg-core`. The column types map 1:1:

- `text` → `text`
- `integer({ mode: "timestamp" })` → `timestamp({ withTimezone: true })`
- `integer({ mode: "boolean" })` → `boolean`
- `integer().primaryKey({ autoIncrement: true })` → `serial("id").primaryKey()`

Then run `drizzle-kit generate` and `drizzle-kit migrate` against the Vercel Postgres URL.

## 4. Cron scheduler for standup/EOD calls

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/place-calls", "schedule": "* * * * *" }
  ]
}
```

The handler queries users whose `standupTime` or `eodTime` matches the current minute in their timezone, and triggers a Twilio outbound call whose answer URL is `/api/webhooks/twilio/voice`.

## 5. UI layer

The entire `client/` folder ports to Next.js as-is — copy the components into `app/(dashboard)/...` and replace `wouter` with the Next.js `<Link>` and the `useRouter` hook. The shadcn/ui components, Tailwind config, and queryClient pattern all work unchanged.

## 6. Environment variables on Vercel

Set these in the Vercel project settings:

- `POSTGRES_URL` (added automatically by Vercel Postgres)
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_SHARED_SECRET`

## 7. Order of operations

1. Spin up an empty Next.js 14 + Tailwind + Drizzle project
2. Wire NextAuth + Vercel Postgres + the seed script (port `seedIfEmpty()` from `server/storage.ts`)
3. Copy the React components and wire them to the new `/api/*` routes
4. Add Twilio + ElevenLabs webhooks + the cron handler
5. Deploy
