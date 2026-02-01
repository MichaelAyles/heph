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

/**
 * Estimate token count for a value (~4 chars per token)
 */
function estimateTokens(value: unknown): number {
  if (value === null || value === undefined) return 0
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.ceil(str.length / 4)
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

  // Build available variables with their current values and token estimates
  const variables: Array<{
    name: string
    description: string
    value: unknown
    type: 'string' | 'object' | 'array'
    requiresProject: boolean
    tokenEstimate: number
    imageUrl?: string // For @image: variables, the actual image URL to preview
  }> = []

  // @availableBlocks
  const availableBlocksValue = dynamicContext.availableBlocks
    .map(
      (b) =>
        `- ${b.name} (${b.category}): ${b.description}${b.interfaces?.length ? ` [${b.interfaces.join(', ')}]` : ''}`
    )
    .join('\n')
  variables.push({
    name: '@availableBlocks',
    description: 'List of available hardware blocks formatted for prompts',
    value: availableBlocksValue,
    type: 'string',
    requiresProject: false,
    tokenEstimate: estimateTokens(availableBlocksValue),
  })

  // @projectState (requires project)
  if (dynamicContext.projectState) {
    variables.push({
      name: '@projectState',
      description: 'Full project state object',
      value: dynamicContext.projectState,
      type: 'object',
      requiresProject: true,
      tokenEstimate: estimateTokens(dynamicContext.projectState),
    })

    variables.push({
      name: '@projectState.status',
      description: 'Current project status',
      value: dynamicContext.projectState.status,
      type: 'string',
      requiresProject: true,
      tokenEstimate: estimateTokens(dynamicContext.projectState.status),
    })

    // @description shortcut
    const description = dynamicContext.projectState.spec?.description as string | undefined
    const descriptionValue = description || '(No description available)'
    variables.push({
      name: '@description',
      description: "User's original project description",
      value: descriptionValue,
      type: 'string',
      requiresProject: true,
      tokenEstimate: estimateTokens(descriptionValue),
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
      tokenEstimate: estimateTokens(decisionsFormatted),
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
      tokenEstimate: estimateTokens(blueprintPrompt),
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
      tokenEstimate: estimateTokens(visualizationsFormatted),
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
      tokenEstimate: estimateTokens(selectedVisualization),
    })

    // @image: variables - these ATTACH images to the LLM call (not just text)
    // Image tokens: Gemini uses ~258 tokens per image (fixed), other models vary
    const selectedImageUrl =
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
        ? blueprints[selectedIndex]?.url || null
        : null
    const imageSelectedValue = selectedImageUrl
      ? `[Will attach: ${selectedImageUrl}]`
      : '(No image available)'
    variables.push({
      name: '@image:visualization.selected',
      description: 'ATTACH the selected visualization image to the LLM call (~258 img tokens)',
      value: imageSelectedValue,
      type: 'string',
      requiresProject: true,
      tokenEstimate: selectedImageUrl ? 258 : 0, // Gemini image token estimate
      imageUrl: selectedImageUrl || undefined,
    })
    const image0Url = blueprints && blueprints[0]?.url ? blueprints[0].url : null
    const image0Value = image0Url ? `[Will attach: ${image0Url}]` : '(No image available)'
    variables.push({
      name: '@image:visualization.0',
      description: 'ATTACH visualization at index 0 to the LLM call (~258 img tokens)',
      value: image0Value,
      type: 'string',
      requiresProject: true,
      tokenEstimate: image0Url ? 258 : 0, // Gemini image token estimate
      imageUrl: image0Url || undefined,
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
        tokenEstimate: estimateTokens(feasibility),
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
          tokenEstimate: estimateTokens(revisions.revisedDescription),
        })
        variables.push({
          name: '@feasibility.suggestedRevisions.summary',
          description: 'Summary of suggested changes',
          value: revisions.summary,
          type: 'string',
          requiresProject: true,
          tokenEstimate: estimateTokens(revisions.summary),
        })
        variables.push({
          name: '@feasibility.suggestedRevisions.changes',
          description: 'List of suggested changes',
          value: revisions.changes,
          type: 'array',
          requiresProject: true,
          tokenEstimate: estimateTokens(revisions.changes),
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
          tokenEstimate: estimateTokens(comm.type),
        })
      }

      if (feasibility.overallScore !== undefined) {
        variables.push({
          name: '@feasibility.overallScore',
          description: 'Feasibility score (0-100)',
          value: feasibility.overallScore,
          type: 'string',
          requiresProject: true,
          tokenEstimate: estimateTokens(feasibility.overallScore),
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
          tokenEstimate: estimateTokens(inputs.items),
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
          tokenEstimate: estimateTokens(outputs.items),
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
      tokenEstimate: 0,
    })
    variables.push({
      name: '@description',
      description: "User's original project description (select a project)",
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@decisions',
      description: 'Formatted list of user decisions (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@selectedBlueprintPrompt',
      description: "The selected blueprint's prompt text (select a project)",
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@visualization',
      description: 'All generated product visualization renders (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@visualization.selected',
      description: 'The user-selected visualization render (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@image:visualization.selected',
      description: 'ATTACH the selected visualization image to the LLM call (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 258, // Gemini image token estimate
    })
    variables.push({
      name: '@image:visualization.0',
      description: 'ATTACH visualization at index 0 to the LLM call (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 258, // Gemini image token estimate
    })
    variables.push({
      name: '@feasibility',
      description: 'Feasibility analysis (select a project with feasibility data)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@feasibility.suggestedRevisions.revisedDescription',
      description: 'AI-revised project description (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
  }

  return Response.json({
    context: dynamicContext,
    variables,
    projectId: projectId || null,
  })
}
