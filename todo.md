# PHAESTUS Code Review & Technical Debt

**Last Review**: January 15, 2026
**Overall Status**: Production-ready
**Test Coverage**: 63% overall (648 tests)

---

## Summary

The codebase is mature and production-ready with solid engineering practices:
- Full 5-step spec pipeline (feasibility → refinement → blueprints → selection → finalization)
- Multi-stage workspace (PCB, Enclosure, Firmware, Export)
- Hardware orchestrator with autonomous agent capabilities
- Comprehensive LLM integration with retry logic, streaming, and tool calling
- 12 database migrations, WorkOS OAuth, user approval workflow
- All major API endpoints operational

### Recent Changes (Jan 2025)

| Change | Commit | Impact |
|--------|--------|--------|
| Fix finalSpec type in ProjectsPage | 14f4b74 | Type safety for spec interface |
| Prefer finalSpec.name in UI display | 9e2da8d | Better name resolution in views |
| Orchestrator generates real blueprints | e3f442f | No more placeholder images |
| Validate blueprint URLs | 70bf9c1 | Prevent 404s in SpecStageView |
| Include spec in projects list API | 7bd4269 | Stage status display works |

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
| `orchestrator.ts` | 1641 | Needs split |
| `SpecPage.tsx` | 362 | Refactored |
| `SpecStageView.tsx` | 1495 | Monitor |
| `FeasibilityStep.tsx` | 103 | Good |
| `RefinementStep.tsx` | 240 | Good |
| `BlueprintStep.tsx` | 162 | Good |
| `SelectionStep.tsx` | 112 | Good |
| `FinalizationStep.tsx` | 94 | Good |

### API Endpoints (28 total)

| Category | Endpoints |
|----------|-----------|
| LLM | chat, image, stream, tools |
| Projects | list, create, get, update, delete |
| Auth | login, logout, register, me, WorkOS callback |
| Admin | logs, users, cleanup-sessions |
| Blocks | list, get |
| Gallery | index, get |

### Database (12 migrations)

Key tables:
- `users` - id, username, password_hash, is_admin, control_mode, is_approved
- `sessions` - id, user_id, expires_at
- `projects` - id, user_id, name, description, status, spec
- `pcb_blocks` - 21 pre-seeded hardware modules
- `llm_requests` - model, tokens, cost_usd, latency_ms
- `conversations` - project_id, messages
- `gallery_visibility` - project_id, visibility

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

### High Priority
1. **Split Orchestrator.ts into modules** (4-6h)
   - Extract tool handlers into separate files
   - Separate state management
   - Improve testability

### Medium Priority
2. **Standardize error logging** (2h)
   - Replace 68 console.error/warn calls with logger utility
   - Add structured logging throughout

3. **Use extractAndValidateJson throughout** (2h)
   - Replace regex JSON extraction in step components
   - Add schema validation for all LLM responses

### Low Priority
4. Add workspace stage view tests
5. Fix incomplete I2C validation in firmware
6. Add pagination bounds check

---

## Notes

- All 648 tests pass
- TypeScript compiles without errors
- Deploy pipeline is stable (GitHub Actions → Cloudflare Pages)
- LLM costs dominated by image generation (~2000x text completions)
- Architecture is sound; main remaining debt is orchestrator organization
- WorkOS OAuth and user approval workflow recently added
- Blueprint generation now creates real images (not placeholders)
