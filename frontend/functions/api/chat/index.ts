/**
 * Chat API Endpoint
 *
 * POST /api/chat - Main chat endpoint for the PHAESTUS LangGraph
 *
 * Request:
 * {
 *   message: string
 *   sessionId?: string  // For conversation continuity
 * }
 *
 * Response:
 * {
 *   response: string
 *   intent: "new_project" | "load_project" | "question" | "unknown"
 *   route: "REJECT" | "CLARIFY" | "PROCEED" | null
 *   assessment?: CapabilityAssessment
 *   projectId?: string  // Set when project loaded
 *   sessionId: string
 * }
 */

import type { Env } from '../../env'
import { runGraph, type GraphConfig, type ProjectSummary } from '../../../src/services/langgraph'
import { createLogger } from '../../lib/logger'
import type { PagesFunction, User } from '../../lib/message-types'

// =============================================================================
// Project Fetching
// =============================================================================

interface ProjectRow {
  id: string
  name: string
  status: string
  description: string | null
  updated_at: string
}

/**
 * Fetch user's projects for intent routing
 */
async function fetchUserProjects(
  db: Env['DB'],
  userId: string
): Promise<ProjectSummary[]> {
  const result = await db
    .prepare(
      `SELECT id, name, status, description, updated_at
       FROM projects
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 20`
    )
    .bind(userId)
    .all<ProjectRow>()

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    description: row.description,
    updatedAt: row.updated_at,
  }))
}

interface ChatRequest {
  message: string
  sessionId?: string
}

// =============================================================================
// Request Handler
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  try {
    const body = (await context.request.json()) as ChatRequest
    const { message, sessionId } = body

    await logger.debug('api', 'Chat request received', {
      messageLength: message?.length,
      sessionId,
    })

    // Validate input
    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > 2000) {
      return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    // Fetch user's projects for intent routing
    const userProjects = await fetchUserProjects(env.DB, user.id)

    // Build graph config
    const config: GraphConfig = {
      threadId: sessionId,
      userProjects,
      userId: user.id,
    }

    // Run the graph
    const result = await runGraph(message, config)

    await logger.info('api', 'Chat completed', {
      intent: result.intent,
      route: result.route,
      projectId: result.projectId,
      matchedProject: result.matchedProject?.name,
      sessionId: result.sessionId,
    })

    // Return response with debug info
    return Response.json({
      response: result.response,
      intent: result.intent,
      route: result.route,
      assessment: result.state.capabilityAssessment,
      matchedProject: result.matchedProject,
      projectId: result.projectId,
      sessionId: result.sessionId,
      debug: result.state.debug,
    })
  } catch (error) {
    await logger.error('api', 'Chat error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
