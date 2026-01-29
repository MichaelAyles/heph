/**
 * Debug Breakpoint Test API
 *
 * POST /api/langgraph/breakpoint/:id/test
 *
 * Tests the LLM call without resolving the breakpoint.
 * Allows users to iterate on prompts before continuing execution.
 */

import type { Env } from '../../../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: string
}

interface TestRequest {
  systemPromptOverride?: string
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

  // Parse request body (optional)
  let body: TestRequest = {}
  try {
    const text = await request.text()
    if (text) {
      body = JSON.parse(text)
    }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
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

  // Build the config, optionally with a system prompt override
  const config = breakpoint.invocation_config ? JSON.parse(breakpoint.invocation_config) : {}

  // If there's a system prompt override, we need to update the breakpoint record temporarily
  // for the invoke call to pick up, or we need to pass it differently.
  // Actually, let's use a custom header to pass the override
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: request.headers.get('Cookie') || '',
    'X-Skip-Debug-Breakpoint': 'true',
  }

  if (body.systemPromptOverride) {
    headers['X-System-Prompt-Override'] = encodeURIComponent(body.systemPromptOverride)
  }

  // Invoke the node with the skip header (don't delete breakpoint)
  const invokeUrl = new URL(`/api/langgraph/invoke/${breakpoint.node_name}`, request.url)

  const invokeBody = {
    input: JSON.parse(breakpoint.full_input),
    projectId: breakpoint.project_id || undefined,
    threadId: breakpoint.thread_id || undefined,
    config,
  }

  const invokeResponse = await fetch(invokeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(invokeBody),
  })

  // Pass through the response from the invoke call
  const result = await invokeResponse.json()

  // Don't delete the breakpoint - user can test multiple times
  return Response.json(result, { status: invokeResponse.status })
}
