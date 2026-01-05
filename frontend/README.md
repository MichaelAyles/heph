# PHAESTUS Frontend

AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware.

## Quick Start

```bash
# Install dependencies
pnpm install

# Development (full stack with API)
pnpm dev:full

# Visit http://localhost:8788
# Login: mike / mike
```

## Development Modes

| Command         | Port | Description                      |
| --------------- | ---- | -------------------------------- |
| `pnpm dev`      | 5173 | Frontend only (Vite HMR, no API) |
| `pnpm dev:full` | 8788 | Full stack with D1/R2 bindings   |

Use `dev:full` when working with API endpoints or database.

## Project Structure

```
frontend/
├── src/
│   ├── pages/           # Route components
│   ├── components/      # Shared UI
│   ├── prompts/         # LLM prompt templates
│   ├── services/        # API clients
│   ├── stores/          # Zustand state
│   └── db/schema.ts     # TypeScript types
├── functions/
│   ├── api/             # Cloudflare Pages Functions
│   │   ├── auth/        # Login/logout
│   │   ├── llm/         # LLM proxy (chat, stream, image)
│   │   ├── admin/       # Admin endpoints
│   │   ├── projects/    # Project CRUD
│   │   └── blocks/      # PCB block library
│   └── lib/             # Shared utilities
├── migrations/          # D1 SQL migrations
└── dist/                # Production build
```

## Environment Setup

Create `.dev.vars` for local development:

```env
OPENROUTER_API_KEY=sk-or-v1-...
TEXT_MODEL_SLUG=google/gemini-2.0-flash-001
IMAGE_MODEL_SLUG=google/gemini-2.0-flash-exp
```

## Scripts

```bash
# Development
pnpm dev           # Frontend only
pnpm dev:full      # Full stack

# Build & Deploy
pnpm build         # Build for production
pnpm deploy        # Deploy to Cloudflare Pages

# Code Quality
pnpm typecheck     # Run TypeScript checks
pnpm lint          # ESLint
pnpm lint:fix      # Fix lint issues
pnpm format        # Prettier

# Database
pnpm db:migrate        # Run migrations locally
pnpm db:migrate:remote # Run on production D1
pnpm db:reset          # Reset and re-run all migrations
```

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Clear session
- `GET /api/auth/me` - Get current user

### LLM

- `POST /api/llm/chat` - Non-streaming chat completion
- `POST /api/llm/stream` - Streaming chat completion
- `POST /api/llm/image` - Image generation

### Projects

- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Admin (requires admin user)

- `GET /api/admin/logs` - View debug logs
- `DELETE /api/admin/logs` - Delete old logs

## Debug Logging

Admin users (currently just `mike`) have access to comprehensive debug logging:

```typescript
import { createLogger } from '../lib/logger'

const logger = createLogger(env, user, requestId)

// Log with level and category
await logger.debug('llm', 'Request received', { model, tokens })
await logger.error('api', 'Failed to process', { error })

// Category shortcuts
await logger.llm('Chat completed', { latencyMs })
await logger.api('Endpoint hit', { path })
```

View logs via API:

```bash
# Get recent errors
curl /api/admin/logs?level=error&limit=50

# Get logs for specific request
curl /api/admin/logs?requestId=abc123

# Delete logs older than 7 days
curl -X DELETE /api/admin/logs?olderThanDays=7
```

## Product Specification Pipeline

The app guides users through a 5-step spec development process:

1. **Feasibility Analysis** - Scores the idea across categories (communication, processing, power, I/O)
2. **Refinement** - Surfaces questions to lock down open decisions
3. **Blueprints** - Generates 4 product render variations
4. **Selection** - User picks their favorite design
5. **Finalization** - Generates locked spec with BOM

Hard rejections for: FPGA, high voltage (>24V), safety-critical systems, healthcare devices.

## Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, React Query, Zustand
- **Backend**: Cloudflare Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **LLM**: OpenRouter (300+ models) or direct Gemini API
