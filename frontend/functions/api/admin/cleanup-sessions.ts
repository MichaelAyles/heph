/**
 * POST /api/admin/cleanup-sessions
 * Clean up expired sessions from the database
 * Admin-only endpoint
 */

import type { Env } from '../../env'
import { createLogger } from '../../lib/logger'

interface CleanupResult {
  deletedCount: number
  remainingCount: number
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const requestId = data.requestId as string

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const logger = createLogger(env, user as any, requestId)

  try {
    // Get count of expired sessions before deletion
    const beforeCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM sessions WHERE expires_at <= datetime('now')`
    ).first<{ count: number }>()

    // Delete expired sessions
    const result = await env.DB.prepare(
      `DELETE FROM sessions WHERE expires_at <= datetime('now')`
    ).run()

    // Get remaining session count
    const afterCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM sessions'
    ).first<{ count: number }>()

    const cleanupResult: CleanupResult = {
      deletedCount: beforeCount?.count || 0,
      remainingCount: afterCount?.count || 0,
    }

    await logger.info(`Session cleanup: deleted ${cleanupResult.deletedCount} expired sessions`)

    return Response.json({
      success: true,
      ...cleanupResult,
      message: `Cleaned up ${cleanupResult.deletedCount} expired session(s)`,
    })
  } catch (error) {
    await logger.error('db', 'Session cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    return Response.json(
      { error: 'Failed to clean up sessions' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/cleanup-sessions
 * Get session statistics
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) as active
      FROM sessions
    `).first<{ total: number; expired: number; active: number }>()

    return Response.json({
      sessions: {
        total: stats?.total || 0,
        expired: stats?.expired || 0,
        active: stats?.active || 0,
      },
    })
  } catch (error) {
    return Response.json(
      { error: 'Failed to get session stats' },
      { status: 500 }
    )
  }
}
