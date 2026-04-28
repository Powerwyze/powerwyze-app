# PowerWyze — Vercel Deployment Guide

## Prerequisites

- Node.js 20+
- Vercel CLI (`npm i -g vercel` or use `npx vercel`)
- GitHub CLI (`gh`) for repo creation
- A Vercel account with access to the Vercel Postgres add-on (Hobby plan supports one database)

---

## Step 1 — Push to GitHub

```bash
cd /home/user/workspace/powerwyze-vercel
git init
git add .
git commit -m "Initial Vercel port"

# Create a private GitHub repo and push
gh repo create powerwyze-app --private --source=. --push
```

---

## Step 2 — Link to Vercel

```bash
npx vercel --token $VERCEL_TOKEN link --yes --project powerwyze
```

This creates `.vercel/project.json` with `projectId` and `orgId`.

---

## Step 3 — Provision Vercel Postgres

**This must be done in the Vercel dashboard — the CLI does not support storage provisioning on the Hobby plan.**

1. Go to https://vercel.com/dashboard
2. Select the `powerwyze` project
3. Go to **Storage** tab → **Connect Database** → choose **Postgres** (powered by Neon)
4. Name the database `powerwyze-db`
5. Select the same region as your deployment (e.g. `iad1` for US East)
6. Vercel will automatically add `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NO_SSL`,
   `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE`
   as environment variables to all environments (Production, Preview, Development).

> **Note:** `@vercel/postgres` is technically deprecated in favor of Neon's native SDK,
> but the package continues to work and reads the same `POSTGRES_URL` environment variable.
> No migration is needed at deploy time.

---

## Step 4 — Pull Environment Variables

After provisioning Postgres, pull all auto-added env vars to a local file:

```bash
npx vercel --token $VERCEL_TOKEN env pull .env.production.local
```

This creates `.env.production.local` with `POSTGRES_URL` and companion Postgres variables.
**Do not commit this file.**

---

## Step 5 — Add Application Secrets

Add each secret to Vercel's Production environment. Replace placeholder values with real ones:

```bash
# Twilio (for outbound voice calls)
echo "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | npx vercel --token $VERCEL_TOKEN env add TWILIO_ACCOUNT_SID production
echo "your_twilio_auth_token" | npx vercel --token $VERCEL_TOKEN env add TWILIO_AUTH_TOKEN production
echo "+1XXXXXXXXXX" | npx vercel --token $VERCEL_TOKEN env add TWILIO_FROM_NUMBER production

# ElevenLabs (voice agent)
echo "your_elevenlabs_api_key" | npx vercel --token $VERCEL_TOKEN env add ELEVENLABS_API_KEY production
echo "your_elevenlabs_agent_id" | npx vercel --token $VERCEL_TOKEN env add ELEVENLABS_AGENT_ID production
echo "your_elevenlabs_shared_secret" | npx vercel --token $VERCEL_TOKEN env add ELEVENLABS_SHARED_SECRET production

# OpenAI (chat + transcript parsing)
echo "sk-your_openai_api_key" | npx vercel --token $VERCEL_TOKEN env add OPENAI_API_KEY production
echo "gpt-4o-mini" | npx vercel --token $VERCEL_TOKEN env add OPENAI_MODEL production

# Session security
echo "a-long-random-secret-at-least-32-chars" | npx vercel --token $VERCEL_TOKEN env add SESSION_SECRET production

# Public base URL — set AFTER first deploy; use the Vercel-assigned URL
# e.g. https://powerwyze-app.vercel.app
echo "https://YOUR_VERCEL_URL.vercel.app" | npx vercel --token $VERCEL_TOKEN env add PUBLIC_BASE_URL production
```

### Full environment variable reference

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_URL` | Auto-added by Vercel Postgres | `postgres://user:pass@host/db?sslmode=require` |
| `SESSION_SECRET` | Secret for `express-session` signing | A random 32+ char string |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACxxxxxxxx...` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `your_auth_token` |
| `TWILIO_FROM_NUMBER` | Twilio phone number (E.164) | `+15551234567` |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | `xi_api_...` |
| `ELEVENLABS_AGENT_ID` | ElevenLabs conversational agent ID | `agent_...` |
| `ELEVENLABS_SHARED_SECRET` | Shared secret for ElevenLabs post-call webhook | Any string |
| `OPENAI_API_KEY` | OpenAI API key for chat & transcript parsing | `sk-...` |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o-mini` |
| `PUBLIC_BASE_URL` | Canonical HTTPS URL for Twilio webhooks | `https://yourapp.vercel.app` |

> **`PUBLIC_BASE_URL`**: Set this after your first deploy. Twilio's voice webhook and status
> callback URLs are constructed from it. It must be an HTTPS URL. Without it, the `/api/calls/dial`
> endpoint will reject requests that don't originate from localhost.

---

## Step 6 — Deploy

```bash
npx vercel --token $VERCEL_TOKEN --prod
```

Vercel will:
1. Run `npm run build` (Vite builds the frontend to `dist/public/`)
2. Bundle `api/[[...path]].ts` as a serverless function
3. Serve static assets from `dist/public/`
4. Route all `/api/*` requests to the serverless function via the `vercel.json` rewrite

---

## Architecture Notes

### Serverless handler (`api/[[...path]].ts`)

All `/api/*` traffic is routed to a single Express handler. The `ready` promise ensures
`bootstrap()` + `seedIfEmpty()` runs only once per cold-start. Subsequent invocations within
the same Lambda instance reuse the same Express app.

### Database bootstrap

`bootstrap()` in `server/storage.ts` runs `CREATE TABLE IF NOT EXISTS` for every table on
first invocation. This is idempotent and safe to run on every cold-start — Postgres will
no-op if tables exist. No separate migration step is required.

### Sessions

`connect-pg-simple` stores sessions in a `session` table in Postgres. The store is configured
with `createTableIfMissing: true` so the table is created automatically on first use.

### Vercel Cron

`vercel.json` schedules `GET /api/cron/place-calls` every minute. The endpoint checks each
user's configured standup/EOD time against their local timezone and dials matches via Twilio.
It is protected by `ELEVENLABS_SHARED_SECRET` (sent as the `x-cron-secret` header or `?secret=`
query parameter — Vercel Cron doesn't currently sign requests, so you must send the secret
from your own scheduler if needed).

### Static routing

Vercel serves files from `dist/public/` as static assets. The SPA's `index.html` is the
fallback for any non-API, non-asset path (handled by Vercel's default SPA routing for
`framework: null` with a static `outputDirectory`).

---

## Updating the App

```bash
# Make changes, then:
git add .
git commit -m "Your change description"
git push

# Vercel auto-deploys on push to main (if GitHub integration is set up), OR:
npx vercel --token $VERCEL_TOKEN --prod
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `POSTGRES_URL` not set | Re-run `env pull` after provisioning Postgres in the dashboard |
| Sessions lost between invocations | Expected — Lambda is stateless; sessions persist in Postgres |
| Twilio webhook 404 | Ensure `PUBLIC_BASE_URL` is set to your Vercel URL before dialing |
| Cold-start takes >10s | First invocation runs `bootstrap()` + `seedIfEmpty()`; subsequent calls are fast |
| `@vercel/postgres is deprecated` warning | Harmless — the package still works; migrate to `@neondatabase/serverless` in the future if desired |
