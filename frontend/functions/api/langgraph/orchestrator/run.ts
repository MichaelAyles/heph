/**
 * LangGraph Orchestrator Runner API
 *
 * POST /api/langgraph/orchestrator/run
 *
 * Runs a sequence of LangGraph nodes using the existing production invoke API.
 * This provides a single orchestration entrypoint while preserving current
 * node implementations and prompt expansion behavior.
 */

import type { Env } from '../../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

interface OrchestratorStep {
  nodeName: string
  input?: Record<string, unknown>
  config?: {
    temperature?: number
    model?: string
    maxTokens?: number
  }
}

interface OrchestratorRunRequest {
  projectId?: string
  threadId?: string
  steps: OrchestratorStep[]
  stopOnError?: boolean
}

interface StepResult {
  nodeName: string
  ok: boolean
  output?: Record<string, unknown>
  nodeId?: string
  debug?: Record<string, unknown>
  error?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: OrchestratorRunRequest
  try {
    body = (await context.request.json()) as OrchestratorRunRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return Response.json(
      { error: 'steps is required and must be a non-empty array' },
      { status: 400 }
    )
  }

  // Verify project access if provided
  if (body.projectId) {
    const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
      .bind(body.projectId)
      .first<{ user_id: string }>()

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.user_id !== user.id && !user.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const stopOnError = body.stopOnError !== false
  const stepResults: StepResult[] = []
  const baseUrl = new URL(context.request.url)

  for (const step of body.steps) {
    if (!step?.nodeName || typeof step.nodeName !== 'string') {
      stepResults.push({
        nodeName: '(invalid)',
        ok: false,
        error: 'Each step must include a valid nodeName',
      })
      if (stopOnError) break
      continue
    }

    const invokeUrl = new URL(`/api/langgraph/invoke/${step.nodeName}`, baseUrl)
    const invokeRes = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.request.headers.get('Cookie') || '',
        // Prevent debug breakpoints from pausing orchestration loops.
        'X-Skip-Debug-Breakpoint': 'true',
      },
      body: JSON.stringify({
        input: step.input || {},
        projectId: body.projectId,
        threadId: body.threadId,
        config: step.config,
      }),
    })

    if (!invokeRes.ok) {
      let errorMessage = `Failed to invoke node "${step.nodeName}"`
      try {
        const errJson = (await invokeRes.json()) as { error?: string }
        if (errJson.error) errorMessage = errJson.error
      } catch {
        // Keep default error message.
      }

      stepResults.push({
        nodeName: step.nodeName,
        ok: false,
        error: errorMessage,
      })

      if (stopOnError) break
      continue
    }

    const invokeData = (await invokeRes.json()) as {
      output: Record<string, unknown>
      nodeId: string
      debug: Record<string, unknown>
    }

    stepResults.push({
      nodeName: step.nodeName,
      ok: true,
      output: invokeData.output,
      nodeId: invokeData.nodeId,
      debug: invokeData.debug,
    })
  }

  const success = stepResults.length > 0 && stepResults.every((r) => r.ok)
  return Response.json({
    success,
    projectId: body.projectId || null,
    threadId: body.threadId || null,
    steps: stepResults,
  })
}
