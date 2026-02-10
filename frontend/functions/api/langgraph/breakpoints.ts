/**
 * Debug Breakpoints List API
 *
 * GET /api/langgraph/breakpoints
 *
 * Lists pending debug breakpoints for the current user.
 * Used for recovery if page reloads while a breakpoint is pending.
 */

import type { Env } from '../../env'
import { safeJsonParse } from '../../lib/json'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: string
}

interface BreakpointRow {
  id: string
  project_id: string | null
  thread_id: string | null
  node_name: string
  system_prompt: string
  user_context: string
  full_input: string
  invocation_config: string | null
  token_estimate: number | null
  created_at: string
  expires_at: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all non-expired breakpoints for this user
  const result = await env.DB.prepare(
    `SELECT id, project_id, thread_id, node_name, system_prompt, user_context,
            full_input, invocation_config, token_estimate, created_at, expires_at
     FROM debug_breakpoints
     WHERE user_id = ? AND expires_at > datetime('now')
     ORDER BY created_at DESC`
  )
    .bind(user.id)
    .all<BreakpointRow>()

  const breakpoints = result.results.map((row) => ({
    id: row.id,
    nodeName: row.node_name,
    systemPrompt: row.system_prompt,
    userContext: row.user_context,
    fullInput: safeJsonParse(row.full_input, {}),
    invocationConfig: safeJsonParse(row.invocation_config, null),
    tokenEstimate: row.token_estimate || 0,
    projectId: row.project_id || undefined,
    threadId: row.thread_id || undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))

  return Response.json({ breakpoints })
}
