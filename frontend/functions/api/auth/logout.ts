/**
 * POST /api/auth/logout
 * Clear session
 */

import type { Env } from '../../env'
import { createLogger } from '../../lib/logger'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    // Get session from cookie
    const cookie = context.request.headers.get('Cookie') || ''
    const sessionMatch = cookie.match(/session=([^;]+)/)
    const sessionId = sessionMatch?.[1]

    if (sessionId) {
      // Delete session from DB
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
    }

    // Clear cookie
    const headers = new Headers()
    headers.set(
      'Set-Cookie',
      `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${context.request.url.startsWith('https') ? '; Secure' : ''}`
    )

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('auth', 'Logout error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
