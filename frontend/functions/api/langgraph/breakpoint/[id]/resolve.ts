/**
 * Debug Breakpoint Resolution API
 *
 * POST /api/langgraph/breakpoint/:id/resolve
 *
 * Resolves a pending debug breakpoint by either continuing execution or cancelling.
 */

import type { Env } from '../../../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: string
}

interface ResolveRequest {
  action: 'continue' | 'cancel'
}

interface BreakpointRow {
  id: string
  user_id: string
  project_id: string | null
  thread_id: string | null
  node_name: string
  system_prompt: string
  user_context: string
  full_input: string
  invocation_config: string | null
  token_estimate: number | null
  expires_at: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, params, request } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const breakpointId = params.id as string

  // Parse request body
  let body: ResolveRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'continue' && body.action !== 'cancel') {
    return Response.json({ error: 'action must be "continue" or "cancel"' }, { status: 400 })
  }

  // Get the breakpoint
  const breakpoint = await env.DB.prepare(
    `SELECT id, user_id, project_id, thread_id, node_name, system_prompt,
            user_context, full_input, invocation_config, token_estimate, expires_at
     FROM debug_breakpoints
     WHERE id = ?`
  )
    .bind(breakpointId)
    .first<BreakpointRow>()

  if (!breakpoint) {
    return Response.json({ error: 'Breakpoint not found' }, { status: 404 })
  }

  // Check ownership
  if (breakpoint.user_id !== user.id && !user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if expired
  if (new Date(breakpoint.expires_at) < new Date()) {
    // Delete expired breakpoint
    await env.DB.prepare('DELETE FROM debug_breakpoints WHERE id = ?').bind(breakpointId).run()
    return Response.json({ error: 'Breakpoint expired', expired: true }, { status: 410 })
  }

  // Delete the breakpoint record
  await env.DB.prepare('DELETE FROM debug_breakpoints WHERE id = ?').bind(breakpointId).run()

  // If cancelled, just return the cancellation result
  if (body.action === 'cancel') {
    return Response.json({ cancelled: true, breakpointId })
  }

  // If continuing, re-invoke the node with the skip header
  const invokeUrl = new URL(`/api/langgraph/invoke/${breakpoint.node_name}`, request.url)

  const invokeBody = {
    input: JSON.parse(breakpoint.full_input),
    projectId: breakpoint.project_id || undefined,
    threadId: breakpoint.thread_id || undefined,
    config: breakpoint.invocation_config ? JSON.parse(breakpoint.invocation_config) : undefined,
  }

  const invokeResponse = await fetch(invokeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: request.headers.get('Cookie') || '',
      'X-Skip-Debug-Breakpoint': 'true',
    },
    body: JSON.stringify(invokeBody),
  })

  // Pass through the response from the invoke call
  const result = await invokeResponse.json()
  return Response.json(result, { status: invokeResponse.status })
}
