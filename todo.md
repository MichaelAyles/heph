# PHAESTUS Code Review & Technical Debt

**Last Review**: January 16, 2026
**Overall Status**: Production-ready
**Test Coverage**: 648 tests (all passing)

---

## Summary

The codebase is mature and production-ready with solid engineering practices:
- Full 5-step spec pipeline (feasibility → refinement → blueprints → selection → finalization)
- Multi-stage workspace (PCB, Enclosure, Firmware, Export)
- Hardware orchestrator with 8 specialized agents and admin management UI
- Comprehensive LLM integration with retry logic, streaming, and tool calling
- 16 database migrations, WorkOS OAuth, user approval workflow
- 35+ API endpoints operational including orchestrator admin API

### Recent Changes (Jan 2026)

| Change | Commit | Impact |
|--------|--------|--------|
| Add orchestrator editor admin page | 0e61f3f | Full CRUD for agent prompts |
| Add orchestrator admin API endpoints | af582ca | prompts, edges, hooks management |
| Add 4 new database migrations (0013-0016) | - | orchestrator_prompts, edges, hooks, context_tags |
| Fix @/db/schema imports in admin handlers | 2c8697b | Build fixes for wrangler |
| Add Orchestrator link to admin sidebar | 467ba21 | Admin navigation |
| Fix finalSpec type in ProjectsPage | 14f4b74 | Type safety for spec interface |
| Orchestrator generates real blueprints | e3f442f | No more placeholder images |
| Validate blueprint URLs | 70bf9c1 | Prevent 404s in SpecStageView |

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

### Remaining Issues

#### Medium Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| Orchestrator complexity | `src/services/orchestrator.ts` (1641 lines) | Testability | 4-6h |
| Standardize error logging | 68 console.error/warn calls | Debug difficulty | 2h |
| Use extractAndValidateJson | `spec-steps/*.tsx` | Parse failures | 2h |

#### Low Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| Incomplete I2C validation | Firmware validation | Edge case bugs | 2h |
| Missing pagination bounds | Projects list endpoint | Expensive queries | 1h |

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
| `AdminOrchestratorPage.tsx` | ~200 | New - admin UI |
| `PromptEditor.tsx` | ~300 | New - prompt editing |
| `FlowVisualization.tsx` | ~200 | New - workflow graph |

### API Endpoints (35+ total)

| Category | Endpoints |
|----------|-----------|
| LLM | chat, image, stream, tools |
| Projects | list, create, get, update, delete, conversations, visibility |
| Auth | login, logout, me, callback, workos |
| Admin | logs, users, cleanup-sessions |
| Admin Orchestrator | prompts (list, create, update, reset), edges, hooks |
| Orchestrator | prompts (runtime loading) |
| Blocks | list, get, files |
| Gallery | index, get |
| Settings | settings, usage |

### Database (16 migrations)

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
1. **Split Orchestrator.ts into modules**
   - Extract tool handlers into separate files
   - Separate state management
   - Improve testability
   - Note: Currently functional, split would improve maintainability

2. **Standardize error logging**
   - Replace 68 console.error/warn calls with logger utility
   - Add structured logging throughout

3. **Use extractAndValidateJson throughout**
   - Replace regex JSON extraction in step components
   - Add schema validation for all LLM responses

### Low Priority
4. Add workspace stage view tests
5. Fix incomplete I2C validation in firmware (regex-based, misses variable addresses)
6. Add pagination bounds check (large offsets on expensive queries)

---

## Notes

- All 648 tests pass (verified January 16, 2026)
- TypeScript compiles without errors
- Deploy pipeline is stable (GitHub Actions → Cloudflare Pages)
- LLM costs dominated by image generation (~2000x text completions)
- Architecture is sound; main remaining debt is orchestrator organization
- WorkOS OAuth and user approval workflow active
- Blueprint generation creates real images (not placeholders)
- Orchestrator admin UI complete with prompt editing, flow visualization, and hook configuration
- 8 specialized agents seeded and editable via admin interface
- 16 database migrations supporting full orchestrator workflow management
