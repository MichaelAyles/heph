# Admin Debug Logging System

**Date:** 2025-12-31

---

## The Problem

Debugging production issues was painful:
- No visibility into what the API was doing
- console.log statements disappeared after requests ended
- No way to correlate logs across a single request
- LLM errors were hard to diagnose

## The Solution

A comprehensive debug logging system that:
- Logs to console with color coding (dev)
- Stores logs in D1 database (admin users only)
- Tracks request IDs for correlation
- Provides an admin API to view/delete logs

---

## Architecture

### Admin Permissions

Added `is_admin` column to users table. The user 'mike' is set as admin by default.

```sql
ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;
UPDATE users SET is_admin = 1 WHERE username = 'mike';
```

### Debug Logs Table

```sql
CREATE TABLE debug_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  metadata TEXT,           -- JSON blob
  request_id TEXT,         -- correlate logs
  created_at TEXT NOT NULL
);
```

Indexes on `user_id`, `level`, `category`, and `created_at` for fast queries.

---

## Logger Utility

Located at `functions/lib/logger.ts`:

```typescript
import { createLogger } from '../lib/logger'

// Create logger with user context
const logger = createLogger(env, user, requestId)

// Log levels
await logger.debug('llm', 'Chat request received', { model })
await logger.info('api', 'Request processed', { latencyMs })
await logger.warn('auth', 'Session expiring soon', { userId })
await logger.error('llm', 'API error', { error: errorText })

// Category-specific shortcuts
await logger.llm('Chat completed', { tokens: 150 })
await logger.api('Endpoint hit', { path: '/projects' })
await logger.auth('Login attempt', { username })
```

### Log Levels
- `debug` - Detailed diagnostic info
- `info` - General operational info
- `warn` - Warning conditions
- `error` - Error conditions

### Categories
- `general` - Uncategorized
- `api` - API endpoint activity
- `auth` - Authentication events
- `llm` - LLM requests/responses
- `project` - Project operations
- `image` - Image generation
- `db` - Database operations
- `middleware` - Middleware processing

### Behavior

| Environment | Console | Database |
|-------------|---------|----------|
| Development | Always (colored) | Admin users + errors |
| Production | Errors only | Admin users + errors |

---

## Middleware Integration

The auth middleware (`functions/api/_middleware.ts`) now:
1. Fetches `is_admin` flag from database
2. Attaches `isAdmin` to user context
3. Logs all API requests for admin users

```typescript
const isAdmin = result.is_admin === 1
context.data.user = { id, username, displayName, isAdmin }

if (isAdmin) {
  const logger = createLogger(env, context.data.user, requestId)
  await logger.api(`${method} ${path}`, { query })
}
```

---

## Admin API

### View Logs

```
GET /api/admin/logs
```

Query parameters:
- `limit` - Max results (default 100, max 500)
- `offset` - Pagination offset
- `level` - Filter by level (debug/info/warn/error)
- `category` - Filter by category (api/llm/auth/etc)
- `requestId` - Filter by request ID

Response:
```json
{
  "logs": [
    {
      "id": "abc123",
      "level": "info",
      "category": "llm",
      "message": "Chat completed",
      "metadata": { "model": "gemini-2.0-flash", "latencyMs": 1234 },
      "request_id": "def456",
      "created_at": "2025-12-31T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### Delete Old Logs

```
DELETE /api/admin/logs?olderThanDays=7
```

Response:
```json
{
  "deleted": 42,
  "message": "Deleted logs older than 7 days"
}
```

---

## Endpoints with Logging

Logging was added to all LLM endpoints:

| Endpoint | Events Logged |
|----------|---------------|
| `/api/llm/chat` | Request received, API errors, completion |
| `/api/llm/stream` | Request received, stream started, errors |
| `/api/llm/image` | Request received, generation complete, errors |

Each log includes:
- Model used
- Latency (ms)
- Token counts
- Error details (if any)

---

## Files Changed

```
migrations/
└── 0005_admin_and_debug.sql   # NEW - schema changes

functions/
├── lib/
│   └── logger.ts              # NEW - logger utility
├── api/
│   ├── _middleware.ts         # Updated - isAdmin, logging
│   ├── admin/
│   │   └── logs.ts            # NEW - admin log viewer
│   └── llm/
│       ├── chat.ts            # Updated - logging
│       ├── stream.ts          # Updated - logging
│       └── image.ts           # Updated - logging
└── env.d.ts                   # Updated - isAdmin type
```

---

## Usage Examples

### Debugging a Failed LLM Request

1. User reports image generation failed
2. Check logs filtered by category and level:
   ```
   GET /api/admin/logs?category=llm&level=error
   ```
3. Find the error with request ID
4. Get all logs for that request:
   ```
   GET /api/admin/logs?requestId=abc123
   ```
5. See full context: request received → API error → response

### Monitoring API Usage

```
GET /api/admin/logs?category=api&limit=50
```

See recent API calls, response times, and which endpoints are being hit.

### Cleanup Old Logs

```
DELETE /api/admin/logs?olderThanDays=30
```

Remove logs older than 30 days to keep the database size manageable.

---

## Next Steps

1. Add frontend admin panel for log viewing
2. Real-time log streaming via WebSocket
3. Log aggregation and alerting for errors
4. Performance metrics dashboard
