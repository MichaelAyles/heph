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

    // @description shortcut
    const description = dynamicContext.projectState.spec?.description as string | undefined
    variables.push({
      name: '@description',
      description: "User's original project description",
      value: description || '(No description available)',
      type: 'string',
      requiresProject: true,
    })

    // @decisions shortcut
    const decisions = dynamicContext.projectState.spec?.decisions as
      | Array<{ question: string; answer: string }>
      | undefined
    const decisionsFormatted =
      decisions && decisions.length > 0
        ? decisions.map((d) => `- ${d.question}: ${d.answer}`).join('\n')
        : '(No user decisions recorded)'
    variables.push({
      name: '@decisions',
      description: 'Formatted list of user decisions (question: answer)',
      value: decisionsFormatted,
      type: 'string',
      requiresProject: true,
    })

    // @selectedBlueprintPrompt shortcut
    const spec = dynamicContext.projectState.spec as Record<string, unknown> | null
    const selectedIndex = spec?.selectedBlueprint as number | undefined
    const blueprints = spec?.blueprints as Array<{ prompt?: string; url?: string }> | undefined
    let blueprintPrompt = '(No blueprint selected)'
    if (
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
    ) {
      blueprintPrompt = blueprints[selectedIndex]?.prompt || '(No prompt for selected blueprint)'
    }
    variables.push({
      name: '@selectedBlueprintPrompt',
      description: "The selected blueprint's prompt text",
      value: blueprintPrompt,
      type: 'string',
      requiresProject: true,
    })

    // @visualization - all blueprint renders
    const visualizationsFormatted =
      blueprints && blueprints.length > 0
        ? blueprints
            .map(
              (b, i) => `[${i}] URL: ${b.url || '(pending)'}\n    Prompt: ${b.prompt || '(none)'}`
            )
            .join('\n')
        : '(No visualizations generated)'
    variables.push({
      name: '@visualization',
      description: 'All generated product visualization renders',
      value: visualizationsFormatted,
      type: 'string',
      requiresProject: true,
    })

    // @visualization.selected - the selected blueprint
    let selectedVisualization: unknown = '(No visualization selected)'
    if (
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
    ) {
      const selected = blueprints[selectedIndex]
      selectedVisualization = {
        index: selectedIndex,
        url: selected?.url || null,
        prompt: selected?.prompt || null,
      }
    }
    variables.push({
      name: '@visualization.selected',
      description: 'The user-selected visualization render',
      value: selectedVisualization,
      type: 'object',
      requiresProject: true,
    })

    // @image: variables - these ATTACH images to the LLM call (not just text)
    const selectedImageUrl =
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
        ? blueprints[selectedIndex]?.url || null
        : null
    variables.push({
      name: '@image:visualization.selected',
      description: 'ATTACH the selected visualization image to the LLM call (multimodal)',
      value: selectedImageUrl ? `[Will attach: ${selectedImageUrl}]` : '(No image available)',
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@image:visualization.0',
      description: 'ATTACH visualization at index 0 to the LLM call (multimodal)',
      value:
        blueprints && blueprints[0]?.url
          ? `[Will attach: ${blueprints[0].url}]`
          : '(No image available)',
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
      name: '@description',
      description: "User's original project description (select a project)",
      value: null,
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@decisions',
      description: 'Formatted list of user decisions (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@selectedBlueprintPrompt',
      description: "The selected blueprint's prompt text (select a project)",
      value: null,
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@visualization',
      description: 'All generated product visualization renders (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@visualization.selected',
      description: 'The user-selected visualization render (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
    })
    variables.push({
      name: '@image:visualization.selected',
      description: 'ATTACH the selected visualization image to the LLM call (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
    })
    variables.push({
      name: '@image:visualization.0',
      description: 'ATTACH visualization at index 0 to the LLM call (select a project)',
      value: null,
      type: 'string',
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
