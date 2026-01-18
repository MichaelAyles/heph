# PHAESTUS Code Review & Technical Debt

**Last Review**: January 18, 2026
**Overall Status**: Production-ready with identified issues
**Test Coverage**: 648 tests (all passing)

---

## Summary

The codebase is mature and production-ready with solid engineering practices:
- Full 5-step spec pipeline (feasibility → refinement → blueprints → selection → finalization)
- Multi-stage workspace (PCB, Enclosure, Firmware, Export)
- Hardware orchestrator with 8 specialized agents and admin management UI
- Comprehensive LLM integration with retry logic, streaming, and tool calling
- 18 database migrations, WorkOS OAuth, user approval workflow
- 40+ API endpoints operational including orchestrator admin API
- New: BlockViewer component with KiCanvas integration
- New: TOKN KiCad parser for robust file parsing
- New: LLM-assisted block import wizard

### Recent Changes (Jan 17-18, 2026)

| Change | Commit | Impact |
|--------|--------|--------|
| Add BlockViewer with admin integration | fb448fa | Block inspection UI with KiCanvas |
| Add JSON repair for LLM bracket mistakes | ef3992e | Improved LLM output handling |
| Return full block definition from /api/blocks | 4e3ef3a | DRC/solver support |
| Add nofit field to component schema | 6e41bdc | Board interconnect configuration |
| Fix KiCanvasViewer removeChild error | d8cca22 | Separate embed ref pattern |
| Add wireless capabilities to block schema | cb88c7b | WiFi, BLE, Zigbee, etc. |
| Add voltage limits and permanent connections | f08eaf7 | Enhanced block definitions |
| Add CI workflow for PR checks | 3b22e90 | GitHub Actions integration |
| Replace kicadts with TOKN parser | 7d99f5a | KiCad 8 support |
| Add LLM-assisted block import | d03af50 | Automated block.json generation |

---

## Known Issues Status

### Fixed (Confirmed)
| Issue | Resolution |
|-------|------------|
| Plaintext passwords | Bcrypt with auto-upgrade on login |
| JSON parsing fragility | Zod validation utilities in `functions/lib/json.ts` |
| Streaming token counts | Estimated at ~4 chars/token |
| No retry logic | Exponential backoff (3 attempts: 1s, 2s, 4s) |
| API key exposure | Error responses sanitized in `image.ts` |
| Memory leak in orchestrator | `trimConversationHistory()` limits to 15 messages |
| Missing input validation | Server-side length limits (100 chars name, 2000 chars description) |
| Session ID validation | UUID format check in middleware |
| No rate limiting on login | In-memory rate limiting with lockout |
| Missing Error Boundary | ErrorBoundary component at app root |
| No request size limits | Content-Length checks in middleware |
| SpecPage too large | Split into 8 step components (1253 → 362 lines) |
| Session cleanup missing | Admin endpoint for cleanup |
| Blueprint placeholder images | Orchestrator now generates real images |
| Blueprint URL validation | URLs validated before display |
| No orchestrator prompt management | Admin UI with full CRUD for 8 agents |
| Double execution in FeasibilityStep | Use ref instead of state for isRunning guard |
| Double execution in FinalizationStep | Use ref instead of state for isRunning guard |
| onComplete called multiple times (BlueprintStep) | Use refs for hasStarted/hasCompleted guards |
| Unhandled rejection in handleBlueprintRegenerate | Added try-catch with error propagation |
| Unsaved changes lost on file switch (FirmwareStageView) | Auto-save on file switch with isDirty tracking |
| Race condition in generate/regenerate (EnclosureStageView) | AbortController for cancellation |
| File upload failure silently ignored (BlockImportWizard) | Throw error on upload failure |
| KiCanvasViewer loading timeout stale closure | Use ref for timeout, clear on load/error/unmount |

### Remaining Issues

