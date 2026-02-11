import type { Env } from '../env'
import { createLogger } from './logger'

const DEFAULT_NOTIFICATION_USERS = ['ycombinator', 'gemini3', 'mike']

function parseNotifyUsers(rawUsers?: string): string[] {
  const users = (
    rawUsers
      ?.split(',')
      .map((user) => user.trim().toLowerCase())
      .filter(Boolean) ?? DEFAULT_NOTIFICATION_USERS
  ).filter((user, index, allUsers) => allUsers.indexOf(user) === index)

  return users
}

export function getTrackedLoginUsers(rawUsers?: string): string[] {
  return parseNotifyUsers(rawUsers)
}

function shouldNotifyForUser(username: string, rawUsers?: string): boolean {
  const users = new Set(parseNotifyUsers(rawUsers))
  return users.has(username.trim().toLowerCase())
}

interface LoginNotificationOptions {
  env: Env
  userId?: string
  username: string
  loginMethod: 'password' | 'oauth'
  ipAddress?: string
}

export async function maybeNotifyWatchedLogin({
  env,
  userId,
  username,
  loginMethod,
  ipAddress,
}: LoginNotificationOptions): Promise<void> {
  const webhookUrl = env.LOGIN_NOTIFY_WEBHOOK_URL
  const normalizedUsername = username.trim().toLowerCase()

  if (!shouldNotifyForUser(normalizedUsername, env.LOGIN_NOTIFY_USERS)) {
    return
  }

  const timestamp = new Date().toISOString()
  const text = `Login alert: ${normalizedUsername} signed in via ${loginMethod} at ${timestamp}${ipAddress ? ` from ${ipAddress}` : ''}`

  // Persist tracked logins so admin UI can show counts/recency even without webhook.
  try {
    const eventId = crypto.randomUUID().replace(/-/g, '')
    await env.DB.prepare(
      `INSERT INTO tracked_login_events (id, user_id, username, login_method, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(eventId, userId || null, normalizedUsername, loginMethod, ipAddress || null)
      .run()
  } catch (error) {
    const logger = createLogger(env)
    await logger.warn('auth', 'Failed to persist tracked login event', {
      username: normalizedUsername,
      loginMethod,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!webhookUrl) {
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        content: text,
        event: 'watched_login',
        username: normalizedUsername,
        loginMethod,
        timestamp,
        ipAddress: ipAddress || null,
      }),
    })

    if (!response.ok) {
      const logger = createLogger(env)
      await logger.warn('auth', 'Watched login notification failed', {
        username: normalizedUsername,
        loginMethod,
        status: response.status,
      })
    }
  } catch (error) {
    const logger = createLogger(env)
    await logger.warn('auth', 'Watched login notification error', {
      username: normalizedUsername,
      loginMethod,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const __testables = {
  parseNotifyUsers,
  shouldNotifyForUser,
}
