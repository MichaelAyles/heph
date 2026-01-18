# Test Suite & Production Deployment

**Date:** 2026-01-01

---

## The Goal

Get PHAESTUS to production with confidence:
1. Add comprehensive test coverage
2. Deploy to Cloudflare Pages
3. Configure production secrets and bindings

---

## Test Suite Setup

### Framework Choice: Vitest

Vitest was chosen over Jest because:
- Native ESM support (no transpilation needed)
- Same config format as Vite
- Faster execution with smart watch mode
- Built-in v8 coverage provider

### Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        global: { lines: 90, functions: 90, branches: 90, statements: 90 }
      }
    }
  }
})
```

### Test Setup

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'

global.fetch = vi.fn()
global.crypto.randomUUID = vi.fn(() => '12345678-1234-1234-1234-123456789012')

beforeEach(() => {
  vi.clearAllMocks()
})
```

---

## What We Tested

### 1. Prompt Templates (72 tests)

All LLM prompt builders are pure functions, making them easy to test:

```typescript
// src/prompts/feasibility.test.ts
describe('buildFeasibilityPrompt', () => {
  it('should include the product description', () => {
    const result = buildFeasibilityPrompt('A smart plant monitor')
    expect(result).toContain('A smart plant monitor')
  })

  it('should ask for JSON response', () => {
    const result = buildFeasibilityPrompt('any description')
    expect(result).toContain('Respond with JSON only')
  })
})
```

Tested modules:
- `feasibility.ts` - 10 tests
- `blueprint.ts` - 20 tests
- `refinement.ts` - 12 tests
- `requirements.ts` - 14 tests
- `finalSpec.ts` - 16 tests

### 2. Schema Transforms (17 tests)

Database row transformations (snake_case → camelCase):

```typescript
describe('projectFromRow', () => {
  it('should parse spec JSON when present', () => {
    const row = {
      id: 'proj-123',
      user_id: 'user-456',
      spec: JSON.stringify({ description: 'test' }),
      // ...
    }
    const result = projectFromRow(row)
    expect(result.spec).toEqual({ description: 'test' })
  })
})
```

### 3. LLM Pricing (36 tests)

Cost calculation for various models:

```typescript
describe('calculateCost', () => {
  it('should calculate cost for google/gemini-2.0-flash-001', () => {
    // 1M tokens: $0.1 prompt + $0.4 completion = $0.5
    const cost = calculateCost('google/gemini-2.0-flash-001', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.5)
  })

  it('should match model with :free suffix', () => {
    const cost = calculateCost('google/gemini-2.0-flash-001:free', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.5)
  })
})
```

### 4. Logger Utility (48 tests)

Comprehensive testing with mocked DB:

```typescript
const mockEnv = {
  ENVIRONMENT: 'development',
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({})
      })
    })
  }
}

describe('Logger', () => {
  it('should write to database for admin users', async () => {
    const logger = createLogger(mockEnv, { id: '123', username: 'mike' })
    await logger.debug('general', 'Test message')
    expect(mockEnv.DB.prepare).toHaveBeenCalled()
  })
})
```

### 5. Auth Store (18 tests)

Zustand store with mocked fetch:

```typescript
describe('login', () => {
  it('should return success and set user on successful login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: mockUser })
    })

    const result = await useAuthStore.getState().login('testuser', 'password')

    expect(result.success).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
```

### 6. LLM Service (16 tests)

Streaming and non-streaming chat:

```typescript
describe('chatStream', () => {
  it('should call onToken for each token received', async () => {
    const chunks = [
      'data: {"token":"Hello"}\n',
      'data: {"token":" world"}\n',
      'data: {"done":true}\n'
    ]
    // Mock ReadableStream...

    await llm.chatStream({ messages: [] }, callbacks)

    expect(callbacks.onToken).toHaveBeenCalledWith('Hello')
    expect(callbacks.onToken).toHaveBeenCalledWith(' world')
  })
})
```

