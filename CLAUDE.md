# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PHAESTUS is an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware (KiCad schematics, PCB layouts, 3D-printable enclosures, firmware scaffolding).

## Deployment

**Live**: https://phaestus.app

Hosted on Cloudflare Pages with:
- **D1 Database**: `phaestus` (SQLite)
- **R2 Bucket**: `phaestus-assets`
- **Secrets**: `OPENROUTER_API_KEY`, `TEXT_MODEL_SLUG`, `IMAGE_MODEL_SLUG`

Deploy: `pnpm deploy` (builds + deploys to Cloudflare Pages)

## Commands

All commands run from `frontend/`:

```bash
# Development
pnpm dev           # Frontend only (port 5173, no API)
pnpm dev:full      # Full stack with D1/R2 (port 8788)

# Testing
pnpm test          # Run tests in watch mode
pnpm test:run      # Run tests once
pnpm test:coverage # Run with coverage report

# Build & Deploy
pnpm build         # TypeScript + Vite build
pnpm deploy        # Build and deploy to Cloudflare Pages

# Code Quality
pnpm typecheck     # Type checking
pnpm lint          # ESLint
pnpm lint:fix      # Fix lint issues
pnpm format        # Prettier

# Database
pnpm db:migrate        # Run migrations locally
pnpm db:migrate:remote # Run migrations on production D1
pnpm db:reset          # Reset local DB and re-run all migrations
```

Use `dev:full` when working with API endpoints or database.

## Architecture

### Spec Pipeline

The app guides users through a 5-step spec development process:

1. **Feasibility Analysis** - Scores the idea across categories (communication, processing, power, I/O)
2. **Refinement** - Surfaces questions to lock down open decisions
3. **Blueprints** - Generates 4 product render variations
4. **Selection** - User picks their favorite design
5. **Finalization** - Generates locked spec with BOM

LLM prompt templates for each stage live in `src/prompts/`.

Hard rejections: FPGA, high voltage (>24V), safety-critical systems, healthcare devices.

### Cloudflare Pages Functions

API endpoints in `functions/api/` using file-based routing:

```
functions/api/
├── _middleware.ts     # Auth middleware (session cookie check)
├── auth/              # Login/logout/me
├── llm/               # LLM proxy (chat, stream, image) + pricing.ts
├── admin/             # Debug logs (admin only)
├── settings/          # Config and usage stats
├── projects/          # CRUD for projects
└── blocks/            # PCB block library
```

Public routes defined in `_middleware.ts`. Everything else requires session cookie.

### Environment & Secrets

Create `frontend/.dev.vars` for local development:
```env
OPENROUTER_API_KEY=sk-or-v1-...
TEXT_MODEL_SLUG=google/gemini-2.0-flash-001
IMAGE_MODEL_SLUG=google/gemini-2.0-flash-exp
```

Production secrets via `wrangler secret`. Bindings in `wrangler.toml`: `DB` (D1), `STORAGE` (R2).

### Frontend

```
src/
├── pages/           # Route components
├── components/      # Shared UI
├── prompts/         # LLM prompt templates (feasibility, blueprint, etc.)
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
- `debug_logs` - Admin logging

### LLM Integration

All LLM requests proxy through `/api/llm/*` (keys stay server-side):
- `POST /api/llm/chat` - Non-streaming
- `POST /api/llm/stream` - Streaming (SSE)
- `POST /api/llm/image` - Image generation

Cost tracking automatic via `llm_requests` table.

### Auth

Session cookies (7-day expiry). Default user: `mike`/`mike` (admin).

### Debug Logging

Admin-only feature (`functions/lib/logger.ts`):

```typescript
const logger = createLogger(env, user, requestId)
await logger.debug('llm', 'Request received', { model })
await logger.llm('Chat completed', { latencyMs, tokens })
await logger.error('llm', 'API error', { error })
```

Categories: `general`, `api`, `auth`, `llm`, `project`, `image`, `db`, `middleware`

View logs: `GET /api/admin/logs?level=error&category=llm`

### Testing

Vitest with 90%+ coverage on testable modules:

```
src/prompts/*.ts      # LLM prompt templates
src/db/schema.ts      # Row-to-model transforms
src/services/llm.ts   # LLM client
src/stores/auth.ts    # Auth state
functions/lib/logger.ts     # Debug logger
functions/api/llm/pricing.ts # Cost calculations
```

Run tests: `pnpm test` or `pnpm test:coverage`

Note: API endpoint handlers (`functions/api/**`) are excluded from coverage as they require Cloudflare Workers runtime mocking (miniflare).
