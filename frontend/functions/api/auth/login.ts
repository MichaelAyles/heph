/**
 * POST /api/auth/login
 * Password authentication with bcrypt and rate limiting
 */

import bcrypt from 'bcryptjs'
import type { Env } from '../../env'

interface LoginRequest {
  username: string
  password: string
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minute lockout after max attempts

// In-memory rate limiting (resets on worker restart, but good enough for basic protection)
// For production, consider using Cloudflare's Rate Limiting or D1
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>()

function getClientIdentifier(request: Request): string {
  // Use CF-Connecting-IP header (set by Cloudflare) or fall back to a hash of user-agent
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             'unknown'
  return ip
}

function checkRateLimit(clientId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const record = loginAttempts.get(clientId)

  // Check if client is locked out
  if (record?.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) }
  }

  // Clean up expired records
  if (record && now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(clientId)
    return { allowed: true }
  }

  // Check attempt count
  if (record && record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    // Lock the client out
    record.lockedUntil = now + LOCKOUT_DURATION_MS
    return { allowed: false, retryAfter: Math.ceil(LOCKOUT_DURATION_MS / 1000) }
  }

  return { allowed: true }
}

function recordLoginAttempt(clientId: string, success: boolean): void {
  const now = Date.now()

  if (success) {
    // Clear record on successful login
    loginAttempts.delete(clientId)
    return
  }

  const record = loginAttempts.get(clientId)
  if (record && now - record.firstAttempt < RATE_LIMIT_WINDOW_MS) {
    record.count++
  } else {
    loginAttempts.set(clientId, { count: 1, firstAttempt: now })
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context
  const clientId = getClientIdentifier(context.request)

  // Check rate limit before processing
  const rateLimit = checkRateLimit(clientId)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter || 1800),
        }
      }
    )
  }

  try {
    const body = (await context.request.json()) as LoginRequest
    const { username, password } = body

    if (!username || !password) {
      return Response.json({ error: 'Username and password required' }, { status: 400 })
    }

    // Find user by username
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, display_name, is_admin FROM users WHERE username = ?'
    )
      .bind(username.toLowerCase())
      .first<{
        id: string
        username: string
        password_hash: string
        display_name: string | null
        is_admin: number
      }>()

    if (!user) {
      recordLoginAttempt(clientId, false)
      return Response.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Check password - support both bcrypt hashes and legacy plaintext during migration
    const isValidPassword = user.password_hash.startsWith('$2')
      ? await bcrypt.compare(password, user.password_hash)
      : user.password_hash === password

    if (!isValidPassword) {
      recordLoginAttempt(clientId, false)
      return Response.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Successful login - clear rate limit record
    recordLoginAttempt(clientId, true)

    // If password was plaintext, upgrade to bcrypt hash
    if (!user.password_hash.startsWith('$2')) {
      const hashedPassword = await bcrypt.hash(password, 10)
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(hashedPassword, user.id)
        .run()
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
        isAdmin: user.is_admin === 1,
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
