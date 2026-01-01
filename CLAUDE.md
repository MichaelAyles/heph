# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PHAESTUS is an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware (KiCad schematics, PCB layouts, 3D-printable enclosures, firmware scaffolding).

## Commands

```bash
# Development (frontend only, no API)
pnpm dev

# Development (full stack with Cloudflare Pages Functions)
pnpm dev:full

# Build
pnpm build

# Type checking
pnpm typecheck

# Linting and formatting
pnpm lint
pnpm lint:fix
pnpm format

# Database
pnpm db:migrate        # Run migrations locally
pnpm db:migrate:remote # Run migrations on production D1
pnpm db:reset          # Reset local DB and re-run all migrations

# Deploy
pnpm deploy
```

## Architecture

### Two Dev Server Modes

- `pnpm dev` - Vite dev server on port 5173 (frontend only, no API)
- `pnpm dev:full` - Builds then runs wrangler pages dev on port 8788 (full stack with D1/R2 bindings)

Use `dev:full` when working with API endpoints or database.

### Cloudflare Pages Functions

API endpoints live in `functions/api/` using file-based routing:

```
functions/api/
├── _middleware.ts     # Auth middleware (checks session cookie)
├── auth/              # Login/logout/me endpoints
├── llm/               # LLM proxy (chat, stream, image)
│   └── pricing.ts     # Cost calculation per model
├── settings/          # Config and usage stats
├── projects/          # CRUD for projects
└── blocks/            # PCB block library
```

All protected routes require a valid session cookie. Public routes are defined in `_middleware.ts`.

### Environment & Secrets

Secrets are configured in `.dev.vars` (local) or via `wrangler secret` (production):

- `OPENROUTER_API_KEY` - Required for LLM API calls
- `TEXT_MODEL_SLUG` - Default text model (e.g., `google/gemini-3-flash-preview`)
- `IMAGE_MODEL_SLUG` - Default image model (e.g., `google/gemini-2.5-flash-image`)

Bindings defined in `wrangler.toml`:
- `DB` - D1 database (SQLite)
- `STORAGE` - R2 bucket for file storage

### Frontend Structure

```
src/
├── pages/           # Route components
├── components/      # Shared UI components
├── services/llm.ts  # LLM client (calls /api/llm/*)
├── stores/auth.ts   # Zustand auth store
└── db/schema.ts     # TypeScript types for DB tables
```

### Database

D1 (SQLite) with migrations in `migrations/`. Key tables:
- `users`, `sessions` - Auth
- `projects`, `conversations` - User data
- `pcb_blocks` - Pre-validated circuit modules (21 seeded)
- `llm_requests` - Usage tracking with cost
- `system_settings` - Configuration

### LLM Integration

All LLM requests proxy through `/api/llm/*` to keep API keys server-side. The service supports:
- OpenRouter (default) - 300+ models
- Direct Gemini API

Cost tracking is automatic - every request logs model, tokens, and calculated USD cost.

### Auth

Simple password auth with session cookies (7-day expiry). Default user: `mike`/`mike`. Data model supports future OAuth upgrade without schema changes.

### Admin & Debug Logging

The user `mike` has admin privileges (`is_admin = 1`). Admin features:

**Debug Logger** (`functions/lib/logger.ts`):
```typescript
import { createLogger } from '../lib/logger'

const logger = createLogger(env, user, requestId)
await logger.debug('llm', 'Request received', { model })
await logger.llm('Chat completed', { latencyMs, tokens })
await logger.error('llm', 'API error', { error })
```

Log levels: `debug`, `info`, `warn`, `error`
Categories: `general`, `api`, `auth`, `llm`, `project`, `image`, `db`, `middleware`

**Admin API** (`/api/admin/logs`):
- `GET /api/admin/logs?level=error&category=llm` - View logs with filters
- `DELETE /api/admin/logs?olderThanDays=7` - Cleanup old logs

Logs are stored in `debug_logs` table for admin users only. Console output is color-coded in development.