#### Medium Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| Orchestrator `state.history` unbounded growth | `orchestrator.ts:419` | Memory issues on long sessions | 1h |
| Dual state update pattern creates inconsistency | `spec-tools.ts` (multiple) | Local/server state diverge | 2h |
| JSON parsing without Zod validation | `spec-tools.ts`, `enclosure-tools.ts`, `firmware-tools.ts` | Parse failures | 2h |
| Local/server state desync in RefinementStep | `RefinementStep.tsx:12-18` | Stale questions | 1h |
| TOCTOU race in block creation | `functions/api/admin/blocks/index.ts:148-158` | 409 vs 500 error | 1h |
| Direct state mutation in file tree | `FirmwareStageView.tsx:566-574` | React may miss updates | 30m |
| useMemo used for side effects | `PCBStageView.tsx:44-48, 171-175` | Anti-pattern | 30m |
| Silent failures in ExportStageView | `ExportStageView.tsx:310-387, 634-644` | No user feedback | 1h |
| Standardize error logging | 68 console.error/warn calls | Debug difficulty | 2h |
| Use extractAndValidateJson | `spec-steps/*.tsx` | Parse failures | 2h |

#### Low Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| suggestedRevisions lost on navigation | `SpecPage.tsx:121, 164-178` | UX issue on refresh | 1h |
| No mutation pending check | `SpecPage.tsx:150-248` | Rapid click issues | 1h |
| MAX_REFINEMENT_ROUNDS logic conflates decisions/rounds | `RefinementStep.tsx:26-29` | Early/late termination | 30m |
| setTimeout leak in validation status | `EnclosureStageView.tsx:333, 403` | Memory warning | 30m |
| Unhandled WASM load failure | `EnclosureStageView.tsx:102-106` | Generate button enabled despite failure | 30m |
| Incomplete I2C validation | Firmware validation | Edge case bugs | 2h |
| Missing pagination bounds | Projects list endpoint | Expensive queries | 1h |
| trimConversationHistory may cut mid-exchange | `state.ts:20-50` | LLM confusion | 1h |

---

## Architecture

### Key Metrics

| File | Lines | Status |
|------|-------|--------|
| `orchestrator.ts` | 1641 | Could benefit from split |
| `SpecPage.tsx` | 362 | Refactored |
| `SpecStageView.tsx` | 1495 | Monitor |
| `EnclosureStageView.tsx` | 962 | Good |
| `FirmwareStageView.tsx` | 914 | Good |
| `ExportStageView.tsx` | 927 | Good |
| `FeasibilityStep.tsx` | 103 | Good |
| `RefinementStep.tsx` | 240 | Good |
| `BlueprintStep.tsx` | 162 | Good |
| `SelectionStep.tsx` | 112 | Good |
| `FinalizationStep.tsx` | 94 | Good |
| `AdminOrchestratorPage.tsx` | ~200 | Admin orchestrator UI |
| `PromptEditor.tsx` | ~300 | Prompt editing |
| `FlowVisualization.tsx` | ~200 | Workflow graph |
| `BlockImportWizard.tsx` | ~720 | Block import with KiCad parsing |
| `BlockViewer.tsx` | ~400 | Block inspection with KiCanvas |
| `KiCanvasViewer.tsx` | ~160 | KiCad schematic/PCB preview |

### API Endpoints (40+ total)

| Category | Endpoints |
|----------|-----------|
| LLM | chat, image, stream, tools |
| Projects | list, create, get, update, delete, conversations, visibility |
| Auth | login, logout, me, callback, workos |
| Admin | logs, users, cleanup-sessions |
| Admin Orchestrator | prompts (list, create, update, reset), edges, hooks |
| Admin Blocks | list, create, generate, upload, update, delete |
| Orchestrator | prompts (runtime loading) |
| Blocks | list, get, files (schematic, PCB, STEP, thumbnail) |
| Gallery | index, get |
| Settings | settings, usage |

### Database (18 migrations)

