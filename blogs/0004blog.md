# Authentication Architecture: Simple Now, Scalable Later

## The Problem

Phaestus needs authentication for several reasons:
- **User data isolation**: Projects, conversations, and LLM usage must be tied to specific users
- **API key protection**: OpenRouter API keys live server-side, not in the browser
- **Usage tracking**: We need to know who's consuming LLM tokens

But we're building fast. Full OAuth with Google/GitHub would add complexity we don't need yet.

## The Solution: Password Auth with Proper Data Modeling

We chose a pragmatic middle ground:

1. **Simple password authentication** - Static passwords for now (username: `mike`, password: `mike`)
2. **Proper user data model** - Full `users` table with UUIDs, ready for OAuth later
3. **Session-based auth** - HTTP-only cookies, 7-day expiry, stored in D1

### Why Not Just Skip Auth?

We could have hardcoded a single user and moved on. But:

- Every table needs `user_id` foreign keys from day one
- Retrofitting multi-user support later is painful
- The LLM proxy needs to know who's making requests for rate limiting

### Why Not Full OAuth Now?

- Adds external dependencies (Clerk, Auth0, etc.) or complex OAuth flows
- Slows down iteration during early development
- We can upgrade the auth mechanism without changing the data model

## Implementation

### Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

All other tables reference `user_id`:
- `projects.user_id` - Who owns this project
- `conversations.user_id` - Conversation history per user
- `llm_requests.user_id` - Token usage tracking

### Server-Side Auth (Cloudflare Pages Functions)

```
/functions/api/
├── auth/
│   ├── login.ts    # POST - validate credentials, create session
│   ├── logout.ts   # POST - delete session
│   └── me.ts       # GET - return current user from session
└── _middleware.ts  # Check session cookie on all /api/* routes
```

The middleware validates the session cookie and attaches `user` to the request context. Protected endpoints can access `context.data.user`.

### Frontend Auth State (Zustand)

```typescript
const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async () => { /* GET /api/auth/me */ },
  login: async (username, password) => { /* POST /api/auth/login */ },
  logout: async () => { /* POST /api/auth/logout */ },
}))
```

The app checks auth on mount. If not authenticated, show login page. Simple.

## The Upgrade Path

When we need real auth:

1. Add OAuth providers (Google, GitHub) to `/api/auth/`
2. Create users on first OAuth login
3. Link OAuth identities to existing users by email
4. Remove password field (or keep for admin access)

The data model doesn't change. Projects, conversations, usage - all already tied to `user_id`.

## Development Workflow

Two servers running:
- **Vite (5173)** - Frontend with hot reload, proxies `/api/*` to wrangler
- **Wrangler Pages (8788)** - API functions with D1/R2 bindings

This gives us fast frontend iteration while the API endpoints have full access to Cloudflare services.

## Summary

| Aspect | Current | Future |
|--------|---------|--------|
| Auth method | Password | OAuth (Google/GitHub) |
| User storage | D1 `users` table | Same |
| Session storage | D1 `sessions` table | Same or upgrade to JWT |
| Data isolation | `user_id` foreign keys | Same |

We got multi-user data isolation with 50 lines of auth code. OAuth can wait.
