/**
 * POST /api/auth/login
 * Simple password authentication
 */

import type { Env } from '../../env'

interface LoginRequest {
  username: string
  password: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    const body = (await context.request.json()) as LoginRequest
    const { username, password } = body

    if (!username || !password) {
      return Response.json({ error: 'Username and password required' }, { status: 400 })
    }

    // Find user by username
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, display_name FROM users WHERE username = ?'
    )
      .bind(username.toLowerCase())
      .first<{ id: string; username: string; password_hash: string; display_name: string | null }>()

    if (!user) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Simple password check (plaintext for now - upgrade to bcrypt later)
    if (user.password_hash !== password) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Create session (expires in 7 days)
    const sessionId = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, user.id, expiresAt)
      .run()

    // Update last login
    await env.DB.prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?')
      .bind(user.id)
      .run()

    // Set session cookie
    const response = Response.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
      },
    })

    // Clone response to add cookie header
    const headers = new Headers(response.headers)
    headers.set(
      'Set-Cookie',
      `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${context.request.url.startsWith('https') ? '; Secure' : ''}`
    )

    return new Response(response.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('Login error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
