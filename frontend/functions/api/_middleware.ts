/**
 * API Middleware
 * Handles authentication for protected routes
 */

import type { Env } from '../env'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/blocks']

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname

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

  // Validate session
  const { env } = context
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first<{ id: string; username: string; display_name: string | null }>()

  if (!result) {
    return Response.json({ error: 'Session expired' }, { status: 401 })
  }

  // Attach user to context data for downstream handlers
  context.data.user = {
    id: result.id,
    username: result.username,
    displayName: result.display_name,
  }

  return context.next()
}
