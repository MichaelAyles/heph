# Blog 30: OAuth in a Weekend

**Date**: January 15, 2026

## The Problem

We're in a Google hackathon. Users need to log in. Our current auth is username/password stored in D1 with bcrypt hashing. Works fine for internal testing, but asking hackathon judges to create accounts with passwords feels... wrong.

Google OAuth makes sense. But how do you add OAuth to a Cloudflare Pages app without losing a weekend?

## Evaluating Options

I spent an hour looking at our options:

**Supabase Auth** - I've used Supabase for projects in the past and it's been great. But the scope of my projects has grown to where Supabase is no longer a credible option. We're on Cloudflare with D1 and R2, not Postgres. Bringing in Supabase just for auth would mean maintaining two databases or migrating everything. Neither makes sense.

**Clerk** - The obvious choice for most apps. Beautiful UI, handles everything. One problem: uses Node.js `async_hooks` internally which doesn't exist on Cloudflare Workers. There are workarounds involving polyfills but they felt fragile for a hackathon timeline.

**Auth.js (NextAuth)** - Great library, wrong framework. We're on React + Cloudflare Pages Functions, not Next.js. The adapter pattern doesn't map cleanly to our setup.

**DIY OAuth** - Implement the OAuth 2.0 flow ourselves. Store tokens in D1. Handle refresh flows. This works but it's a 2-day project minimum, and I'd definitely mess something up.

**WorkOS** - Enterprise SSO provider with a product called AuthKit. 1M monthly active users on their free tier. Native Cloudflare Workers support. Handles the OAuth complexity, we just redirect to them and handle the callback.

## Why WorkOS Won

Three reasons:

1. **Cloudflare-native** - No async_hooks issues. Their SDK works on Workers. They even have documentation specifically for Cloudflare.

2. **1M MAU free tier** - We're a hackathon project. We'll never hit this limit. And if we somehow do, that's a good problem to have.

3. **Minimal integration** - Two endpoints. One redirects to WorkOS. One handles the callback. That's it.

The honest assessment: for a hackathon, I'd rather spend time on the actual product than debugging OAuth edge cases.

## Implementation

The whole thing took about 2 hours:

### Database Migration

```sql
ALTER TABLE users ADD COLUMN workos_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_workos ON users(workos_id);
```

We keep our existing users table. OAuth users just get a `workos_id` linking them to their WorkOS profile. Password auth still works as a fallback.

### Initiation Endpoint

`/api/auth/workos` redirects to WorkOS AuthKit:

```typescript
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const url = new URL(request.url)
  const redirectUri = `${url.origin}/api/auth/callback`

  // CSRF protection
  const state = crypto.randomUUID()

  const authUrl = new URL('https://api.workos.com/user_management/authorize')
  authUrl.searchParams.set('client_id', env.WORKOS_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('provider', 'authkit')

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`,
    },
  })
}
```

### Callback Handler

`/api/auth/callback` exchanges the code for user info and creates our session:

```typescript
// Exchange code for user profile
const tokenResponse = await fetch(
  'https://api.workos.com/user_management/authenticate',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.WORKOS_CLIENT_ID,
      client_secret: env.WORKOS_API_KEY,
      grant_type: 'authorization_code',
      code,
    }),
  }
)

const authData = await tokenResponse.json()
const workosUser = authData.user

// Find or create user in D1
let user = await env.DB.prepare(
  'SELECT id, username FROM users WHERE workos_id = ?'
).bind(workosUser.id).first()

if (!user) {
  // Create new user with WorkOS ID
  const userId = crypto.randomUUID().replace(/-/g, '')
  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, workos_id)
     VALUES (?, ?, '', ?, ?)`
  ).bind(userId, workosUser.email, displayName, workosUser.id).run()
}

// Create session (same as password login)
const sessionId = crypto.randomUUID().replace(/-/g, '')
await env.DB.prepare(
  'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
).bind(sessionId, user.id, expiresAt).run()
```

The callback also handles account linking. If someone already has a password account with the same email, we link their WorkOS ID to the existing account instead of creating a duplicate.

### Frontend

Just a button:

```tsx
<a
  href="/api/auth/workos"
  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-800"
>
  <GoogleIcon />
  Continue with Google
</a>
```

No client-side OAuth complexity. No tokens to manage. Click button, redirect, come back logged in.

## What We Kept

Password auth still works. The `mike/mike` admin account still works. Existing sessions are unaffected. OAuth is purely additive.

This matters because:
1. Local development doesn't need OAuth setup
2. Existing test accounts keep working
3. If WorkOS has issues, we have a fallback

## Access Gating

OAuth working meant anyone with a Google account could sign up. For a hackathon demo, that's not ideal. We want controlled access.

Simple solution: add an `is_approved` flag.

```sql
ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;
UPDATE users SET is_approved = 1 WHERE id IS NOT NULL; -- Approve existing users
```

The callback now checks approval status before creating a session:

```typescript
if (!user.is_approved) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/?access_requested=true',
      'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/',
    },
  })
}
```

New users get created with `is_approved = 0`. They authenticate successfully, their account exists, but they can't access the app. Instead they see a friendly "Access requested!" banner and wait for approval.

### Admin Management

Built a quick admin page at `/admin/users` to see pending requests:

```typescript
// GET /api/admin/users?filter=pending
const result = await env.DB.prepare(
  'SELECT id, username, display_name, is_approved, created_at FROM users WHERE is_approved = 0'
).all()

// PATCH /api/admin/users
await env.DB.prepare('UPDATE users SET is_approved = ? WHERE id = ?')
  .bind(body.isApproved ? 1 : 0, body.userId)
  .run()
```

One click to approve. One click to revoke. No email notifications yet, just check the page when you want to let someone in.

The button now says "Request Access with Google" instead of "Continue with Google". Sets expectations correctly.

## The Tradeoff

We're now dependent on WorkOS. If they go down, new OAuth logins fail. If they change their API, we have to update.

For a hackathon project, this is acceptable. For a production app with paying customers, I'd think harder about it. Maybe implement refresh token handling ourselves, or have a degradation path.

But that's future problems. Today, users can click "Request Access with Google" and the flow works.

## Setup

For anyone else doing this:

1. Create a WorkOS account at workos.com
2. Create an application, get your Client ID and API Key
3. Enable Google OAuth in AuthKit settings
4. Set your redirect URI to `https://yourdomain.com/api/auth/callback`
5. Add `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` to your Cloudflare secrets

That's it. Two hours from "we need OAuth" to "OAuth works."
