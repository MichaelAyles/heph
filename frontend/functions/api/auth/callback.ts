/**
 * WorkOS OAuth Callback
 *
 * Handles the OAuth callback from WorkOS, creates/finds user in D1,
 * creates session, and redirects to app.
 */

import type { Env } from '../../env'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface WorkOSUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  profile_picture_url: string | null
}

interface WorkOSAuthResponse {
  user: WorkOSUser
  access_token: string
  refresh_token: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const url = new URL(request.url)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, url.searchParams.get('error_description'))
    return redirectWithError('OAuth authorization failed')
  }

  if (!code) {
    return redirectWithError('Missing authorization code')
  }

  // Verify state (CSRF protection)
  const cookies = request.headers.get('Cookie') || ''
  const storedState = cookies.match(/oauth_state=([^;]+)/)?.[1]

  if (!storedState || storedState !== state) {
    return redirectWithError('Invalid state parameter')
  }

  try {
    // Exchange code for user info
    const tokenResponse = await fetch(
      'https://api.workos.com/user_management/authenticate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.WORKOS_CLIENT_ID,
          client_secret: env.WORKOS_API_KEY,
          grant_type: 'authorization_code',
          code,
        }),
      }
    )

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return redirectWithError('Authentication failed')
    }

    const authData = (await tokenResponse.json()) as WorkOSAuthResponse
    const workosUser = authData.user

    // Find or create user in D1
    let user = await env.DB.prepare(
      'SELECT id, username, display_name, is_admin, is_approved FROM users WHERE workos_id = ?'
    )
      .bind(workosUser.id)
      .first<{ id: string; username: string; display_name: string | null; is_admin: number; is_approved: number }>()

    let isNewUser = false

    if (!user) {
      // Check if user exists by email (for linking)
      const existingByEmail = await env.DB.prepare(
        'SELECT id FROM users WHERE username = ?'
      )
        .bind(workosUser.email)
        .first<{ id: string }>()

      if (existingByEmail) {
        // Link WorkOS to existing user
        await env.DB.prepare('UPDATE users SET workos_id = ? WHERE id = ?')
          .bind(workosUser.id, existingByEmail.id)
          .run()

        user = await env.DB.prepare(
          'SELECT id, username, display_name, is_admin, is_approved FROM users WHERE id = ?'
        )
          .bind(existingByEmail.id)
          .first()
      } else {
        // Create new user (not approved by default)
        isNewUser = true
        const userId = crypto.randomUUID().replace(/-/g, '')
        const displayName = [workosUser.first_name, workosUser.last_name]
          .filter(Boolean)
          .join(' ') || null

        await env.DB.prepare(
          `INSERT INTO users (id, username, password_hash, display_name, workos_id, is_admin, is_approved)
           VALUES (?, ?, '', ?, ?, 0, 0)`
        )
          .bind(userId, workosUser.email, displayName, workosUser.id)
          .run()

        user = {
          id: userId,
          username: workosUser.email,
          display_name: displayName,
          is_admin: 0,
          is_approved: 0,
        }
      }
    }

    // Check if user is approved
    if (!user!.is_approved) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/?access_requested=true',
          'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/',
        },
      })
    }

    // Create session
    const sessionId = crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    )
      .bind(sessionId, user!.id, expiresAt)
      .run()

    // Update last login
    await env.DB.prepare(
      "UPDATE users SET last_login_at = datetime('now') WHERE id = ?"
    )
      .bind(user!.id)
      .run()

    // Redirect to app with session cookie
    const isSecure = url.protocol === 'https:'
    const cookieOptions = `HttpOnly; SameSite=Lax; Max-Age=604800; Path=/${isSecure ? '; Secure' : ''}`

    const headers = new Headers()
    headers.set('Location', '/')
    headers.append('Set-Cookie', `session=${sessionId}; ${cookieOptions}`)
    headers.append('Set-Cookie', 'oauth_state=; Max-Age=0; Path=/')

    return new Response(null, { status: 302, headers })
  } catch (err) {
    console.error('OAuth callback error:', err)
    return redirectWithError('Authentication failed')
  }
}

function redirectWithError(message: string): Response {
  // Redirect to login with error
  const params = new URLSearchParams({ error: message })
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/?auth_error=${encodeURIComponent(message)}`,
      'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/',
    },
  })
}
