/**
 * LangGraph Context API
 *
 * GET /api/admin/langgraph/context?projectId=xxx
 *
 * Returns the dynamic context that would be available for template variables.
 * Used by the admin UI to preview and test variables.
 */

import type { Env } from '../../../env'

interface User {
  id: string
  isAdmin: boolean
}

interface BlockInfo {
  slug: string
  name: string
  category: string
  description: string
  interfaces: string[]
}

interface DynamicContext {
  availableBlocks: BlockInfo[]
  projectState?: {
    status: string
    spec: Record<string, unknown> | null
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

  const dynamicContext: DynamicContext = {
    availableBlocks: [],
  }

  // Fetch available blocks (always available)
  const blocksResult = await env.DB.prepare(
    `SELECT slug, definition FROM pcb_blocks WHERE is_active = 1`
  ).all<{ slug: string; definition: string | null }>()

  dynamicContext.availableBlocks = (blocksResult.results || [])
    .map((row) => {
      try {
        const def = row.definition ? JSON.parse(row.definition) : null
        return {
          slug: row.slug,
          name: def?.metadata?.name || def?.name || row.slug,
          category: def?.metadata?.category || def?.category || 'unknown',
          description: def?.metadata?.description || def?.description || '',
          interfaces: def?.electrical?.interfaces ? Object.keys(def.electrical.interfaces) : [],
        }
      } catch {
        return {
          slug: row.slug,
          name: row.slug,
          category: 'unknown',
          description: '',
          interfaces: [],
        }
      }
    })
    .filter((b) => b.name)

  // Fetch project state if projectId provided
  if (projectId) {
    const projectRow = await env.DB.prepare(`SELECT status, spec FROM projects WHERE id = ?`)
      .bind(projectId)
      .first<{ status: string; spec: string | null }>()

    if (projectRow) {
      dynamicContext.projectState = {
        status: projectRow.status,
        spec: projectRow.spec ? JSON.parse(projectRow.spec) : null,
      }
    }
  }

  // Build available variables with their current values
  const variables: Array<{
    name: string
    description: string
    value: unknown
    type: 'string' | 'object' | 'array'
    requiresProject: boolean
  }> = []

  // @availableBlocks
  variables.push({
    name: '@availableBlocks',
    description: 'List of available hardware blocks formatted for prompts',
    value: dynamicContext.availableBlocks
      .map(
        (b) =>
          `- ${b.name} (${b.category}): ${b.description}${b.interfaces?.length ? ` [${b.interfaces.join(', ')}]` : ''}`
      )
      .join('\n'),
    type: 'string',
    requiresProject: false,
  })

  // @projectState (requires project)
  if (dynamicContext.projectState) {
    variables.push({
      name: '@projectState',
      description: 'Full project state object',
      value: dynamicContext.projectState,
      type: 'object',
      requiresProject: true,
    })

    variables.push({
      name: '@projectState.status',
      description: 'Current project status',
      value: dynamicContext.projectState.status,
      type: 'string',
      requiresProject: true,
    })

    // @feasibility shortcuts
    const feasibility = dynamicContext.projectState.spec?.feasibility as
      | Record<string, unknown>
      | undefined
    if (feasibility) {
      variables.push({
        name: '@feasibility',
        description: 'Full feasibility analysis object',
        value: feasibility,
        type: 'object',
        requiresProject: true,
      })

      // Add specific feasibility fields
      if (feasibility.suggestedRevisions) {
        const revisions = feasibility.suggestedRevisions as Record<string, unknown>
        variables.push({
          name: '@feasibility.suggestedRevisions.revisedDescription',
          description: 'AI-revised project description',
          value: revisions.revisedDescription,
          type: 'string',
          requiresProject: true,
        })
        variables.push({
          name: '@feasibility.suggestedRevisions.summary',
          description: 'Summary of suggested changes',
          value: revisions.summary,
          type: 'string',
          requiresProject: true,
        })
        variables.push({
          name: '@feasibility.suggestedRevisions.changes',
          description: 'List of suggested changes',
          value: revisions.changes,
          type: 'array',
          requiresProject: true,
        })
      }

      if (feasibility.communication) {
        const comm = feasibility.communication as Record<string, unknown>
        variables.push({
          name: '@feasibility.communication.type',
          description: 'Communication type (e.g., BLE 5.0)',
          value: comm.type,
          type: 'string',
          requiresProject: true,
        })
      }

      if (feasibility.overallScore !== undefined) {
        variables.push({
          name: '@feasibility.overallScore',
          description: 'Feasibility score (0-100)',
          value: feasibility.overallScore,
          type: 'string',
          requiresProject: true,
        })
      }

      if (feasibility.inputs) {
        const inputs = feasibility.inputs as Record<string, unknown>
        variables.push({
          name: '@feasibility.inputs.items',
          description: 'List of input components',
          value: inputs.items,
          type: 'array',
          requiresProject: true,
        })
      }

      if (feasibility.outputs) {
        const outputs = feasibility.outputs as Record<string, unknown>
        variables.push({
          name: '@feasibility.outputs.items',
          description: 'List of output components',
          value: outputs.items,
          type: 'array',
          requiresProject: true,
        })
      }
    }
  } else if (!projectId) {
    // Show placeholders for project-specific variables when no project selected
    variables.push({
      name: '@projectState',
      description: 'Full project state object (select a project to view)',
      value: null,
      type: 'object',
      requiresProject: true,
    })
    variables.push({
      name: '@feasibility',
      description: 'Feasibility analysis (select a project with feasibility data)',
      value: null,
      type: 'object',
      requiresProject: true,
    })
    variables.push({
      name: '@feasibility.suggestedRevisions.revisedDescription',
      description: 'AI-revised project description (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
    })
  }

  return Response.json({
    context: dynamicContext,
    variables,
    projectId: projectId || null,
  })
}