**Core Tables:**
- `users` - id, username, password_hash, is_admin, control_mode, is_approved
- `sessions` - id, user_id, expires_at
- `projects` - id, user_id, name, description, status, spec
- `pcb_blocks` - 21 pre-seeded hardware modules
- `llm_requests` - model, tokens, cost_usd, latency_ms
- `conversations` - project_id, messages
- `gallery_visibility` - project_id, visibility

**Orchestrator Tables (migrations 0013-0016):**
- `orchestrator_prompts` - 8 pre-seeded agent prompts with versioning
- `orchestrator_edges` - Workflow transition graph
- `orchestrator_hooks` - Pre/post execution callbacks
- `context_tags` - Dynamic context tagging

**Block Tables (migrations 0017-0018):**
- `pcb_blocks.definition` - JSON block.json schema with metadata, electrical, physical
- `pcb_blocks.version` - Schema version tracking for block definitions

---

## Test Coverage

### Current Status
- **Total tests**: 648
- **Test files**: 22
- **Overall coverage**: 63%

### Coverage by Module

| Module | Coverage | Status |
|--------|----------|--------|
| `src/prompts/*.ts` | 96.51% | Excellent |
| `src/db/schema.ts` | 100% | Excellent |
| `src/stores/auth.ts` | 100% | Excellent |
| `src/stores/workspace.ts` | 100% | Excellent |
| `functions/lib/*.ts` | 93.51% | Excellent |
| `functions/api/llm/pricing.ts` | 100% | Excellent |
| `src/stores/orchestrator.ts` | 83.78% | Good |
| `src/services/llm.ts` | 61.44% | Needs work |
| `src/services/pcb-merge.ts` | 46.22% | Needs work |
| `src/services/orchestrator.ts` | 34.39% | Needs work |
| `src/lib/openscadRenderer.ts` | 0% | Untested |
| `functions/api/**/*.ts` | 0% | Needs miniflare |

---

## Security Checklist

- [x] Bcrypt password hashing
- [x] HTTP-only session cookies
- [x] WorkOS OAuth integration
- [x] User approval workflow
- [x] Server-side API key protection
- [x] Input validation (length limits)
- [x] Session expiration (7-day sliding)
- [x] Error message sanitization
- [x] Rate limiting on login
- [x] Request size limits
- [x] Error boundary for graceful degradation
- [x] Session cleanup capability
- [ ] CSRF protection (platform-level only)
- [ ] Comprehensive audit logging

---

## Remaining Work

### Medium Priority (Nice to Have)
1. **Standardize error logging**
   - Replace 68 console.error/warn calls with logger utility
   - Add structured logging throughout

2. **Use extractAndValidateJson throughout**
   - Replace regex JSON extraction in step components and orchestrator tools
   - Add Zod schema validation for all LLM responses

3. **Add `state.history` trimming to orchestrator**
   - Implement max size (e.g., 200 items) with FIFO eviction
   - Similar pattern to existing `trimConversationHistory()`

### Low Priority
4. Add workspace stage view tests
5. Fix incomplete I2C validation in firmware (regex-based, misses variable addresses)
6. Add pagination bounds check (large offsets on expensive queries)
7. Add message boundary awareness to trimConversationHistory (keep assistant+tool pairs together)

---

## Notes

- All 648 tests pass (verified January 18, 2026)
- TypeScript compiles without errors
- Deploy pipeline is stable (GitHub Actions → Cloudflare Pages)
- LLM costs dominated by image generation (~2000x text completions)
- WorkOS OAuth and user approval workflow active
- Blueprint generation creates real images (not placeholders)
- Orchestrator admin UI complete with prompt editing, flow visualization, and hook configuration
- 8 specialized agents seeded and editable via admin interface
- 18 database migrations supporting full orchestrator workflow management
- New: BlockViewer component for admin block inspection with KiCanvas preview
- New: TOKN KiCad parser replaces kicadts for KiCad 8 support
- New: LLM-assisted block import wizard for automated block.json generation
- New: CI workflow with GitHub Actions for PR checks
- Code review completed January 18, 2026 - 8 high-priority race conditions and data loss issues identified and fixed
