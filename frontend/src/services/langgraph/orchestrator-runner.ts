/**
 * Orchestrator Runner Client
 *
 * Thin client for /api/langgraph/orchestrator/run.
 * Enables stage pages to trigger LangGraph node sequences through one entrypoint.
 */

export interface OrchestratorRunStep {
  nodeName: string
  input?: Record<string, unknown>
  config?: {
    temperature?: number
    model?: string
    maxTokens?: number
  }
}

export interface OrchestratorRunRequest {
  projectId?: string
  threadId?: string
  steps: OrchestratorRunStep[]
  stopOnError?: boolean
}

export interface OrchestratorStepResult {
  nodeName: string
  ok: boolean
  output?: Record<string, unknown>
  nodeId?: string
  debug?: Record<string, unknown>
  error?: string
}

export interface OrchestratorRunResponse {
  success: boolean
  projectId: string | null
  threadId: string | null
  steps: OrchestratorStepResult[]
}

export async function runOrchestratorSequence(
  request: OrchestratorRunRequest
): Promise<OrchestratorRunResponse> {
  const res = await fetch('/api/langgraph/orchestrator/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  const data = (await res.json()) as OrchestratorRunResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || 'Failed to run orchestrator sequence')
  }
  return data
}

export async function runOrchestratorNode(params: {
  nodeName: string
  projectId?: string
  threadId?: string
  input?: Record<string, unknown>
  config?: {
    temperature?: number
    model?: string
    maxTokens?: number
  }
}): Promise<{
  output: Record<string, unknown>
  nodeId: string
  debug?: Record<string, unknown>
}> {
  const result = await runOrchestratorSequence({
    projectId: params.projectId,
    threadId: params.threadId,
    steps: [
      {
        nodeName: params.nodeName,
        input: params.input || {},
        config: params.config,
      },
    ],
    stopOnError: true,
  })

  const first = result.steps[0]
  if (!first?.ok || !first.output || !first.nodeId) {
    throw new Error(first?.error || `Node "${params.nodeName}" failed`)
  }

  return {
    output: first.output,
    nodeId: first.nodeId,
    debug: first.debug,
  }
}
