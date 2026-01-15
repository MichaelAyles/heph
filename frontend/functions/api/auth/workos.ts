/**
 * WorkOS OAuth Initiation
 *
 * Redirects user to WorkOS AuthKit for Google OAuth login.
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  // Determine redirect URI based on request origin
  const url = new URL(request.url)
  const redirectUri = `${url.origin}/api/auth/callback`

  // Generate state for CSRF protection
  const state = crypto.randomUUID()

  // Build WorkOS authorization URL
  const authUrl = new URL('https://api.workos.com/user_management/authorize')
  authUrl.searchParams.set('client_id', env.WORKOS_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('provider', 'authkit')

  // Store state in cookie for verification on callback
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`,
    },
  })

  return response
}
