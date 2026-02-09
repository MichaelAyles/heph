/**
 * Admin tracked login summary endpoint.
 * GET /api/admin/logins
 */

import type { Env } from '../../env'
import { getTrackedLoginUsers } from '../../lib/login-notifier'

interface TrackedLoginRow {
  username: string
  login_count: number
  most_recent_login_at: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const trackedUsers = getTrackedLoginUsers(env.LOGIN_NOTIFY_USERS)
  if (trackedUsers.length === 0) {
    return Response.json({ users: [], trackedUsers: [] })
  }

  const placeholders = trackedUsers.map(() => '?').join(', ')

  const { results } = await env.DB.prepare(
    `SELECT
      username,
      COUNT(*) as login_count,
      MAX(created_at) as most_recent_login_at
     FROM tracked_login_events
     WHERE username IN (${placeholders})
     GROUP BY username`
  )
    .bind(...trackedUsers)
    .all<TrackedLoginRow>()

  const summaryByUser = new Map(results.map((row) => [row.username, row]))
  const users = trackedUsers.map((username) => {
    const row = summaryByUser.get(username)
    return {
      username,
      loginCount: row?.login_count ?? 0,
      mostRecentLoginAt: row?.most_recent_login_at ?? null,
    }
  })

  return Response.json({ users, trackedUsers })
}
