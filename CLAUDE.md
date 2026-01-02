# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

PHAESTUS is an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware designs. Users describe what they want to build, and the system guides them through feasibility analysis, requirement refinement, visual design selection, and final specification generation.

**Stack**: React 19 + TypeScript, Cloudflare Pages Functions, D1 (SQLite), R2 storage, Tailwind CSS 4, Zustand, TanStack Query

## Deployment

**Live**: https://phaestus.app

**IMPORTANT**: Deployments require manual wrangler invocation:
```bash
cd frontend && pnpm build && pnpm exec wrangler pages deploy dist --project-name=phaestus
```

The `pnpm deploy` script may fail due to PATH issues - use the explicit command above.

**Cloudflare Resources**:
- D1 Database: `phaestus`
- R2 Bucket: `phaestus-assets`
- Secrets: `OPENROUTER_API_KEY`, `TEXT_MODEL_SLUG`, `IMAGE_MODEL_SLUG`

## Commands

All commands run from `frontend/`:

```bash
# Development
pnpm dev           # Frontend only (port 5173, no API)
pnpm dev:full      # Full stack with D1/R2 (port 8788)

# Testing
pnpm test          # Watch mode
pnpm test:run      # Single run
pnpm test:coverage # With coverage

# Build & Deploy
pnpm build         # TypeScript + Vite build
# Deploy: see explicit wrangler command above

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

## Architecture

### The Spec Pipeline (Core Flow)

The app guides users through a 5-step process implemented in `src/pages/SpecPage.tsx` (1073 lines):

| Step | Status Value | Component | What Happens |
|------|--------------|-----------|--------------|
| 0 | `analyzing` | FeasibilityStep | LLM scores idea, checks against available components |
| 1 | `refining` | RefinementStep | Iterative Q&A to lock down decisions (2-3 rounds) |
| 2 | `generating` | BlueprintStep | 4 product renders generated in parallel |
| 3 | `selecting` | SelectionStep | User picks design, can regenerate with feedback |
| 4 | `finalizing` | FinalizationStep | LLM generates locked spec with BOM |
| 5 | `complete` | → SpecViewerPage | Final spec displayed |

**Project Status Values**: `draft`, `analyzing`, `refining`, `generating`, `selecting`, `finalizing`, `complete`, `rejected`

**Hard Rejections**: FPGA, >24V, safety-critical, healthcare, complex RF, precision analog

### Available Hardware Components

The feasibility prompt (`src/prompts/feasibility.ts`) defines what can be built:

- **MCU**: ESP32-C6 (WiFi 6, BLE 5.3, Zigbee/Thread)
- **Sensors**: BME280, SHT40, LIS3DH, VEML7700, VL53L0X, PIR
- **Power**: LiPo+TP4056, buck converter (7-24V), 2xAA/AAA boost, CR2032
- **Outputs**: WS2812B LEDs, piezo buzzer, relay, DRV8833 motor driver
- **Displays**: 0.96" OLED (I2C), SPI LCD
- **Input**: Up to 4 buttons, rotary encoder

When creating example prompts, use ONLY these components or the project will be rejected.

### File Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── SpecPage.tsx      # Main pipeline (1073 lines, 5 nested components)
│   │   ├── NewProjectPage.tsx # Project creation with example prompts
│   │   ├── ProjectsPage.tsx   # Project list
│   │   └── SpecViewerPage.tsx # Completed spec display
│   ├── prompts/               # LLM prompt templates
│   │   ├── feasibility.ts     # Component matching, scoring
│   │   ├── refinement.ts      # Iterative Q&A
│   │   ├── blueprint.ts       # 4 image prompt variations
│   │   └── finalSpec.ts       # BOM generation
│   ├── services/llm.ts        # LLM client (chat + stream)
│   ├── stores/auth.ts         # Zustand auth state
│   └── db/schema.ts           # Types + row transforms
├── functions/api/
│   ├── _middleware.ts         # Auth (session cookie validation)
│   ├── auth/                  # login, logout, me
│   ├── llm/
│   │   ├── chat.ts            # Non-streaming (OpenRouter + Gemini)
│   │   ├── stream.ts          # SSE streaming
│   │   ├── image.ts           # Image generation
│   │   └── pricing.ts         # Cost calculations
│   ├── projects/              # CRUD
│   └── admin/logs.ts          # Debug logs (admin only)
└── migrations/                # 6 SQL migrations
```