---

## Coverage Results

```
------------------|---------|----------|---------|---------|
File              | % Stmts | % Branch | % Funcs | % Lines |
------------------|---------|----------|---------|---------|
All files         |   99.31 |    96.90 |     100 |     100 |
 functions/lib    |   98.03 |    91.66 |     100 |     100 |
 src/db           |     100 |      100 |     100 |     100 |
 src/prompts      |     100 |      100 |     100 |     100 |
 src/services     |     100 |      100 |     100 |     100 |
 src/stores       |     100 |      100 |     100 |     100 |
------------------|---------|----------|---------|---------|
```

**207 tests passing** with 99%+ statement coverage on testable modules.

### What's NOT Tested

API endpoint handlers (`functions/api/**/*.ts`) are excluded because they require:
- Cloudflare Workers runtime (or miniflare mock)
- D1 database bindings
- R2 storage bindings
- OpenRouter API keys

These are thin wrappers around D1 queries anyway—the business logic lives in the tested modules.

---

## Production Deployment

### 1. Create Cloudflare Resources

```bash
# Create Pages project
wrangler pages project create phaestus --production-branch=main

# Create R2 bucket
wrangler r2 bucket create phaestus-assets
```

D1 database was already created and configured in `wrangler.toml`.

### 2. Set Secrets

```bash
echo "sk-or-v1-..." | wrangler pages secret put OPENROUTER_API_KEY --project-name=phaestus
echo "google/gemini-3-flash-preview" | wrangler pages secret put TEXT_MODEL_SLUG --project-name=phaestus
echo "google/gemini-2.5-flash-image" | wrangler pages secret put IMAGE_MODEL_SLUG --project-name=phaestus
```

### 3. Deploy

```bash
pnpm build && wrangler pages deploy dist --project-name=phaestus
```

Output:
```
✨ Compiled Worker successfully
✨ Success! Uploaded 4 files
✨ Uploading Functions bundle
🌎 Deploying...
✨ Deployment complete! Take a peek over at https://phaestus.pages.dev
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
├─────────────────────────────────────────────────────────┤
│  Pages (Static)  │  Functions (API)  │  D1  │  R2      │
│  React SPA       │  /api/*           │  DB  │  Assets  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  OpenRouter   │
                    │  (LLM Proxy)  │
                    └───────────────┘
```

### Cloudflare Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | SQLite database for users, projects, logs |
| `STORAGE` | R2 | Asset storage (images, files) |
| `OPENROUTER_API_KEY` | Secret | LLM API authentication |
| `TEXT_MODEL_SLUG` | Secret | Default text model |
| `IMAGE_MODEL_SLUG` | Secret | Default image model |

---

## Files Changed

```
frontend/
├── vitest.config.ts           # NEW - Vitest configuration
├── src/test/setup.ts          # NEW - Test setup
├── src/prompts/*.test.ts      # NEW - Prompt tests (5 files)
├── src/db/schema.test.ts      # NEW - Schema tests
├── src/services/llm.test.ts   # NEW - LLM service tests
├── src/stores/auth.test.ts    # NEW - Auth store tests
├── functions/lib/logger.test.ts      # NEW - Logger tests
├── functions/api/llm/pricing.test.ts # NEW - Pricing tests
├── package.json               # Updated - test scripts
├── tsconfig.app.json          # Updated - exclude test files
└── .gitignore                 # Updated - exclude coverage/

CLAUDE.md                      # Updated - deployment & testing docs
README.md                      # Updated - live URL & architecture
```

---

## Live URLs

- **Production**: https://phaestus.pages.dev
- **Preview** (per-commit): https://{commit-hash}.phaestus.pages.dev

Login: `mike` / `mike`

---

## Next Steps

1. Add miniflare for API endpoint integration tests
2. Set up CI/CD with GitHub Actions
3. Add E2E tests with Playwright
4. Performance monitoring with Cloudflare Analytics
