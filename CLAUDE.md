# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PHAESTUS is an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware designs. Users describe what they want to build, and the system guides them through feasibility analysis, requirement refinement, visual design selection, and final specification generation.

**Stack**: React 19 + TypeScript, Cloudflare Pages Functions, D1 (SQLite), R2 storage, Tailwind CSS 4, Zustand, TanStack Query

### Design Philosophy

**Module-Based Hardware Design**: AI selects from pre-validated circuit blocks rather than generating novel circuits. This gives ~100% success rate vs ~70% for AI-generated circuits, with tractable validation via interface type-checking.

**Deterministic Grid Layout**: 12.7mm grid with pre-routed bus interfaces eliminates autorouting failures and enables predictable board dimensions with parametric enclosures.

## Commands

All commands run from `frontend/` (monorepo with single package):

```bash
pnpm dev:full      # Full stack with D1/R2 (port 8788)
pnpm check         # Run all CI checks (typecheck, lint, test, build)
pnpm test:run      # Single test run
```

## Pre-Commit Checklist

**CRITICAL: NEVER commit when `pnpm check` fails.**

```bash
cd frontend && pnpm check
```

This runs `typecheck && test:run && build` which matches CI.

**Functions Import Rules**:
- Files in `functions/` are bundled separately by wrangler, which does NOT resolve `@/` aliases
- If a `src/` file is imported by functions code (directly or transitively), it MUST use relative imports
- Example: `functions/lib/block-validator.ts` imports from `../../src/schemas/block` (relative), not `@/schemas/block`

## Architecture

### The Spec Pipeline (Core Flow)

5-step process in `src/pages/SpecPage.tsx`. Step components in `src/components/spec-steps/`:

| Step | Status | Component | What Happens |
|------|--------|-----------|--------------|
| 0 | `analyzing` | FeasibilityStep | LLM scores idea against available components |
| 1 | `refining` | RefinementStep | Iterative Q&A (2-3 rounds) |
| 2 | `generating` | BlueprintStep | 4 product renders in parallel |
| 3 | `selecting` | SelectionStep | User picks design |
| 4 | `finalizing` | FinalizationStep | Locked spec with BOM |

**Project Status Values**: `draft`, `analyzing`, `refining`, `generating`, `selecting`, `finalizing`, `complete`, `rejected`

**Hard Rejections**: FPGA, >24V, safety-critical, healthcare, complex RF, precision analog

### Available Hardware Components

Defined in `src/prompts/feasibility.ts`:

- **MCU**: ESP32-C6 (WiFi 6, BLE 5.3, Zigbee/Thread)
- **Sensors**: BME280, SHT40, LIS3DH, VEML7700, VL53L0X, PIR
- **Power**: LiPo+TP4056, buck converter (7-24V), 2xAA/AAA boost, CR2032
- **Outputs**: WS2812B LEDs, piezo buzzer, relay, DRV8833 motor driver
- **Displays**: 0.96" OLED (I2C), SPI LCD
- **Input**: Up to 4 buttons, rotary encoder

### Key Directories

```
src/pages/                    Route components
src/pages/workspace/          Workspace stages (Spec, PCB, Enclosure, Firmware, Export)
src/components/spec-steps/    Pipeline step components
src/prompts/                  LLM prompt templates
src/services/                 LLM client, PCB/Gerber merging
src/services/langgraph/       State machine (state.ts, graph.ts, checkpointer.ts)
src/lib/tokn/                 KiCad S-expression parser
src/stores/                   Zustand state
functions/api/                Cloudflare Pages Functions
functions/lib/                Shared utilities (gemini.ts, logger.ts, json.ts)
```

### Database Schema (D1)

**Core**: `users`, `sessions`, `projects`, `pcb_blocks`, `llm_requests`, `conversations`
**Orchestrator**: `orchestrator_prompts`, `orchestrator_edges`, `orchestrator_hooks`
**Debug**: `debug_breakpoints` (for debug_it mode)

### Auth

- Session cookies, 7-day expiry, HttpOnly
- Default user: `mike`/`mike` (admin)
- Control modes: `vibe_it`, `fix_it`, `design_it`, `debug_it` (admin-only)

## Patterns

### LLM Response Handling

```typescript
const response = await llm.chat({ messages, temperature: 0.3, projectId })
const jsonMatch = response.content.match(/\{[\s\S]*\}/)
if (!jsonMatch) throw new Error('No JSON in response')
const result = JSON.parse(jsonMatch[0])
```

Better: Use `extractAndValidateJson` from `functions/lib/json.ts` with Zod schemas.

### Step Component Pattern

Each step receives `onComplete` callback:
1. Component does async work (LLM call, image gen)
2. On success, calls `onComplete(result)`
3. Parent updates mutation → query invalidation → re-render

## Blog System

40 posts in `frontend/public/blogs/blogXXXX/`. Manifest at `src/data/blog-manifest.json`.

**Adding a Blog**:
1. Create `frontend/public/blogs/blogXXXX/blog.md`
2. Add images to same directory
3. Update `frontend/src/data/blog-manifest.json` (newest first)

## Deployment

**Live**: https://phaestus.app

CI/CD via GitHub Actions on push to `main`: tests → build → Cloudflare Pages deploy.

**Manual**: `cd frontend && pnpm build && pnpm exec wrangler pages deploy dist --project-name=phaestus`

## Technical Debt

**Remaining**:
- Standardize error logging (replace console.error with logger utility)
- Migrate remaining JSON parsing to `extractAndValidateJson`
- Incomplete I2C validation (regex misses variable-stored addresses)

## Manufacturing System

### Gerber Merging (`src/services/gerber-merge.ts`)

```typescript
const GRID_SIZE_MM = 12.7        // 0.5" grid unit
const VERTICAL_OVERLAP_MM = 1.0  // Bus connector overlap
```

Blocks stacked by actual height from edge cuts layer, not fixed grid. 1mm overlap for bus connector pads.

### Block Requirements

Each block needs: `.kicad_sch`, `.kicad_pcb`, `.step`, `gerbers.zip`, `block.json`

Schema in `src/schemas/block.ts`: metadata, electrical (interfaces, power), physical (connectors).

### Remote-Type Blocks

Cable-connected blocks (`isRemote: true`) generate separate board artifacts stored in `pcbArtifacts.remoteType*` fields.

## Quick Reference

| What | Where |
|------|-------|
| Example prompts | `src/pages/NewProjectPage.tsx:6-13` |
| Available components | `src/prompts/feasibility.ts:10-45` |
| LLM chat API | `functions/api/llm/chat.ts` |
| Auth middleware | `functions/api/_middleware.ts` |
| Block schema | `src/schemas/block.ts` |
| Gerber merger | `src/services/gerber-merge.ts` |
| LangGraph state | `src/services/langgraph/state.ts` |
| Debug breakpoint | `src/components/debug/DebugBreakpointModal.tsx` |
