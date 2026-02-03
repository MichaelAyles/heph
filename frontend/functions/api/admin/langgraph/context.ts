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
  gridSize?: [number, number] // [width, height] in grid units
  isRemote?: boolean
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
          gridSize: def?.gridSize as [number, number] | undefined,
          isRemote: def?.isRemote as boolean | undefined,
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
    .map((b) => {
      const sizeStr = b.gridSize
        ? `${b.gridSize[0]}x${b.gridSize[1]}`
        : b.isRemote
          ? 'remote'
          : 'unknown'
      return `- ${b.name} slug:${b.slug}, type:${b.category}, size:${sizeStr} desc:"${b.description}"`
    })
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

    // @projectName shortcut
    const finalSpecObj = dynamicContext.projectState.spec?.finalSpec as
      | Record<string, unknown>
      | undefined
    const projectName = finalSpecObj?.name as string | undefined
    const projectNameValue = projectName || '(No project name)'
    variables.push({
      name: '@projectName',
      description: 'Project name from final spec',
      value: projectNameValue,
      type: 'string',
      requiresProject: true,
      tokenEstimate: estimateTokens(projectNameValue),
    })

    // @finalSpec shortcut
    const finalSpecFormatted = finalSpecObj
      ? JSON.stringify(finalSpecObj, null, 2)
      : '(No final spec available)'
    variables.push({
      name: '@finalSpec',
      description: 'Full final specification object',
      value: finalSpecObj || null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: estimateTokens(finalSpecFormatted),
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

    // @pcb shortcuts (PCB artifacts)
    const pcb = dynamicContext.projectState.spec?.pcb as Record<string, unknown> | undefined
    if (pcb) {
      variables.push({
        name: '@pcb',
        description: 'Full PCB artifacts object',
        value: pcb,
        type: 'object',
        requiresProject: true,
        tokenEstimate: estimateTokens(pcb),
      })

      // @pcb.placedBlocks
      if (pcb.placedBlocks) {
        variables.push({
          name: '@pcb.placedBlocks',
          description: 'Placed blocks with positions and rotations',
          value: pcb.placedBlocks,
          type: 'array',
          requiresProject: true,
          tokenEstimate: estimateTokens(pcb.placedBlocks),
        })
      }

      // @pcb.boardSize
      if (pcb.boardSize) {
        variables.push({
          name: '@pcb.boardSize',
          description: 'Board dimensions (width, height in mm)',
          value: pcb.boardSize,
          type: 'object',
          requiresProject: true,
          tokenEstimate: estimateTokens(pcb.boardSize),
        })
      }

      // @pcb.netList
      if (pcb.netList) {
        variables.push({
          name: '@pcb.netList',
          description: 'GPIO assignments and net connections',
          value: pcb.netList,
          type: 'object',
          requiresProject: true,
          tokenEstimate: estimateTokens(pcb.netList),
        })
      }

      // @pcb.designJustifications
      if (pcb.designJustifications) {
        variables.push({
          name: '@pcb.designJustifications',
          description: 'Why blocks were selected',
          value: pcb.designJustifications,
          type: 'string',
          requiresProject: true,
          tokenEstimate: estimateTokens(pcb.designJustifications),
        })
      }

      // @image:pcb.assembly3d - 3D render of assembled PCB
      const assembly3dImage = pcb.assembly3dImage as string | undefined
      if (assembly3dImage) {
        variables.push({
          name: '@image:pcb.assembly3d',
          description: 'ATTACH 3D render of assembled PCB to the LLM call (~258 img tokens)',
          value: `[Will attach: base64 PNG image (${Math.round(assembly3dImage.length / 1024)}KB)]`,
          type: 'string',
          requiresProject: true,
          tokenEstimate: 258, // Gemini image token estimate
          imageUrl: `data:image/png;base64,${assembly3dImage}`,
        })
      }

      // @image:pcb.remoteTypeAssembly3d - 3D render of remote-type blocks
      const remoteTypeAssembly3dImage = pcb.remoteTypeAssembly3dImage as string | undefined
      if (remoteTypeAssembly3dImage) {
        variables.push({
          name: '@image:pcb.remoteTypeAssembly3d',
          description: 'ATTACH 3D render of cable-connected PCB to the LLM call (~258 img tokens)',
          value: `[Will attach: base64 PNG image (${Math.round(remoteTypeAssembly3dImage.length / 1024)}KB)]`,
          type: 'string',
          requiresProject: true,
          tokenEstimate: 258,
          imageUrl: `data:image/png;base64,${remoteTypeAssembly3dImage}`,
        })
      }
    }

    // @enclosure shortcuts
    const enclosure = dynamicContext.projectState.spec?.enclosure as
      | Record<string, unknown>
      | undefined
    if (enclosure) {
      variables.push({
        name: '@enclosure',
        description: 'Full enclosure artifacts object',
        value: enclosure,
        type: 'object',
        requiresProject: true,
        tokenEstimate: estimateTokens(enclosure),
      })

      // @enclosure.openScadCode
      if (enclosure.openScadCode) {
        variables.push({
          name: '@enclosure.openScadCode',
          description: 'Current OpenSCAD code',
          value: enclosure.openScadCode,
          type: 'string',
          requiresProject: true,
          tokenEstimate: estimateTokens(enclosure.openScadCode),
        })
      }

      // @enclosure.iterations
      if (enclosure.iterations) {
        variables.push({
          name: '@enclosure.iterations',
          description: 'Refinement history',
          value: enclosure.iterations,
          type: 'array',
          requiresProject: true,
          tokenEstimate: estimateTokens(enclosure.iterations),
        })
      }

      // @enclosureSCAD shortcuts - easier access to SCAD code drafts
      const iterations = enclosure.iterations as
        | Array<{ feedback: string; openScadCode: string; stlUrl?: string; timestamp: string }>
        | undefined

      // @enclosureSCAD.latest - current active code
      variables.push({
        name: '@enclosureSCAD.latest',
        description: 'Latest/current OpenSCAD code',
        value: enclosure.openScadCode || '(No SCAD code yet)',
        type: 'string',
        requiresProject: true,
        tokenEstimate: estimateTokens(enclosure.openScadCode),
      })

      // @enclosureSCAD.count - number of iterations
      const iterationCount = iterations?.length || 0
      variables.push({
        name: '@enclosureSCAD.count',
        description: 'Number of SCAD iterations/drafts',
        value: iterationCount,
        type: 'string',
        requiresProject: true,
        tokenEstimate: 1,
      })

      // @enclosureSCAD.N - specific drafts by index
      if (iterations && iterations.length > 0) {
        iterations.forEach((iter, idx) => {
          variables.push({
            name: `@enclosureSCAD.${idx}`,
            description: `Draft ${idx}: ${iter.feedback.slice(0, 50)}${iter.feedback.length > 50 ? '...' : ''}`,
            value: iter.openScadCode,
            type: 'string',
            requiresProject: true,
            tokenEstimate: estimateTokens(iter.openScadCode),
          })
        })
      }
    }

    // @firmware shortcuts
    const firmware = dynamicContext.projectState.spec?.firmware as
      | Record<string, unknown>
      | undefined
    if (firmware) {
      variables.push({
        name: '@firmware',
        description: 'Full firmware artifacts object',
        value: firmware,
        type: 'object',
        requiresProject: true,
        tokenEstimate: estimateTokens(firmware),
      })

      // @firmware.files
      if (firmware.files) {
        variables.push({
          name: '@firmware.files',
          description: 'Current source files',
          value: firmware.files,
          type: 'array',
          requiresProject: true,
          tokenEstimate: estimateTokens(firmware.files),
        })
      }

      // @firmware.buildLog
      if (firmware.buildLog) {
        variables.push({
          name: '@firmware.buildLog',
          description: 'Build output/log',
          value: firmware.buildLog,
          type: 'string',
          requiresProject: true,
          tokenEstimate: estimateTokens(firmware.buildLog),
        })
      }
    }

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
      name: '@projectName',
      description: 'Project name from final spec (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@finalSpec',
      description: 'Full final specification object (select a project)',
      value: null,
      type: 'object',
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
    // PCB placeholders
    variables.push({
      name: '@pcb',
      description: 'Full PCB artifacts (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@pcb.placedBlocks',
      description: 'Placed blocks with positions (select a project)',
      value: null,
      type: 'array',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@pcb.boardSize',
      description: 'Board dimensions (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@pcb.netList',
      description: 'GPIO assignments (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@image:pcb.assembly3d',
      description: 'ATTACH 3D render of assembled PCB (capture from 3D view)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 258,
    })
    variables.push({
      name: '@image:pcb.remoteTypeAssembly3d',
      description: 'ATTACH 3D render of cable-connected PCB (capture from 3D view)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 258,
    })
    // Enclosure placeholders
    variables.push({
      name: '@enclosure',
      description: 'Full enclosure artifacts (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@enclosure.openScadCode',
      description: 'Current OpenSCAD code (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    // @enclosureSCAD placeholders
    variables.push({
      name: '@enclosureSCAD.latest',
      description: 'Latest/current OpenSCAD code (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@enclosureSCAD.count',
      description: 'Number of SCAD iterations/drafts (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@enclosureSCAD.0',
      description: 'First SCAD draft (select a project)',
      value: null,
      type: 'string',
      requiresProject: true,
      tokenEstimate: 0,
    })
    // Firmware placeholders
    variables.push({
      name: '@firmware',
      description: 'Full firmware artifacts (select a project)',
      value: null,
      type: 'object',
      requiresProject: true,
      tokenEstimate: 0,
    })
    variables.push({
      name: '@firmware.files',
      description: 'Current source files (select a project)',
      value: null,
      type: 'array',
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
