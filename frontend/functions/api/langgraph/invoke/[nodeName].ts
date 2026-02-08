/**
 * LangGraph Node Invoke API
 *
 * POST /api/langgraph/invoke/:nodeName
 *
 * Invokes a standalone LangGraph node and returns the result.
 * All executions are logged to the langgraph_executions table.
 */

import type { Env } from '../../../env'
import { getProviderModelDefaults } from '../../../lib/model-defaults'
import { getSystemSettings } from '../../../lib/system-settings'
import {
  getNode,
  hasNode,
  invokeNode,
  getAllNodeNames,
  type NodeContext,
  type NodeConfig,
  type LLMChatParams,
  type LLMChatResponse,
  type LLMImageParams,
  type LLMImageResponse,
  type DynamicContext,
} from '../../../../src/services/langgraph/nodes'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: string
}

// Breakpoint data returned when execution is paused in debug_it mode
interface BreakpointData {
  id: string
  nodeName: string
  nodeType: 'chat' | 'image'
  systemPromptTemplate: string // Raw template with @variables
  systemPromptExpanded: string // Expanded with actual values
  dynamicContext: DynamicContext
  extractedImages: Array<{ url: string; label: string }> // Images from @image: variables
  fullInput: Record<string, unknown>
  invocationConfig: NodeConfig | null
  tokenEstimate: number
  projectId?: string
  threadId?: string
  expiresAt: string
}

interface InvokeRequest {
  input: Record<string, unknown>
  threadId?: string
  projectId?: string
  config?: NodeConfig
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue(obj, 'spec.feasibility.suggestedRevisions.revisedDescription')
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Format a value for template expansion
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(not available)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)'
    // Format arrays nicely
    return value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join('\n')
  }
  // Objects get JSON formatted
  return JSON.stringify(value, null, 2)
}

/**
 * Result of template expansion including extracted images
 */
interface TemplateExpansionResult {
  text: string
  images: Array<{ url: string; label: string }>
}

/**
 * Resolve an image variable path to a URL
 * Supports: @image:visualization.selected, @image:visualization.0, etc.
 */
function resolveImageUrl(path: string, dynamicContext: DynamicContext): string | null {
  const spec = dynamicContext.projectState?.spec
  const blueprints = spec?.blueprints as Array<{ url?: string; prompt?: string }> | undefined

  // @image:visualization.selected - the selected blueprint image
  if (path === 'visualization.selected') {
    const selectedIndex = spec?.selectedBlueprint
    if (
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
    ) {
      return blueprints[selectedIndex]?.url || null
    }
    return null
  }

  // @image:visualization.N - specific blueprint by index
  const indexMatch = path.match(/^visualization\.(\d+)$/)
  if (indexMatch) {
    const index = parseInt(indexMatch[1], 10)
    if (blueprints && index >= 0 && index < blueprints.length) {
      return blueprints[index]?.url || null
    }
    return null
  }

  // @image:visualization - all blueprints (returns first one, use .selected or .N for specific)
  if (path === 'visualization') {
    if (blueprints && blueprints.length > 0 && blueprints[0]?.url) {
      return blueprints[0].url
    }
    return null
  }

  // @image:pcb.assembly3d - 3D render of main PCB assembly
  if (path === 'pcb.assembly3d') {
    const pcb = spec?.pcb as { assembly3dImage?: string } | undefined
    if (pcb?.assembly3dImage) {
      return `data:image/png;base64,${pcb.assembly3dImage}`
    }
    return null
  }

  // @image:pcb.remoteTypeAssembly3d - 3D render of cable-connected PCB
  if (path === 'pcb.remoteTypeAssembly3d') {
    const pcb = spec?.pcb as { remoteTypeAssembly3dImage?: string } | undefined
    if (pcb?.remoteTypeAssembly3dImage) {
      return `data:image/png;base64,${pcb.remoteTypeAssembly3dImage}`
    }
    return null
  }

  // Generic path resolution for future extensibility
  // e.g., @image:projectState.spec.someImageField
  const value = getNestedValue(dynamicContext, path)
  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
    return value
  }

  return null
}

