# PHAESTUS Code Review & Technical Debt

**Last Review**: January 12, 2026
**Overall Status**: ~95% complete - Production-ready
**Test Coverage**: ~70% (648 tests)

---

## Summary

The codebase has been significantly improved in this review session. Core features are implemented and functional:
- Full 5-step spec pipeline (feasibility - refinement - blueprints - selection - finalization)
- Multi-stage workspace (PCB, Enclosure, Firmware, Export)
- Hardware orchestrator with autonomous agent capabilities
- Comprehensive LLM integration with retry logic and tool calling
- All major API endpoints operational

### Changes Made in This Session

| Change | Status | Impact |
|--------|--------|--------|
| Rate limiting on login | Implemented | Brute force protection (5 attempts/15min, 30min lockout) |
| React Error Boundary | Implemented | Graceful error recovery at app root |
| Request size limits | Implemented | 10MB general, 5MB for project specs |
| Split SpecPage.tsx | Completed | 1253 lines - 363 lines (71% reduction) |
| Session cleanup endpoint | Implemented | `/api/admin/cleanup-sessions` |
| Step component tests | Added | 10 new tests for spec-steps |

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
| SpecPage too large | Split into 8 step components |
| Session cleanup missing | Admin endpoint for cleanup |

### Remaining Issues

#### Medium Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| Orchestrator complexity | `src/services/orchestrator.ts` (1603 lines) | Testability | 4-6h |
| Standardize error logging | Various files | Debug difficulty | 2h |
| Use extractAndValidateJson | `spec-steps/*.tsx` | Parse failures | 2h |

#### Low Priority
| Issue | Location | Risk | Effort |
|-------|----------|------|--------|
| Incomplete I2C validation | Firmware validation | Edge case bugs | 2h |
| Console.error instead of logger | Multiple files | Missing audit trail | 1h |

---

## Architecture Improvements

### SpecPage Refactor

The monolithic SpecPage.tsx (1253 lines) was split into focused components:

```
src/components/spec-steps/
  index.ts              # Exports
  types.ts              # Shared types and interfaces
  StepIndicator.tsx     # Progress indicator
  FeasibilityStep.tsx   # Step 0: Analyze feasibility
  FeasibilityResults.tsx # Display feasibility results
  RejectionDisplay.tsx  # Handle rejected projects
  RefinementStep.tsx    # Step 1: Q&A refinement
  BlueprintStep.tsx     # Step 2: Generate images
  SelectionStep.tsx     # Step 3: Select design
  FinalizationStep.tsx  # Step 4: Generate final spec
  spec-steps.test.ts    # Type validation tests
```

The main SpecPage.tsx is now 363 lines (71% reduction) and focuses solely on orchestration.

### Security Improvements

1. **Rate Limiting** (`functions/api/auth/login.ts`)
   - 5 attempts per 15-minute window
   - 30-minute lockout after exceeding limit
   - Clears on successful login
   - Uses CF-Connecting-IP for client identification

2. **Request Size Limits** (`functions/api/_middleware.ts`)
   - 10MB general limit
   - 5MB limit for project spec updates
   - Returns 413 for oversized requests

3. **Error Boundary** (`src/components/ErrorBoundary.tsx`)
   - Catches unhandled React errors
   - Shows user-friendly error UI
   - Provides retry, reload, and home navigation
   - Shows stack trace in development mode

4. **Session Cleanup** (`functions/api/admin/cleanup-sessions.ts`)
   - `POST` to delete expired sessions
   - `GET` for session statistics
   - Admin-only access

---

## Test Coverage

### Current Status
- **Total tests**: 648 (up from 638)
- **Test files**: 22
- **Coverage**: ~70%

### Well-Tested (90%+)
- `src/prompts/*.ts` - Prompt builders (96.51%)
- `src/db/schema.ts` - Row transforms (100%)
- `src/stores/auth.ts` - Auth state (100%)
- `src/stores/workspace.ts` - Workspace state (100%)
- `functions/lib/*.ts` - Utilities (93.51%)
- `functions/api/llm/pricing.ts` - Cost calculations (100%)
- `src/components/spec-steps/` - Type validation (new)

### Needs Testing
- `src/pages/workspace/*.tsx` - Stage views (0%)
- `src/lib/openscadRenderer.ts` - WASM wrapper (0%)
- `functions/api/projects/*.ts` - Integration tests

---

## Security Checklist

- [x] Bcrypt password hashing
- [x] HTTP-only session cookies
- [x] Server-side API key protection
- [x] Input validation (length limits)
- [x] Session expiration (7-day sliding)
- [x] Error message sanitization
- [x] Rate limiting on login
- [x] Request size limits
- [x] Error boundary for graceful degradation
- [x] Session cleanup capability
- [ ] CSRF protection (platform-level only)
- [ ] Audit logging for all sensitive ops

---

## Remaining Work

### High Priority
1. Split Orchestrator.ts into modules (4-6h)
   - Extract tool handlers
   - Separate state management
   - Improve testability

### Medium Priority
2. Standardize error logging (2h)
   - Replace console.error with logger utility
   - Add structured logging throughout

3. Use extractAndValidateJson throughout (2h)
   - Replace regex JSON extraction in step components
   - Add schema validation for LLM responses

### Low Priority
4. Add workspace stage view tests
5. Fix incomplete I2C validation

---

## Quick Reference

| Metric | Before | After |
|--------|--------|-------|
| SpecPage.tsx lines | 1253 | 363 |
| Total tests | 638 | 648 |
| Security controls | 6 | 10 |
| Step components | 0 | 8 |

| File | Lines |
|------|-------|
| `orchestrator.ts` | 1603 |
| `SpecPage.tsx` | 363 |
| `FeasibilityStep.tsx` | 98 |
| `RefinementStep.tsx` | 219 |
| `BlueprintStep.tsx` | 148 |
| `SelectionStep.tsx` | 108 |
| `FinalizationStep.tsx` | 81 |

---

## Notes

- All 648 tests pass
- TypeScript compiles without errors
- Deploy pipeline is stable (GitHub Actions - Cloudflare Pages)
- LLM costs dominated by image generation (~2000x text completions)
- Architecture is sound; main remaining debt is orchestrator organization
