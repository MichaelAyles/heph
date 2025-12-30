/**
 * GET /api/auth/me
 * Get current authenticated user
 */

import type { Env } from '../../env'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    // Get session from cookie
    const cookie = context.request.headers.get('Cookie') || ''
    const sessionMatch = cookie.match(/session=([^;]+)/)
    const sessionId = sessionMatch?.[1]

    if (!sessionId) {
      return Response.json({ user: null }, { status: 200 })
    }

    // Find valid session and user
    const result = await env.DB.prepare(
      `SELECT u.id, u.username, u.display_name
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
      .bind(sessionId)
      .first<{ id: string; username: string; display_name: string | null }>()

    if (!result) {
      // Session expired or invalid - clear cookie
      const headers = new Headers()
      headers.set('Content-Type', 'application/json')
      headers.set(
        'Set-Cookie',
        `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${context.request.url.startsWith('https') ? '; Secure' : ''}`
      )
      return new Response(JSON.stringify({ user: null }), { status: 200, headers })
    }

    return Response.json({
      user: {
        id: result.id,
        username: result.username,
        displayName: result.display_name,
      },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
