# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

All commands run from `frontend/` (monorepo with single package):

```bash
# Development
pnpm dev           # Frontend only (port 5173, no API)
pnpm dev:full      # Full stack with D1/R2 (port 8788)

# Testing
pnpm test          # Watch mode
pnpm test:run      # Single run
pnpm test:coverage # With coverage
pnpm test src/prompts/feasibility.test.ts  # Run single test file

# Build & Deploy
pnpm build         # TypeScript + Vite build
pnpm check         # Run all CI checks (typecheck, lint, test, build)
pnpm deploy        # Check + deploy to Cloudflare Pages

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

**Path Aliases**: `@/` resolves to `frontend/src/`. For functions, use `@/../functions/` (e.g., `import { extractAndValidateJson } from '@/../functions/lib/json'`).

## Architecture

### The Spec Pipeline (Core Flow)

The app guides users through a 5-step process implemented in `src/pages/SpecPage.tsx` (362 lines, orchestration only). Step components are in `src/components/spec-steps/`:

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

### Key Directories

- `src/pages/` - Route components (SpecPage.tsx orchestrates the pipeline)
- `src/components/spec-steps/` - Individual step components (Feasibility, Refinement, Blueprint, Selection, Finalization)
- `src/prompts/` - LLM prompt templates (feasibility, refinement, blueprint, firmware, enclosure)
- `src/services/` - LLM client, orchestrator, PCB merging
- `src/stores/` - Zustand state (auth, workspace, orchestrator)
- `functions/api/` - Cloudflare Pages Functions (auth, llm, projects, admin)
- `functions/lib/` - Shared utilities (gemini.ts, logger.ts, json.ts)
- `migrations/` - D1 SQL migrations

### Database Schema

Key tables in D1:

- **users**: id, username, password_hash (bcrypt, auto-upgraded from plaintext on login), is_admin, control_mode, is_approved
- **sessions**: id, user_id, expires_at (7-day sliding expiry, extended on activity)
- **projects**: id, user_id, name, description, status, spec (JSON ProjectSpec)
- **pcb_blocks**: 21 pre-seeded circuit modules
- **llm_requests**: Usage tracking with cost_usd, latency_ms
- **debug_logs**: Admin logging (category, level, request_id for correlation)
- **conversations**: project_id, messages (JSON), timestamps
- **gallery_visibility**: project_id, visibility (public/private/anonymous)

### LLM Integration

All requests proxy through `/api/llm/*`:
- Supports OpenRouter and Google Gemini APIs
- Model selection: request → env var → DB setting → hardcoded default
- Gemini requires message format conversion (system → user+model ack)
- Cost tracked per request in `llm_requests` table

**Response Parsing**: Uses regex `/\{[\s\S]*\}/` to extract JSON from LLM responses. Fragile but works.

### Auth

- Session cookies, 7-day expiry, HttpOnly
- WorkOS AuthKit OAuth integration available
- Default user: `mike`/`mike` (admin)
- User approval workflow (is_approved flag)
- Control modes: vibe_it, fix_it, design_it
- Public routes: `/api/auth/*`, `/api/blocks`, `/api/images`, `/api/gallery/*`

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

**NOTE**: Race conditions have been largely resolved by the SpecPage refactor. Step components now receive explicit props and callbacks, reducing tight coupling to server state.

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

Vitest with 648 tests, ~63% overall coverage. Target 90%+ on core modules.

**Fully Tested (90%+)**:
- `src/prompts/*.ts` - All prompt template builders (96.51%)
- `src/db/schema.ts` - Row transforms (100%)
- `src/stores/auth.ts` - Auth state (100%)
- `src/stores/workspace.ts` - Workspace state (100%)
- `functions/lib/*.ts` - Logger, Gemini, JSON utilities (93.51%)
- `functions/api/llm/pricing.ts` - Cost calculations (100%)

**Partially Tested**:
- `src/services/llm.ts` - LLM client (61%)
- `src/services/orchestrator.ts` - Multi-agent orchestration (34%)
- `src/services/pcb-merge.ts` - KiCad block merging (46%)

**Not Tested**:
- `src/lib/openscadRenderer.ts` - WASM wrapper (0%)
- API handlers - Need miniflare mocking

## Known Technical Debt

### Fixed Issues
- ~~**Plaintext passwords**~~ - FIXED: bcrypt with auto-upgrade on login
- ~~**Streaming token counts**~~ - FIXED: Estimated at ~4 chars/token
- ~~**No retry logic**~~ - FIXED: Exponential backoff (3 attempts, 1s/2s delays), 4xx errors fail immediately
- ~~**Duplication**~~ - FIXED: Shared `functions/lib/gemini.ts` utility
- ~~**JSON Parsing Fragility**~~ - FIXED: Zod validation utilities in `functions/lib/json.ts` (see below)
- ~~**Memory Leak in Orchestrator**~~ - FIXED: `trimConversationHistory()` limits to 15 messages
- ~~**API Key Exposure**~~ - FIXED: Error responses sanitized in `image.ts`
- ~~**Session ID Regex**~~ - FIXED: UUID format validation in `_middleware.ts`
- ~~**SpecPage size**~~ - FIXED: Split into 8 components (1253 → 362 lines, 71% reduction)
- ~~**Missing Input Validation**~~ - FIXED: Server-side length limits enforced
- ~~**No Rate Limiting**~~ - FIXED: 5 attempts/15min window, 30min lockout on login
- ~~**Type Unsafety**~~ - FIXED: Added runtime guards in SpecPage handlers
- ~~**Missing Error Boundary**~~ - FIXED: ErrorBoundary component at app root
- ~~**No Request Size Limits**~~ - FIXED: 10MB general, 5MB for specs
- ~~**Session Cleanup**~~ - FIXED: Admin endpoint `/api/admin/cleanup-sessions`

### Remaining Issues

#### Medium Priority
1. **Orchestrator complexity** - `src/services/orchestrator.ts` (1641 lines) needs module split
2. **Standardize error logging** - Replace console.error with logger utility throughout (68 calls to migrate)
3. **Use extractAndValidateJson** - Migrate remaining JSON parsing in step components

#### Low Priority
4. **Incomplete I2C Validation** - Regex-based firmware validation misses variable-stored addresses
5. **Missing Pagination Bounds** - Large offset values can cause expensive queries

## Zod JSON Validation

Safe JSON parsing with schema validation is available in `functions/lib/json.ts`:

```typescript
import { extractAndValidateJson } from '@/../functions/lib/json'
import { FeasibilityResponseSchema } from '@/schemas/llm-responses'

// Parse and validate LLM response in one step
const result = extractAndValidateJson(response.content, FeasibilityResponseSchema)
if (!result.success) {
  console.error('Parse error:', result.error) // Detailed validation errors
  return
}
const data = result.data // Fully typed!
```

**Available functions:**
- `extractAndValidateJson<T>(content, schema)` - Extract JSON from LLM responses with validation
- `safeJsonParseWithSchema<T>(json, schema)` - Parse pure JSON with validation
- `extractJsonFromContent<T>(content)` - Legacy extraction without validation (deprecated)

**Pre-built schemas:** See `src/schemas/llm-responses.ts` for common response types.

## Quick Reference

| What | Where |
|------|-------|
| Example prompts | `src/pages/NewProjectPage.tsx` lines 6-13 |
| Available components | `src/prompts/feasibility.ts` lines 10-45 |
| Step components | `src/components/spec-steps/` |
| Step orchestration | `src/pages/SpecPage.tsx` |
| Error boundary | `src/components/ErrorBoundary.tsx` |
| LLM chat | `functions/api/llm/chat.ts` |
| Image generation | `functions/api/llm/image.ts` |
| Auth middleware | `functions/api/_middleware.ts` |
| Rate limiting | `functions/api/auth/login.ts` |
| Session cleanup | `functions/api/admin/cleanup-sessions.ts` |
| Project CRUD | `functions/api/projects/` |
| Gemini format util | `functions/lib/gemini.ts` |
| Logger utility | `functions/lib/logger.ts` |
| JSON validation | `functions/lib/json.ts` |
| LLM response schemas | `src/schemas/llm-responses.ts` |
| Pricing calculations | `functions/api/llm/pricing.ts` |
| Admin logs API | `functions/api/admin/logs.ts` |

## Cost Insights

Image generation dominates costs at ~2000x the price of text completions:
- `gemini-3-flash-preview`: ~$0.000001/request
- `gemini-2.5-flash-image`: $0.002/image

Consider caching images aggressively and batching requests.

## Workspace Pipeline

Post-spec stages for hardware generation:

| Stage | Key Files | What Happens |
|-------|-----------|--------------|
| PCB | `pages/workspace/PCBStageView.tsx`, `services/pcb-merge.ts` | Block selection, KiCad schematic merging |
| Enclosure | `pages/workspace/EnclosureStageView.tsx`, `lib/openscadRenderer.ts` | OpenSCAD generation, STL preview |
| Firmware | `pages/workspace/FirmwareStageView.tsx`, `prompts/firmware.ts` | ESP32 code generation, Monaco editor |
| Export | `pages/workspace/ExportStageView.tsx` | Spec MD/JSON, BOM CSV, ZIP downloads |

**Orchestrator** (`services/orchestrator.ts`, 1641 lines): Multi-agent system that can autonomously progress through stages using tools defined in `prompts/orchestrator.ts`.

## API Endpoints

**LLM** (`/api/llm/*`):
- `POST /api/llm/chat` - Main chat endpoint with retry logic (395 LOC)
- `POST /api/llm/image` - Image generation with cost tracking (216 LOC)
- `POST /api/llm/stream` - Server-sent events streaming (320 LOC)
- `POST /api/llm/tools` - Gemini function calling (691 LOC)

**Projects** (`/api/projects/*`):
- `GET /api/projects` - List with pagination and status filter
- `POST /api/projects` - Create new project
- `GET /api/projects/{id}` - Get project details
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

**Gallery** (`/api/gallery/*`):
- `GET /api/gallery/index` - Public project gallery
- `GET /api/gallery/{id}` - Get public project details

**Admin** (`/api/admin/*`):
- `GET /api/admin/logs` - View debug logs
- `POST /api/admin/cleanup-sessions` - Remove expired sessions
- `GET /api/admin/users` - User management
