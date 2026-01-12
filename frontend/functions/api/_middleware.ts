/**
 * API Middleware
 * Handles authentication, rate limiting, and request size limits for protected routes
 */

import type { Env } from '../env'
import { createLogger } from '../lib/logger'

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/blocks',
  '/api/images',
  '/api/gallery',
]

// Request size limits (in bytes)
const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB general limit
const MAX_SPEC_SIZE = 5 * 1024 * 1024 // 5MB for spec updates

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context
  const url = new URL(context.request.url)
  const path = url.pathname
  const method = context.request.method
  const requestId = crypto.randomUUID().replace(/-/g, '')

  // Check request size for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentLength = context.request.headers.get('Content-Length')
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      const limit = path.includes('/projects/') ? MAX_SPEC_SIZE : MAX_REQUEST_SIZE

      if (size > limit) {
        return Response.json(
          { error: `Request body too large. Maximum size is ${Math.floor(limit / 1024 / 1024)}MB` },
          { status: 413 }
        )
      }
    }
  }

  // Store request ID for logging
  context.data.requestId = requestId

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => path.startsWith(route))) {
    return context.next()
  }

  // Check for session cookie
  const cookie = context.request.headers.get('Cookie') || ''
  const sessionMatch = cookie.match(/session=([^;]+)/)
  const sessionId = sessionMatch?.[1]

  if (!sessionId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate session ID format (32 hex chars - UUID without dashes)
  if (!/^[a-f0-9]{32}$/i.test(sessionId)) {
    return Response.json({ error: 'Invalid session' }, { status: 401 })
  }

  // Validate session and get user with admin status
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.is_admin
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first<{ id: string; username: string; display_name: string | null; is_admin: number }>()

  if (!result) {
    return Response.json({ error: 'Session expired' }, { status: 401 })
  }

  const isAdmin = result.is_admin === 1

  // Extend session on activity (update expiry to 7 days from now)
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
    .bind(newExpiresAt, sessionId)
    .run()

  // Attach user to context data for downstream handlers
  context.data.user = {
    id: result.id,
    username: result.username,
    displayName: result.display_name,
    isAdmin,
  }

  // Log request for admin users
  if (isAdmin) {
    const logger = createLogger(env, context.data.user as any, requestId)
    await logger.api(`${method} ${path}`, {
      query: Object.fromEntries(url.searchParams),
    })
  }

  const response = await context.next()

  // Add request ID to response headers
  const newResponse = new Response(response.body, response)
  newResponse.headers.set('X-Request-ID', requestId)

  return newResponse
}
