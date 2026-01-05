# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

PHAESTUS is an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware designs. Users describe what they want to build, and the system guides them through feasibility analysis, requirement refinement, visual design selection, and final specification generation.

**Stack**: React 19 + TypeScript, Cloudflare Pages Functions, D1 (SQLite), R2 storage, Tailwind CSS 4, Zustand, TanStack Query

### Design Philosophy

**Module-Based Hardware Design**: AI selects from pre-validated circuit blocks rather than generating novel circuits. This gives ~100% success rate vs ~70% for AI-generated circuits, with tractable validation via interface type-checking.

**Deterministic Grid Layout**: 12.7mm grid with pre-routed bus interfaces eliminates autorouting failures and enables predictable board dimensions with parametric enclosures.

## Deployment

**Live**: https://phaestus.app

**CI/CD**: Deployments happen automatically via GitHub Actions on push to `main`. The workflow:
1. Runs tests (`pnpm test:run`)
2. Builds (`pnpm build`)
3. Deploys to Cloudflare Pages (from `frontend/` directory to pick up `wrangler.toml` and `functions/`)

**Manual deployment** (if needed):
```bash
cd frontend && pnpm build && pnpm exec wrangler pages deploy dist --project-name=phaestus
```

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
├── functions/
│   ├── api/
│   │   ├── _middleware.ts     # Auth (session cookie validation + session extension)
│   │   ├── auth/              # login (bcrypt), logout, me
│   │   ├── llm/
│   │   │   ├── chat.ts        # Non-streaming (OpenRouter + Gemini)
│   │   │   ├── stream.ts      # SSE streaming with token estimation
│   │   │   ├── image.ts       # Image generation with 60s timeout
│   │   │   └── pricing.ts     # Cost calculations
│   │   ├── projects/          # CRUD
│   │   ├── settings/usage.ts  # Usage statistics endpoint
│   │   └── admin/logs.ts      # Debug logs (admin only)
│   └── lib/
│       ├── gemini.ts          # Shared Gemini format conversion
│       └── logger.ts          # Debug logging utility
└── migrations/                # SQL migrations
```

### Database Schema

Key tables in D1:

- **users**: id, username, password_hash (bcrypt, auto-upgraded from plaintext on login), is_admin
- **sessions**: id, user_id, expires_at (7-day sliding expiry, extended on activity)
- **projects**: id, user_id, name, status, spec (JSON ProjectSpec)
- **pcb_blocks**: 21 pre-seeded circuit modules
- **llm_requests**: Usage tracking with cost_usd
- **debug_logs**: Admin logging (category, level, request_id for correlation)

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

## Development Workflow

Two servers running in dev:
- **Vite (5173)** - Frontend with hot reload, proxies `/api/*` to wrangler
- **Wrangler Pages (8788)** - API functions with D1/R2 bindings

Use `pnpm dev:full` to start both together.

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

### Blueprint Regeneration with Feedback

Users can click a blueprint to enter detail view, provide feedback, and regenerate just that image:
```typescript
const newPrompt = `${originalPrompt} User feedback: ${feedback}`
const newUrl = await generateImage(newPrompt)
// Update just the one blueprint in the array
```

### Debug Logging

Use the logger utility for admin-visible logs:
```typescript
import { createLogger } from '../lib/logger'

const logger = createLogger(env, user, requestId)
await logger.llm('Chat completed', { model, tokens, latencyMs })
await logger.error('llm', 'API failed', { error: errorText })
```

Categories: `general`, `api`, `auth`, `llm`, `project`, `image`, `db`, `middleware`
Levels: `debug`, `info`, `warn`, `error`

Logs are stored in D1 for admin users and viewable via `GET /api/admin/logs`.

### Guardrails

- **Max refinement rounds**: 5 question/answer cycles, then proceeds to blueprints
- **Input length limit**: 2000 characters on description (~500 tokens)
- **Image timeout**: 60 seconds per image generation
- **LLM retry**: 3 attempts with exponential backoff (1s, 2s), 4xx errors fail immediately

## Testing

Vitest with 525+ tests, ~70% coverage. Target 90%+ on core modules.

**Fully Tested (90%+)**:
- `src/prompts/*.ts` - All prompt template builders (96.51%)
- `src/db/schema.ts` - Row transforms (100%)
- `src/stores/auth.ts` - Auth state (100%)
- `src/stores/workspace.ts` - Workspace state (100%)
- `functions/lib/*.ts` - Logger, Gemini, JSON utilities (93.51%)
- `functions/api/llm/pricing.ts` - Cost calculations (100%)

**Partially Tested**:
- `src/services/llm.ts` - LLM client (82%)
- `src/services/orchestrator.ts` - Multi-agent orchestration (49%)
- `src/services/pcb-merge.ts` - KiCad block merging (tested)

**Not Tested**:
- `src/lib/openscadRenderer.ts` - WASM wrapper (0%)
- API handlers - Need miniflare mocking

## Known Technical Debt

### Fixed Issues
- ~~**Plaintext passwords**~~ - FIXED: bcrypt with auto-upgrade on login
- ~~**Streaming token counts**~~ - FIXED: Estimated at ~4 chars/token
- ~~**No retry logic**~~ - FIXED: Exponential backoff (3 attempts, 1s/2s delays), 4xx errors fail immediately
- ~~**Duplication**~~ - FIXED: Shared `functions/lib/gemini.ts` utility

### Critical (Address Immediately)
1. **JSON Parsing Fragility** - Regex `/\{[\s\S]*\}/` is too greedy; use Zod validation instead
2. **Memory Leak in Orchestrator** - `conversationHistory` grows unbounded (up to 100 iterations)
3. **API Key Exposure** - Error responses in `image.ts` can leak upstream API errors
4. **Session ID Regex** - Cookie parsing at `_middleware.ts:36` doesn't validate UUID format

### High Priority
5. **SpecPage size** - 1073 lines, 5 nested components, should be split
6. **Race Conditions** - State updates in SpecPage can race with async mutations
7. **Missing Input Validation** - Description length not enforced server-side (2000 char limit)
8. **No Rate Limiting** - Login endpoint vulnerable to brute force
9. **Type Unsafety** - Non-null assertions (`!`) without runtime checks throughout

### Medium Priority
10. **Missing Error Boundary** - No React Error Boundary wrapper in App.tsx
11. **No Request Size Limits** - Large JSON payloads can exhaust memory
12. **Incomplete I2C Validation** - Regex-based firmware validation misses variable-stored addresses
13. **Missing Pagination Bounds** - Large offset values can cause expensive queries
14. **Session Cleanup** - No cron/job to delete expired sessions from D1

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
| Gemini format util | `functions/lib/gemini.ts` |
| Logger utility | `functions/lib/logger.ts` |
| Pricing calculations | `functions/api/llm/pricing.ts` |
| Admin logs API | `functions/api/admin/logs.ts` |

## Cost Insights

Image generation dominates costs at ~2000x the price of text completions:
- `gemini-3-flash-preview`: ~$0.000001/request
- `gemini-2.5-flash-image`: $0.002/image

Consider caching images aggressively and batching requests.

## Workspace Pipeline Implementation Status

### Completed Phases

| Phase | Feature | Status | Notes |
|-------|---------|--------|-------|
| 1 | Workspace UI Architecture | ✅ Complete | Split pane layout, stage navigation |
| 2 | User Control Modes | ✅ Complete | Vibe It, Fix It, Design It modes |
| 3 | PCB Stage Foundation | ✅ Complete | KiCanvas viewer, Block Selector |
| 4 | PCB Block Merging | ✅ Complete | kicadts integration for schematic merging |
| 5 | Enclosure Generation | ✅ Complete | OpenSCAD WASM + React Three Fiber STL viewer |
| 6 | Firmware Generation | ✅ Complete | AI-generated ESP32 firmware scaffolding |

### Remaining Phases

| Phase | Feature | Notes |
|-------|---------|-------|
| 7 | Firmware Frontend | Monaco editor + file tree + compile output |
| 8 | Multi-Agent Orchestration | Agent interfaces, context manager, validation loops |
| 9 | Export & Polish | Gerber generation, BOM export, PDF spec sheets |

### Workspace-Related Files

```
frontend/src/
├── components/
│   ├── workspace/          # WorkspaceLayout, StageTabs, SplitPane
│   ├── pcb/                # BlockSelector, KiCanvasViewer
│   └── enclosure/          # STLViewer (React Three Fiber)
├── pages/workspace/        # Stage views (PCB, Enclosure, Firmware, Export)
├── services/
│   ├── pcb-merge.ts        # kicadts-based schematic merging
│   └── orchestrator.ts     # Multi-agent tool orchestration (914 lines)
├── lib/openscadRenderer.ts # OpenSCAD WASM wrapper
├── prompts/
│   ├── enclosure.ts        # OpenSCAD generation prompt
│   ├── firmware.ts         # ESP32 firmware prompt
│   ├── orchestrator.ts     # Agent tool definitions
│   ├── validation.ts       # Cross-stage validation rules
│   └── block-selection.ts  # PCB block auto-selection
└── stores/
    ├── workspace.ts        # Workspace UI state (stages, split panes)
    └── orchestrator.ts     # Orchestration state management
```