### Database Schema

Key tables in D1:

- **users**: id, username, password_hash (PLAINTEXT - known issue), is_admin
- **sessions**: id, user_id, expires_at (7-day expiry)
- **projects**: id, user_id, name, status, spec (JSON ProjectSpec)
- **pcb_blocks**: 21 pre-seeded circuit modules
- **llm_requests**: Usage tracking with cost_usd
- **debug_logs**: Admin logging

### LLM Integration

All requests proxy through `/api/llm/*`:
- Supports OpenRouter and Google Gemini APIs
- Model selection: request → env var → DB setting → hardcoded default
- Gemini requires message format conversion (system → user+model ack)
- Cost tracked per request in `llm_requests` table

**Response Parsing**: Uses regex `/\{[\s\S]*\}/` to extract JSON from LLM responses. Fragile but works.

### Auth

- Session cookies, 7-day expiry, HttpOnly
- Default user: `mike`/`mike` (admin)
- Public routes: `/api/auth/*`, `/api/blocks`, `/api/images`

## Common Issues & Patterns

### Race Conditions in SpecPage

The step calculation and render conditions can race with async mutations. Pattern:
- `currentStep` is calculated from `spec` state (immediate)
- `project.status` comes from server (async via mutation + query invalidation)
- **Fix**: Don't gate renders on `project.status` when `currentStep` already captures the logic

Example fix (line 1043):
```jsx
// BAD: Race condition - status lags behind step
{currentStep === 2 && project.status === 'generating' && <BlueprintStep />}

// GOOD: Step calculation already handles it
{currentStep === 2 && <BlueprintStep />}
```

### LLM Response Handling

```typescript
// Pattern used throughout SpecPage
const response = await llm.chat({ messages, temperature: 0.3, projectId })
const jsonMatch = response.content.match(/\{[\s\S]*\}/)
if (!jsonMatch) throw new Error('No JSON in response')
const result = JSON.parse(jsonMatch[0])
```

### Image Generation

```typescript
// 4 variations generated in parallel
const prompts = buildBlueprintPrompts(description, decisions, feasibility)
prompts.forEach((prompt, i) => {
  generateImage(prompt).then(url => setBlueprints(...))
})
```

### State Updates in Pipeline Steps

Each step component receives `onComplete` callback. Pattern:
1. Component does async work (LLM call, image gen)
2. On success, calls `onComplete(result)`
3. Parent updates mutation, which invalidates query
4. Query refetch triggers re-render with new step

## Testing

Vitest with 90%+ coverage target on:
- `src/prompts/*.ts` - Prompt template builders
- `src/db/schema.ts` - Row transforms
- `src/services/llm.ts` - LLM client
- `src/stores/auth.ts` - Auth state
- `functions/lib/logger.ts` - Debug logger
- `functions/api/llm/pricing.ts` - Cost calculations

API handlers excluded (need miniflare mocking).

## Known Technical Debt

1. **Plaintext passwords** - `migrations/0003` stores passwords as plaintext
2. **SpecPage size** - 1073 lines, 5 nested components, should be split
3. **Regex JSON parsing** - Fragile, should use schema validation (Zod)
4. **Streaming token counts** - Not tracked, logged as 0
5. **No retry logic** - LLM failures not retried
6. **Duplication** - chat.ts and stream.ts duplicate Gemini format conversion

## Quick Reference

| What | Where |
|------|-------|
| Example prompts | `src/pages/NewProjectPage.tsx` lines 6-13 |
| Available components | `src/prompts/feasibility.ts` lines 10-45 |
| Step calculation | `src/pages/SpecPage.tsx` lines 893-901 |
| Step rendering | `src/pages/SpecPage.tsx` lines 1009-1067 |
| LLM chat | `functions/api/llm/chat.ts` |
| Image generation | `functions/api/llm/image.ts` |
| Auth middleware | `functions/api/_middleware.ts` |
| Project CRUD | `functions/api/projects/` |