/**
 * Expand template variables in system prompt with dynamic context
 *
 * Supported patterns:
 * - @availableBlocks - List of available hardware blocks (special formatting)
 * - @projectState - Full project state object
 * - @projectState.path.to.value - Nested property access (e.g., @projectState.spec.feasibility.suggestedRevisions.revisedDescription)
 * - @feasibility - Shortcut for @projectState.spec.feasibility
 * - @feasibility.path - Nested access from feasibility (e.g., @feasibility.suggestedRevisions.revisedDescription)
 * - @description - Shortcut for @projectState.spec.description
 * - @decisions - Formatted list of user decisions (question: answer)
 * - @selectedBlueprintPrompt - The selected blueprint's prompt text
 * - @visualization - All blueprint renders
 * - @visualization.selected - The selected blueprint render
 * - @image:path - Include image in LLM call (e.g., @image:visualization.selected)
 */
function expandTemplateVariables(
  prompt: string,
  dynamicContext: DynamicContext
): TemplateExpansionResult {
  const extractedImages: Array<{ url: string; label: string }> = []
  let expanded = prompt

  // Extract @image: patterns FIRST (before other expansions)
  // Pattern: @image:path (e.g., @image:visualization.selected)
  const imagePattern = /@image:([a-zA-Z0-9_.]+)/g
  expanded = expanded.replace(imagePattern, (match, path) => {
    const imageUrl = resolveImageUrl(path, dynamicContext)
    if (imageUrl) {
      extractedImages.push({ url: imageUrl, label: path })
      return `[Attached image: ${path}]`
    }
    return `(Image not available: ${path})`
  })

  // Special formatting for @availableBlocks (as a list with slug and size)
  if (expanded.includes('@availableBlocks')) {
    if (dynamicContext.availableBlocks && dynamicContext.availableBlocks.length > 0) {
      const blocksList = dynamicContext.availableBlocks
        .map((b) => {
          const sizeStr = b.gridSize
            ? `${b.gridSize[0]}x${b.gridSize[1]}`
            : b.isRemote
              ? 'remote'
              : 'unknown'
          return `- ${b.name} slug:${b.slug}, type:${b.category}, size:${sizeStr} desc:"${b.description}"`
        })
        .join('\n')
      expanded = expanded.replace(/@availableBlocks(?![.\w])/g, blocksList)
    } else {
      expanded = expanded.replace(/@availableBlocks(?![.\w])/g, '(No hardware blocks available)')
    }
  }

  // Expand @description shortcut (must come before @projectState to avoid partial matches)
  if (expanded.includes('@description')) {
    const description = dynamicContext.projectState?.spec?.description
    expanded = expanded.replace(
      /@description(?![.\w])/g,
      description || '(No description available)'
    )
  }

  // Expand @projectName shortcut
  if (expanded.includes('@projectName')) {
    const finalSpec = dynamicContext.projectState?.spec?.finalSpec as
      | Record<string, unknown>
      | undefined
    const projectName = finalSpec?.name as string | undefined
    expanded = expanded.replace(/@projectName(?![.\w])/g, projectName || '(No project name)')
  }

  // Expand @finalSpec shortcut
  if (expanded.includes('@finalSpec')) {
    const finalSpec = dynamicContext.projectState?.spec?.finalSpec
    expanded = expanded.replace(
      /@finalSpec(?![.\w])/g,
      finalSpec ? JSON.stringify(finalSpec, null, 2) : '(No final spec available)'
    )
  }

  // Expand @decisions with special formatting
  if (expanded.includes('@decisions')) {
    const decisions = dynamicContext.projectState?.spec?.decisions as
      | Array<{ question: string; questionId?: string; answer: string }>
      | undefined
    if (decisions && decisions.length > 0) {
      const formatted = decisions.map((d) => `- ${d.question}: ${d.answer}`).join('\n')
      expanded = expanded.replace(/@decisions(?![.\w])/g, formatted)
    } else {
      expanded = expanded.replace(/@decisions(?![.\w])/g, '(No user decisions recorded)')
    }
  }

  // Expand @selectedBlueprintPrompt - extracts the prompt from blueprints[selectedBlueprint]
  if (expanded.includes('@selectedBlueprintPrompt')) {
    const spec = dynamicContext.projectState?.spec
    const selectedIndex = spec?.selectedBlueprint
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
    expanded = expanded.replace(/@selectedBlueprintPrompt(?![.\w])/g, blueprintPrompt)
  }

  // Expand @visualization.selected first (more specific pattern)
  if (expanded.includes('@visualization.selected')) {
    const spec = dynamicContext.projectState?.spec
    const selectedIndex = spec?.selectedBlueprint
    const blueprints = spec?.blueprints as Array<{ prompt?: string; url?: string }> | undefined
    let selectedVisualization = '(No visualization selected)'
    if (
      typeof selectedIndex === 'number' &&
      blueprints &&
      selectedIndex >= 0 &&
      selectedIndex < blueprints.length
    ) {
      const selected = blueprints[selectedIndex]
      selectedVisualization = JSON.stringify(
        {
          index: selectedIndex,
          url: selected?.url || null,
          prompt: selected?.prompt || null,
        },
        null,
        2
      )
    }
    expanded = expanded.replace(/@visualization\.selected(?![.\w])/g, selectedVisualization)
  }

  // Expand @visualization - all blueprint renders
  if (expanded.includes('@visualization')) {
    const blueprints = dynamicContext.projectState?.spec?.blueprints as
      | Array<{ prompt?: string; url?: string }>
      | undefined
    if (blueprints && blueprints.length > 0) {
      const formatted = blueprints
        .map((b, i) => `[${i}] URL: ${b.url || '(pending)'}\n    Prompt: ${b.prompt || '(none)'}`)
        .join('\n')
      expanded = expanded.replace(/@visualization(?!\.)/g, formatted)
    } else {
      expanded = expanded.replace(/@visualization(?!\.)/g, '(No visualizations generated)')
    }
  }

  // Expand @feasibility and @feasibility.path shortcuts
  const feasibilityPattern = /@feasibility(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(feasibilityPattern, (match, path) => {
    const feasibility = dynamicContext.projectState?.spec?.feasibility
    if (!feasibility) return '(No feasibility data available)'
    if (!path) return formatValue(feasibility)
    const value = getNestedValue(feasibility, path)
    return formatValue(value)
  })

  // Expand @pcb and @pcb.path shortcuts (PCB artifacts)
  const pcbPattern = /@pcb(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(pcbPattern, (match, path) => {
    const pcb = dynamicContext.projectState?.spec?.pcb
    if (!pcb) return '(No PCB data available)'
    if (!path) return formatValue(pcb)
    const value = getNestedValue(pcb, path)
    return formatValue(value)
  })

  // Expand @enclosureSCAD shortcuts (must come before @enclosure to avoid partial matches)
  const enclosureSCADPattern = /@enclosureSCAD\.([a-zA-Z0-9]+)/g
  expanded = expanded.replace(enclosureSCADPattern, (match, key) => {
    const enclosure = dynamicContext.projectState?.spec?.enclosure as
      | {
          openScadCode?: string
          iterations?: Array<{ feedback: string; openScadCode: string }>
        }
      | undefined
    if (!enclosure) return '(No enclosure data available)'

    // @enclosureSCAD.latest - current active code
    if (key === 'latest') {
      return enclosure.openScadCode || '(No SCAD code yet)'
    }

    // @enclosureSCAD.count - number of iterations
    if (key === 'count') {
      return String(enclosure.iterations?.length || 0)
    }

    // @enclosureSCAD.N - specific draft by index
    const index = parseInt(key, 10)
    if (!isNaN(index)) {
      const iterations = enclosure.iterations || []
      if (index >= 0 && index < iterations.length) {
        return iterations[index].openScadCode
      }
      return `(No SCAD draft at index ${index})`
    }

    return `(Unknown enclosureSCAD property: ${key})`
  })

  // Expand @enclosure and @enclosure.path shortcuts
  const enclosurePattern = /@enclosure(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(enclosurePattern, (match, path) => {
    const enclosure = dynamicContext.projectState?.spec?.enclosure
    if (!enclosure) return '(No enclosure data available)'
    if (!path) return formatValue(enclosure)
    const value = getNestedValue(enclosure, path)
    return formatValue(value)
  })

  // Expand @firmware and @firmware.path shortcuts
  const firmwarePattern = /@firmware(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(firmwarePattern, (match, path) => {
    const firmware = dynamicContext.projectState?.spec?.firmware
    if (!firmware) return '(No firmware data available)'
    if (!path) return formatValue(firmware)
    const value = getNestedValue(firmware, path)
    return formatValue(value)
  })

  // Expand @projectState and @projectState.path
  const projectStatePattern = /@projectState(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(projectStatePattern, (match, path) => {
    if (!dynamicContext.projectState) return '(No project state available)'
    if (!path) {
      const state = dynamicContext.projectState
      return `Status: ${state.status}${state.spec ? `\nSpec: ${JSON.stringify(state.spec, null, 2)}` : ''}`
    }
    const value = getNestedValue(dynamicContext.projectState, path)
    return formatValue(value)
  })

  return { text: expanded, images: extractedImages }
}

function resolveModelAliasesInPrompt(
  prompt: string,
  defaults: { textModel: string; imageModel: string | null }
): { prompt: string; preferredModelAlias?: '__text_model__' | '__image_model__' } {
  const textModel = defaults.textModel
  const imageModel = defaults.imageModel || textModel

  let preferredModelAlias: '__text_model__' | '__image_model__' | undefined
  if (prompt.includes('__image_model__')) {
    preferredModelAlias = '__image_model__'
  } else if (prompt.includes('__text_model__')) {
    preferredModelAlias = '__text_model__'
  }

  return {
    preferredModelAlias,
    prompt: prompt.replace(/__text_model__/g, textModel).replace(/__image_model__/g, imageModel),
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nodeName = params.nodeName as string

  if (!hasNode(nodeName)) {
    return Response.json(
      { error: `Node "${nodeName}" not found`, availableNodes: getAllNodeNames() },
      { status: 404 }
    )
  }

  // Parse request body
  let body: InvokeRequest
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.input || typeof body.input !== 'object') {
    return Response.json({ error: 'input is required and must be an object' }, { status: 400 })
  }

  // Verify project access if projectId provided
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

  // Get system prompt from database (REQUIRED - no fallback to hardcoded prompts)
  const promptRow = await env.DB.prepare(
    'SELECT system_prompt FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(nodeName)
    .first<{ system_prompt: string | null }>()

  if (!promptRow || !promptRow.system_prompt) {
    return Response.json(
      {
        error: `No prompt found in database for node "${nodeName}". Add entry to orchestrator_prompts table.`,
      },
      { status: 500 }
    )
  }

  // Check for system prompt override (used by debug test endpoint)
  const systemPromptOverrideEncoded = context.request.headers.get('X-System-Prompt-Override')
  if (systemPromptOverrideEncoded && !user.isAdmin) {
    return Response.json({ error: 'Admin access required for prompt override' }, { status: 403 })
  }
  const systemPrompt = systemPromptOverrideEncoded
    ? decodeURIComponent(systemPromptOverrideEncoded)
    : promptRow.system_prompt

  // Get node to check what context it needs
  const node = getNode(nodeName)!
  const contextTypes = node.contextTypes || []

  // Fetch dynamic context based on node requirements
  const dynamicContext: DynamicContext = {}

  // Fetch available blocks if needed
  if (contextTypes.includes('availableBlocks')) {
    const blocksResult = await env.DB.prepare(
      `SELECT slug, definition FROM pcb_blocks WHERE is_active = 1`
    ).all<{ slug: string; definition: string | null }>()

    dynamicContext.availableBlocks = (blocksResult.results || [])
      .map((row) => {
        try {
          const def = row.definition ? JSON.parse(row.definition) : null
          // Support both flat structure (def.name) and nested (def.metadata.name)
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
      .filter((b) => b.name) // Filter out empty entries
  }

  // Fetch project state if needed
  if (contextTypes.includes('projectState') && body.projectId) {
    const projectRow = await env.DB.prepare(`SELECT status, spec FROM projects WHERE id = ?`)
      .bind(body.projectId)
      .first<{ status: string; spec: string | null }>()

    if (projectRow) {
      dynamicContext.projectState = {
        status: projectRow.status,
        spec: projectRow.spec ? JSON.parse(projectRow.spec) : undefined,
      }
    }
  }

  // Expand template variables in system prompt with dynamic context
  // This happens BEFORE breakpoint creation so debug shows the actual expanded prompt
  const settingsRow = await getSystemSettings(env)
  const modelDefaults = getProviderModelDefaults(env, settingsRow || undefined)

  const { text: expandedTemplatePrompt, images: extractedImages } = expandTemplateVariables(
    systemPrompt,
    dynamicContext
  )
  const { prompt: expandedSystemPrompt, preferredModelAlias } = resolveModelAliasesInPrompt(
    expandedTemplatePrompt,
    modelDefaults.active
  )

  // Check for debug_it mode breakpoint
  const skipBreakpoint = context.request.headers.get('X-Skip-Debug-Breakpoint') === 'true'
  if (user.controlMode === 'debug_it' && !skipBreakpoint) {
    // Create a breakpoint record and pause execution
    const breakpointId = crypto.randomUUID()
    const inputJson = JSON.stringify(body.input, null, 2)
    const tokenEstimate = Math.ceil((expandedSystemPrompt.length + inputJson.length) / 4) // ~4 chars per token

    // Breakpoint expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO debug_breakpoints (
        id, user_id, project_id, thread_id, node_name,
        system_prompt, user_context, full_input,
        invocation_config, token_estimate, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        breakpointId,
        user.id,
        body.projectId || null,
        body.threadId || null,
        nodeName,
        expandedSystemPrompt, // Store the expanded prompt with dynamic context
        JSON.stringify(dynamicContext, null, 2), // Keep raw context for reference
        JSON.stringify(body.input),
        body.config ? JSON.stringify(body.config) : null,
        tokenEstimate,
        expiresAt
      )
      .run()

    const breakpointData: BreakpointData = {
      id: breakpointId,
      nodeName,
      nodeType: node.type,
      systemPromptTemplate: systemPrompt, // Raw template with @variables
      systemPromptExpanded: expandedSystemPrompt, // Expanded for actual LLM call
      dynamicContext,
      extractedImages, // Images from @image: variables
      fullInput: body.input,
      invocationConfig: body.config || null,
      tokenEstimate,
      projectId: body.projectId,
      threadId: body.threadId,
      expiresAt,
    }

    return Response.json({ paused: true, breakpointId, breakpointData })
  }

  // Create LLM chat function that proxies to our API
  // Automatically injects @image: extracted images into user messages
  const llmChat = async (params: LLMChatParams): Promise<LLMChatResponse> => {
    // If we have extracted images from @image: variables, inject them into the first user message
    let messages = params.messages
    if (extractedImages.length > 0) {
      messages = params.messages.map((msg, index) => {
        // Find the first user message and make it multimodal
        if (msg.role === 'user' && index === params.messages.findIndex((m) => m.role === 'user')) {
          // Convert to multimodal format
          const textContent = typeof msg.content === 'string' ? msg.content : ''
          const imageContents = extractedImages.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.url },
          }))
          return {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: textContent }, ...imageContents],
          }
        }
        return msg
      })
    }

    // Call the internal LLM API
    const llmResponse = await fetch(new URL('/api/llm/chat', context.request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.request.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        messages,
        temperature: params.temperature,
        model: params.model || preferredModelAlias,
        maxTokens: params.maxTokens,
        projectId: params.projectId || body.projectId,
      }),
    })

    if (!llmResponse.ok) {
      const error = await llmResponse.text()
      throw new Error(`LLM API error: ${error}`)
    }

    const result = await llmResponse.json<{
      content: string
      model: string
      usage?: Record<string, unknown>
    }>()

    const rawUsage = result.usage
    let normalizedUsage:
      | {
          prompt_tokens: number
          completion_tokens: number
          total_tokens: number
        }
      | undefined

    if (rawUsage) {
      const promptTokens = Number(rawUsage.prompt_tokens ?? rawUsage.promptTokens ?? 0)
      const completionTokens = Number(rawUsage.completion_tokens ?? rawUsage.completionTokens ?? 0)
      const totalTokens = Number(rawUsage.total_tokens ?? rawUsage.totalTokens ?? 0)

      normalizedUsage = {
        prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
        completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
        total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
      }
    }

    return {
      content: result.content,
      model: result.model,
      usage: normalizedUsage,
    }
  }

  // Create LLM image function that proxies to our API
  const llmImage = async (params: LLMImageParams): Promise<LLMImageResponse> => {
    const imageResponse = await fetch(new URL('/api/llm/image', context.request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.request.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model || preferredModelAlias,
        projectId: params.projectId || body.projectId,
      }),
    })

    if (!imageResponse.ok) {
      const error = await imageResponse.text()
      throw new Error(`Image API error: ${error}`)
    }

    const result = await imageResponse.json<{
      imageUrl: string
      model: string
      latencyMs?: number
      error?: string
      rawResponse?: string
    }>()

    if (!result.imageUrl || typeof result.imageUrl !== 'string') {
      const errorDetails = result.error || result.rawResponse || 'No image returned by provider'
      throw new Error(`Image API error: ${errorDetails}`)
    }

    return {
      url: result.imageUrl,
      model: result.model,
    }
  }

  // Build context
  const nodeContext: NodeContext = {
    projectId: body.projectId,
    userId: user.id,
    threadId: body.threadId,
    systemPrompt: expandedSystemPrompt, // Expanded with template variables
    dynamicContext, // Raw dynamic context (for nodes that need to process it differently)
    llmChat,
    llmImage,
  }

  try {
    // Invoke the node
    const result = await invokeNode(nodeName, body.input, body.config || {}, nodeContext)

    // Log execution to database
    const executionId = result.nodeId
    await env.DB.prepare(
      `INSERT INTO langgraph_executions (
        id, node_name, thread_id, project_id, user_id,
        started_at, completed_at, duration_ms,
        input_json, output_json, error,
        model, temperature, system_prompt, user_prompt, raw_response,
        prompt_tokens, completion_tokens, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        executionId,
        nodeName,
        body.threadId || null,
        body.projectId || null,
        user.id,
        result.debug.startTime,
        result.debug.endTime,
        result.debug.durationMs,
        JSON.stringify(body.input),
        JSON.stringify(result.output),
        null,
        result.debug.model,
        result.debug.temperature,
        result.debug.systemPrompt,
        result.debug.userPrompt,
        result.debug.rawResponse,
        result.debug.promptTokens || null,
        result.debug.completionTokens || null,
        result.debug.costUsd || null
      )
      .run()

    return Response.json(result)
  } catch (error) {
    // Log failed execution
    const executionId = crypto.randomUUID()
    const errorMessage = error instanceof Error ? error.message : String(error)

    await env.DB.prepare(
      `INSERT INTO langgraph_executions (
        id, node_name, thread_id, project_id, user_id,
        started_at, completed_at, duration_ms,
        input_json, output_json, error,
        model, temperature, system_prompt, user_prompt, raw_response,
        prompt_tokens, completion_tokens, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        executionId,
        nodeName,
        body.threadId || null,
        body.projectId || null,
        user.id,
        new Date().toISOString(),
        new Date().toISOString(),
        0,
        JSON.stringify(body.input),
        null,
        errorMessage,
        body.config?.model || 'default',
        body.config?.temperature ?? node.defaultTemperature,
        nodeContext.systemPrompt,
        JSON.stringify(body.input).slice(0, 1000),
        null,
        null,
        null,
        null
      )
      .run()

    console.error(`Node "${nodeName}" invocation failed:`, error)
    return Response.json({ error: errorMessage, nodeId: executionId }, { status: 500 })
  }
}

// Helper to get all node names (imported at top of file via static import)
