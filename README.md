# JustSayIt

Say a sentence out loud (or type it) — AI turns it into a structured expense entry. No forms, no dropdowns, no manual categorization.

**Live:** https://justsayit.taoxiong.site

## Why

Most expense trackers make you fill out a form for every transaction. JustSayIt skips that: you describe what happened in plain language ("coffee with Alex, 35 kuai"), and the AI extracts amount, category, and note for you.

The other design goal is data ownership. The ledger's primary copy lives on your device (IndexedDB), not in a JustSayIt-hosted database. Cross-device sync is optional and goes straight to *your own* Google Drive — JustSayIt's server never keeps a persistent copy of your full ledger. Raw text/voice is sent server-side only transiently, to be parsed into a transaction.

## Features

- **Voice or text input** — speech-to-text via Groq Whisper (`whisper-large-v3-turbo`), then structured by an LLM.
- **Local-first storage** — IndexedDB is the source of truth on-device; the app works offline.
- **Optional Drive sync** — cross-device access via the user's own Google Drive, not a JustSayIt cloud backup.
- **PWA** — installable, offline shell caching via Serwist, no data loss on connectivity drops.
- **Switchable AI provider** — structuring runs on either Cerebras or OpenRouter (operator-selected via env var, no automatic failover — deliberate, to keep the data-handling path auditable).
- **Google OAuth** login, JWT sessions.
- **Per-user daily quota** on AI calls.
- English / Chinese UI.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + Postgres · Serwist (PWA) · Tailwind CSS 4 · Vitest

AI: Groq (STT) · Cerebras or OpenRouter (structuring, switchable)

## Getting started

Requirements: Node >=24 <25, a Postgres instance, a Google OAuth client, and at least one AI provider key (Groq is required for voice input; Cerebras or OpenRouter for structuring).

```bash
npm install
cp .env.example .env   # fill in the values described below
npx prisma migrate deploy
npm run dev
```

The app runs at `http://localhost:3000`.

### Environment variables

See [.env.example](.env.example) for the full list with explanations. In short, you'll need:

- `GROQ_API_KEY` — speech-to-text
- `CEREBRAS_API_KEY` and/or `OPENROUTER_API_KEY` + `AI_STRUCTURE_PROVIDER` — text structuring
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — OAuth login
- `SESSION_SECRET` / `REFRESH_TOKEN_ENCRYPTION_KEY` — session and token security
- `DATABASE_URL` — Postgres connection string
- `AI_DAILY_QUOTA` — per-user daily AI call limit

## Testing

```bash
npm test          # run once
npm run test:watch
npm run typecheck
```

## Deployment

Ships as a Docker image (see [Dockerfile](Dockerfile)) — multi-stage build, standalone Next.js output, `prisma migrate deploy` on container start. Reference deployment config for a single-VM setup behind Caddy is in [deploy/](deploy/).

## Status

Solo project, in active development, not yet at a 1.0 tag. No LICENSE file yet — all rights reserved by default until one is added.
