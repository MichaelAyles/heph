# AGENTS.md

## Purpose
This file is the operating guide for AI coding agents working in this repository.

## Project Snapshot
- Name: PHAESTUS
- Goal: Transform natural-language product ideas into manufacturable hardware and firmware
- Deployment model: Frontend-heavy SPA + Cloudflare Pages Functions + D1/R2 + two microservices

## Repo Layout
- `frontend/`: Main app (React + TypeScript + Cloudflare Functions)
- `kicad-service/`: KiCad CLI microservice (`/process`, `/health`)
- `platformio-service/`: Firmware compile microservice (`/compile`, `/boards`, `/health`)
- Root docs: `CLAUDE.md`, `README.md`, `codereview.md`

## Primary Architecture
- Browser does most heavy work (Gerber merge, panelization, BOM/doc processing, preview flows)
- Functions layer is a thin proxy for auth, D1/R2 access, logging, and external API calls
- No long-lived backend server; production is Cloudflare + microservices

## Core User Flow
Workspace stages in order:
1. `spec`
2. `pcb`
3. `enclosure`
4. `firmware`
5. `export`
6. `files` (always accessible once spec exists)

Spec pipeline implementation lives in `frontend/src/pages/workspace/SpecStageView.tsx`.

## Key Code Paths
- App routing: `frontend/src/App.tsx`
- Workspace shell: `frontend/src/components/workspace/WorkspaceLayout.tsx`
- Workspace state/gating: `frontend/src/stores/workspace.ts`
- Domain/db types: `frontend/src/db/schema.ts`
- LangGraph runtime (UI-side): `frontend/src/services/langgraph/`
- Functions auth middleware: `frontend/functions/api/_middleware.ts`
- LLM chat endpoint: `frontend/functions/api/llm/chat.ts`
- Safe JSON helpers: `frontend/functions/lib/json.ts`

## Dev Commands
Run from `frontend/` unless explicitly working on microservices.
- `pnpm dev:full` - full local stack (Pages + D1/R2 bindings)
- `pnpm check` - required quality gate (`typecheck + test + build`)
- `pnpm test:run` - tests once
- `pnpm db:migrate` - local D1 migrations

Microservices:
- `kicad-service`: `npm run build`, then Docker compose or `npm start`
- `platformio-service`: `npm run build`, then Docker compose

## Hard Rules
- Do not commit changes when `pnpm check` fails
- For files under `frontend/functions/`: avoid `@/` import aliases in any dependency chain bundled by Wrangler; use relative imports
- Preserve stage ordering/gating semantics in `workspace.ts`
- Prefer schema-validated JSON extraction (`extractAndValidateJson`) over ad-hoc parsing in new/updated LLM logic
- Keep auth/session behavior aligned with middleware contract in `frontend/functions/api/_middleware.ts`

## Git Workflow Policy
- Default workflow: commit and push directly to `main`
- Do not create routine feature branches or PR-only branches for normal iteration
- Use a branch only for clearly breaking/high-risk experiments that may need isolation or rollback
- If a branch is used for a breaking experiment, merge quickly and delete it after completion

## Linear Tracking
**All features must be tracked in Linear**, no exceptions. This applies even if:
- The feature is small or completed quickly
- The request came directly from the user (not from an existing Linear issue)
- The work is already in progress or done

**Workflow**:
1. Before starting work on a feature, create a Linear issue (or find the existing one) and set it to "In Progress"
2. When the feature is complete, mark the Linear issue as "Done"
3. If a feature was completed without a Linear issue, create one after the fact and immediately mark it "Done"

**Project**: This repo is tracked under the **Mike Ayles / Heph** project in Linear. Do not look at or interact with other Linear projects unless explicitly asked.

## Editing Priorities
When making changes, prioritize:
1. Correctness of spec/workspace progression
2. API compatibility (`frontend/functions/api/**`)
3. Artifact integrity for PCB/enclosure/firmware outputs
4. Logging and debuggability (admin/debug flows)

## Testing Expectations
At minimum for meaningful changes:
1. Run targeted tests for touched areas
2. Run `pnpm check` in `frontend/` before final handoff
3. If `pnpm check` cannot run, explicitly report why

Relevant test-rich areas include:
- `frontend/src/services/*.test.ts`
- `frontend/src/stores/*.test.ts`
- `frontend/src/db/schema.test.ts`
- `frontend/functions/lib/*.test.ts`

## Practical Notes For Agents
- Prefer changing existing patterns over introducing new architectural styles
- Keep Typescript types tight; this repo already centralizes many domain types in `frontend/src/db/schema.ts`
- Use small, reviewable diffs; avoid broad refactors unless requested
- For LLM endpoints, preserve request logging, token/cost accounting, and conversation persistence behaviors

## Quick Start Checklist For New Tasks
1. Read `CLAUDE.md` and relevant local README(s)
2. Identify impacted stage(s) and API route(s)
3. Update types first when changing payload/data shape
4. Implement minimal diff
5. Run tests/checks
6. Summarize behavior changes and residual risks
