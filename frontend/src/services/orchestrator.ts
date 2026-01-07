/**
 * Hardware Design Orchestrator Service
 *
 * Marathon agent that autonomously drives hardware design from spec through
 * PCB, enclosure, firmware, and export stages using Gemini tool calling.
 */

import { llm, type ChatMessage, type ToolCall } from './llm'
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_TOOLS,
  buildOrchestratorInitPrompt,
} from '@/prompts/orchestrator'
import {
  validateCrossStage,
  generateValidationReport,
  type ValidationResult,
} from '@/prompts/validation'
import { autoSelectBlocks } from '@/prompts/block-selection'
import { buildFeasibilityPrompt, FEASIBILITY_SYSTEM_PROMPT } from '@/prompts/feasibility'
import {
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
  ENCLOSURE_SYSTEM_PROMPT,
} from '@/prompts/enclosure'
import { ENCLOSURE_REVIEW_PROMPT, FIRMWARE_REVIEW_PROMPT } from '@/prompts/review'
import { NAMING_SYSTEM_PROMPT, buildNamingPrompt } from '@/prompts/naming'
import {
  buildFirmwarePrompt,
  buildFirmwareInputFromSpec,
  FIRMWARE_SYSTEM_PROMPT,
} from '@/prompts/firmware'
import type {
  ProjectSpec,
  FinalSpec,
  PlacedBlock,
  PcbBlock,
  FirmwareFile,
  PersistedOrchestratorState,
} from '@/db/schema'

// =============================================================================
// TYPES
// =============================================================================

export type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'
export type OrchestratorStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'validating'
  | 'fixing'
  | 'complete'
  | 'error'
export type OrchestratorStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

export interface OrchestratorHistoryItem {
  id: string
  timestamp: string
  type: 'tool_call' | 'tool_result' | 'validation' | 'error' | 'fix' | 'progress' | 'thinking'
  stage: OrchestratorStage
  action: string
  result?: string
  details?: Record<string, unknown>
}

export interface OrchestratorState {
  projectId: string
  status: OrchestratorStatus
  mode: OrchestratorMode
  currentStage: OrchestratorStage
  history: OrchestratorHistoryItem[]
  currentAction: string | null
  error: string | null
  validationResult: ValidationResult | null
  iterationCount: number
  startedAt: string | null
  completedAt: string | null
}

export interface OrchestratorCallbacks {
  onStateChange: (state: OrchestratorState) => void
  onSpecUpdate: (spec: Partial<ProjectSpec>) => Promise<void>
  onComplete: (state: OrchestratorState) => void
  onError: (error: Error) => void
  onUserInputRequired?: (question: string, options?: string[]) => Promise<string>
}

// =============================================================================
// ORCHESTRATOR CLASS
// =============================================================================

export class HardwareOrchestrator {
  private projectId: string
  private mode: OrchestratorMode
  private callbacks: OrchestratorCallbacks
  private conversationHistory: ChatMessage[] = []
  private state: OrchestratorState
  private isRunning: boolean = false
  private availableBlocks: PcbBlock[] = []
  private currentSpec: ProjectSpec | null = null

  constructor(projectId: string, mode: OrchestratorMode, callbacks: OrchestratorCallbacks) {
    this.projectId = projectId
    this.mode = mode
    this.callbacks = callbacks
    this.state = {
      projectId,
      status: 'idle',
      mode,
      currentStage: 'spec',
      history: [],
      currentAction: null,
      error: null,
      validationResult: null,
      iterationCount: 0,
      startedAt: null,
      completedAt: null,
    }
  }

  /**
   * Start autonomous orchestration
   */
  async run(description: string, existingSpec?: ProjectSpec, blocks?: PcbBlock[]): Promise<void> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running')
    }

    this.isRunning = true
    this.availableBlocks = blocks || []

    // Default stages structure
    const defaultStages = {
      spec: { status: 'in_progress' as const },
      pcb: { status: 'pending' as const },
      enclosure: { status: 'pending' as const },
      firmware: { status: 'pending' as const },
      export: { status: 'pending' as const },
    }

    // Merge existingSpec with defaults, ensuring stages always exists
    this.currentSpec = existingSpec
      ? {
          ...existingSpec,
          stages: {
            ...defaultStages,
            ...existingSpec.stages,
          },
        }
      : {
          description,
          feasibility: null,
          openQuestions: [],
          decisions: [],
          blueprints: [],
          selectedBlueprint: null,
          finalSpec: null,
          stages: defaultStages,
        }

    // Check if we're resuming from a paused state
    const savedState = existingSpec?.orchestratorState
    const isResuming =
      savedState &&
      (savedState.status === 'paused' || savedState.status === 'running') &&
      savedState.conversationHistory.length > 0

    if (isResuming && savedState) {
      // Resume from saved state
      this.conversationHistory = savedState.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
      this.state.iterationCount = savedState.iteration
      this.state.currentStage = savedState.currentStage as OrchestratorStage

      this.updateState({
        status: 'running',
        startedAt: new Date().toISOString(),
        currentAction: 'Resuming orchestration...',
      })

      // Add a resume message to let the LLM know we're continuing
      this.conversationHistory.push({
        role: 'user',
        content: `[Resumed from iteration ${savedState.iteration}. Current stage: ${savedState.currentStage}. Continue where you left off.]`,
      })
    } else {
      // Fresh start
      this.updateState({
        status: 'running',
        startedAt: new Date().toISOString(),
        currentAction: 'Initializing orchestrator...',
      })

      // Build stage completion status for the init prompt
      const stageStatus = this.currentSpec?.stages
        ? {
            spec: this.currentSpec.stages.spec?.status === 'complete',
            pcb: this.currentSpec.stages.pcb?.status === 'complete',
            enclosure: this.currentSpec.stages.enclosure?.status === 'complete',
            firmware: this.currentSpec.stages.firmware?.status === 'complete',
            export: this.currentSpec.stages.export?.status === 'complete',
          }
        : undefined

      // Initialize conversation
      this.conversationHistory = [
        {
          role: 'system',
          content: ORCHESTRATOR_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildOrchestratorInitPrompt(description, this.mode, stageStatus),
        },
      ]
    }

    try {
      // Main orchestration loop
      while (this.isRunning && !this.isComplete()) {
        this.state.iterationCount++
        await this.runIteration()

        // Persist state after each iteration for resume capability
        await this.persistState('running')

        // Safety check for runaway loops
        if (this.state.iterationCount > 100) {
          throw new Error('Orchestrator exceeded maximum iterations')
        }
      }

      if (this.isComplete()) {
        this.updateState({
          status: 'complete',
          completedAt: new Date().toISOString(),
          currentAction: null,
        })
        await this.persistState('completed')
        this.callbacks.onComplete(this.state)
      }
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        currentAction: null,
      })
      await this.persistState('error')
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Stop the orchestrator and persist state for resume
   */
  async stop(): Promise<void> {
    this.isRunning = false
    this.updateState({
      status: 'paused',
      currentAction: null,
    })
    await this.persistState('paused')
  }

  /**
   * Get current state
   */
  getState(): OrchestratorState {
    return { ...this.state }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async runIteration(): Promise<void> {
    this.updateState({ currentAction: 'Thinking...' })

    // Trim history to prevent unbounded growth
    this.trimConversationHistory()

    try {
      // Call LLM with tools
      const response = await llm.chatWithTools({
        messages: this.conversationHistory,
        tools: ORCHESTRATOR_TOOLS,
        temperature: 0.3,
        maxTokens: 4096,
        projectId: this.projectId,
        thinking: this.mode === 'vibe_it' ? { type: 'enabled', budgetTokens: 5000 } : undefined,
      })

      // Log thinking if available
      if (response.thinking) {
        this.addHistoryItem({
          type: 'thinking',
          stage: this.state.currentStage,
          action: 'Reasoning',
          result: response.thinking,
        })
      }

      // Process tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          await this.executeToolCall(toolCall)
        }

        // Add assistant message with tool calls
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        })
      } else if (response.finishReason === 'stop') {
        // No tool calls, check if we should continue
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content,
        })

        // Prompt to continue if not complete
        if (!this.isComplete()) {
          this.conversationHistory.push({
            role: 'user',
            content: 'Continue with the next step in the design process.',
          })
        }
      }
    } catch (error) {
      this.addHistoryItem({
        type: 'error',
        stage: this.state.currentStage,
        action: 'LLM call failed',
        result: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private async executeToolCall(toolCall: ToolCall): Promise<void> {
    const { id, name, arguments: args } = toolCall

    this.addHistoryItem({
      type: 'tool_call',
      stage: this.state.currentStage,
      action: name,
      details: args as Record<string, unknown>,
    })

    this.updateState({ currentAction: `Executing: ${name}` })

    let result: unknown

    try {
      switch (name) {
        case 'analyze_feasibility':
          result = await this.executeFeasibility(args.description as string)
          break

        case 'answer_questions_auto':
          result = await this.executeAutoAnswer(
            args.questions as string[],
            args.reasoning as string
          )
          break

        case 'generate_blueprints':
          result = await this.executeGenerateBlueprints(args.style_hints as string[])
          break

        case 'select_blueprint':
          result = await this.executeSelectBlueprint(args.index as number, args.reasoning as string)
          break

        case 'generate_project_names':
          result = await this.executeGenerateProjectNames()
          break

        case 'select_project_name':
          result = await this.executeSelectProjectName(
            args.index as number | undefined,
            args.customName as string | undefined,
            args.reasoning as string
          )
          break

        case 'finalize_spec':
          result = await this.executeFinalizeSpec(args.confirm as boolean)
          break

        case 'select_pcb_blocks':
          result = await this.executeSelectBlocks(
            args.blocks as Array<{ blockSlug: string; gridX: number; gridY: number }>,
            args.reasoning as string
          )
          break

        case 'generate_enclosure':
          result = await this.executeGenerateEnclosure(
            args.style as string,
            args.wall_thickness as number | undefined,
            args.corner_radius as number | undefined,
            args.feedback as string | undefined
          )
          break

        case 'review_enclosure':
          result = await this.executeReviewEnclosure()
          break

        case 'generate_firmware':
          result = await this.executeGenerateFirmware(
            args.enable_wifi as boolean | undefined,
            args.enable_ble as boolean | undefined,
            args.enable_ota as boolean | undefined,
            args.enable_deep_sleep as boolean | undefined,
            args.feedback as string | undefined
          )
          break

        case 'review_firmware':
          result = await this.executeReviewFirmware()
          break

        case 'accept_and_render':
          result = await this.executeAcceptAndRender(args.stage as string)
          break

        case 'validate_cross_stage':
          result = await this.executeValidation(args.check_type as string)
          break

        case 'fix_stage_issue':
          result = await this.executeFixIssue(
            args.stage as string,
            args.issue as string,
            args.fix as string
          )
          break

        case 'mark_stage_complete':
          result = await this.executeMarkComplete(args.stage as string)
          break

        case 'report_progress':
          result = this.executeReportProgress(
            args.message as string,
            args.stage as string,
            args.percentage as number
          )
          break

        case 'request_user_input':
          result = await this.executeRequestUserInput(
            args.question as string,
            args.options as string[] | undefined,
            args.context as string
          )
          break

        default:
          result = { error: `Unknown tool: ${name}` }
      }
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) }
      this.addHistoryItem({
        type: 'error',
        stage: this.state.currentStage,
        action: `${name} failed`,
        result: String(result),
      })
    }

    // Add COMPRESSED tool result to conversation (full result stored in spec)
    const compressedResult = this.compressToolResult(name, result)
    this.conversationHistory.push({
      role: 'tool',
      content: JSON.stringify(compressedResult),
      toolCallId: id,
    })

    this.addHistoryItem({
      type: 'tool_result',
      stage: this.state.currentStage,
      action: name,
      result: typeof result === 'string' ? result : JSON.stringify(compressedResult).slice(0, 200),
    })
  }

  // ===========================================================================
  // TOOL IMPLEMENTATIONS
  // ===========================================================================

  private async executeFeasibility(description: string): Promise<unknown> {
    const response = await llm.chat({
      messages: [
        { role: 'system', content: FEASIBILITY_SYSTEM_PROMPT },
        { role: 'user', content: buildFeasibilityPrompt(description) },
      ],
      temperature: 0.3,
      projectId: this.projectId,
    })

    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON in feasibility response')
    }

    const feasibility = JSON.parse(jsonMatch[0])

    if (this.currentSpec) {
      this.currentSpec.feasibility = feasibility
      this.currentSpec.openQuestions = feasibility.openQuestions || []
      await this.callbacks.onSpecUpdate({
        feasibility,
        openQuestions: this.currentSpec.openQuestions,
      })
    }

    return {
      success: true,
      manufacturable: feasibility.manufacturable,
      score: feasibility.overallScore,
      openQuestionCount: this.currentSpec?.openQuestions?.length || 0,
    }
  }

  private async executeAutoAnswer(questionIds: string[], reasoning: string): Promise<unknown> {
    if (!this.currentSpec?.openQuestions?.length) {
      return { error: 'No open questions to answer' }
    }

    const decisions = []
    for (const questionId of questionIds) {
      const question = this.currentSpec.openQuestions.find((q) => q.id === questionId)
      if (question) {
        // Pick first option as default in VIBE IT mode
        const answer = question.options[0]
        decisions.push({
          questionId,
          question: question.question,
          answer,
          timestamp: new Date().toISOString(),
        })
      }
    }

    if (this.currentSpec) {
      this.currentSpec.decisions = [...(this.currentSpec.decisions || []), ...decisions]
      await this.callbacks.onSpecUpdate({ decisions: this.currentSpec.decisions })
    }

    return { success: true, answeredCount: decisions.length, reasoning }
  }

  private async executeGenerateBlueprints(styleHints: string[]): Promise<unknown> {
    // In a real implementation, this would call the image generation API
    // For now, return a placeholder
    const blueprints = styleHints.map((style, i) => ({
      url: `/api/images/placeholder-blueprint-${i}.png`,
      prompt: `${this.currentSpec?.description || ''} - ${style} style`,
    }))

    if (this.currentSpec) {
      this.currentSpec.blueprints = blueprints
      await this.callbacks.onSpecUpdate({ blueprints })
    }

    return { success: true, blueprintCount: blueprints.length }
  }

  private async executeSelectBlueprint(index: number, reasoning: string): Promise<unknown> {
    if (!this.currentSpec?.blueprints || index >= this.currentSpec.blueprints.length) {
      return { error: 'Invalid blueprint index' }
    }

    if (this.currentSpec) {
      this.currentSpec.selectedBlueprint = index
      await this.callbacks.onSpecUpdate({ selectedBlueprint: index })
    }

    return { success: true, selectedIndex: index, reasoning }
  }

  // Store generated names for selection
  private generatedNames: Array<{ name: string; style: string; reasoning: string }> = []
  private selectedProjectName: string | null = null

  private async executeGenerateProjectNames(): Promise<unknown> {
    if (!this.currentSpec) {
      return { error: 'No spec to generate names for' }
    }

    const feasibility = this.currentSpec.feasibility || {}
    const decisions = this.currentSpec.decisions || []

    const prompt = buildNamingPrompt(
      this.currentSpec.description,
      {
        primaryFunction: (feasibility as { primaryFunction?: string }).primaryFunction,
        matchedComponents: (feasibility as { matchedComponents?: string[] }).matchedComponents,
      },
      decisions.map((d) => ({ question: d.question, answer: d.answer }))
    )

    const response = await llm.chat({
      messages: [
        { role: 'system', content: NAMING_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8, // Higher creativity for names
      maxTokens: 1024,
      projectId: this.projectId,
    })

    // Parse names from response
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        this.generatedNames = parsed.names || []
      }
    } catch {
      // Fallback names if parsing fails
      this.generatedNames = [
        { name: 'Project Alpha', style: 'abstract', reasoning: 'Default fallback' },
        { name: 'DevBoard One', style: 'compound', reasoning: 'Default fallback' },
        { name: 'Prototype', style: 'punchy', reasoning: 'Default fallback' },
        { name: 'HardwareKit', style: 'descriptive', reasoning: 'Default fallback' },
      ]
    }

    return {
      success: true,
      names: this.generatedNames,
      message: 'Generated 4 name options. Select one or provide a custom name.',
    }
  }

  private async executeSelectProjectName(
    index?: number,
    customName?: string,
    reasoning?: string
  ): Promise<unknown> {
    if (customName) {
      this.selectedProjectName = customName
      return {
        success: true,
        selectedName: customName,
        reasoning: reasoning || 'Custom name provided',
      }
    }

    if (index !== undefined && index >= 0 && index < this.generatedNames.length) {
      this.selectedProjectName = this.generatedNames[index].name
      return {
        success: true,
        selectedName: this.selectedProjectName,
        reasoning: reasoning || this.generatedNames[index].reasoning,
      }
    }

    return { error: 'Must provide either index (0-3) or customName' }
  }

  private async executeFinalizeSpec(confirm: boolean): Promise<unknown> {
    if (!confirm) {
      return { error: 'Confirmation required to finalize spec' }
    }

    // Generate final spec from decisions
    // Use selected name from naming step, or fallback to description
    const finalSpec: FinalSpec = {
      name: this.selectedProjectName || this.currentSpec?.description?.slice(0, 50) || 'Hardware Project',
      summary: this.currentSpec?.description || '',
      pcbSize: { width: 50.8, height: 38.1, unit: 'mm' },
      inputs: [],
      outputs: [],
      power: { source: 'USB-C', voltage: '5V', current: '500mA' },
      communication: { type: 'WiFi', protocol: 'HTTP/MQTT' },
      enclosure: { style: 'rounded_box', width: 60, height: 45, depth: 25 },
      estimatedBOM: [],
      locked: true,
      lockedAt: new Date().toISOString(),
    }

    // Extract from decisions
    for (const decision of this.currentSpec?.decisions || []) {
      if (!decision.question || !decision.answer) continue
      const q = decision.question.toLowerCase()
      const a = decision.answer.toLowerCase()

      if (q.includes('power')) {
        finalSpec.power.source = decision.answer
      }
      if (q.includes('display')) {
        if (a.includes('oled')) {
          finalSpec.outputs.push({ type: 'OLED Display', count: 1, notes: '0.96" I2C' })
        }
      }
      if (q.includes('led')) {
        const count = parseInt(a) || 4
        finalSpec.outputs.push({ type: 'WS2812B LEDs', count, notes: 'RGB addressable' })
      }
    }

    // Add from feasibility
    if (this.currentSpec?.feasibility) {
      for (const input of this.currentSpec.feasibility.inputs.items) {
        finalSpec.inputs.push({ type: input, count: 1, notes: '' })
      }
      for (const output of this.currentSpec.feasibility.outputs.items) {
        if (!output) continue
        if (!finalSpec.outputs.some((o) => o.type?.toLowerCase().includes(output.toLowerCase()))) {
          finalSpec.outputs.push({ type: output, count: 1, notes: '' })
        }
      }
    }

    if (this.currentSpec) {
      this.currentSpec.finalSpec = finalSpec
      if (this.currentSpec.stages) {
        this.currentSpec.stages.spec = { status: 'complete', completedAt: new Date().toISOString() }
      }
      await this.callbacks.onSpecUpdate({ finalSpec, stages: this.currentSpec.stages })
    }

    return { success: true, specLocked: true }
  }

  private async executeSelectBlocks(
    blocks: Array<{ blockSlug?: string; block_slug?: string; gridX?: number; grid_x?: number; gridY?: number; grid_y?: number }>,
    reasoning: string
  ): Promise<unknown> {
    let placedBlocks: PlacedBlock[]

    if (blocks && blocks.length > 0) {
      // Use provided blocks - handle both camelCase and snake_case from LLM
      placedBlocks = blocks.map((b) => {
        const slug = b.blockSlug || b.block_slug || ''
        const x = b.gridX ?? b.grid_x ?? 0
        const y = b.gridY ?? b.grid_y ?? 0
        return {
          blockId: slug,
          blockSlug: slug,
          gridX: x,
          gridY: y,
          rotation: 0 as const,
        }
      })
    } else if (this.currentSpec?.finalSpec) {
      // Auto-select blocks
      const selection = autoSelectBlocks(this.currentSpec.finalSpec, this.availableBlocks)
      placedBlocks = selection.blocks.map((b) => ({
        blockId: b.blockSlug,
        blockSlug: b.blockSlug,
        gridX: b.gridX,
        gridY: b.gridY,
        rotation: b.rotation,
      }))

      // Calculate board size
      const GRID_SIZE_MM = 12.7
      let maxX = 0
      let maxY = 0
      for (const block of placedBlocks) {
        const blockDef = this.availableBlocks.find((b) => b.slug === block.blockSlug)
        if (blockDef) {
          maxX = Math.max(maxX, block.gridX + blockDef.widthUnits)
          maxY = Math.max(maxY, block.gridY + blockDef.heightUnits)
        }
      }

      if (this.currentSpec) {
        this.currentSpec.pcb = {
          placedBlocks,
          boardSize: {
            width: Math.max(maxX, 4) * GRID_SIZE_MM,
            height: Math.max(maxY, 3) * GRID_SIZE_MM,
            unit: 'mm',
          },
          netList: [],
        }
        await this.callbacks.onSpecUpdate({ pcb: this.currentSpec.pcb })
      }

      return { success: true, blockCount: placedBlocks.length, reasoning }
    } else {
      return { error: 'No final spec available for block selection' }
    }

    if (this.currentSpec) {
      this.currentSpec.pcb = {
        placedBlocks,
        boardSize: { width: 50.8, height: 38.1, unit: 'mm' },
        netList: [],
      }
      await this.callbacks.onSpecUpdate({ pcb: this.currentSpec.pcb })
    }

    return { success: true, blockCount: placedBlocks.length, reasoning }
  }

  private async executeGenerateEnclosure(
    style: string,
    wallThickness?: number,
    cornerRadius?: number,
    feedback?: string
  ): Promise<unknown> {
    if (!this.currentSpec?.finalSpec || !this.currentSpec?.pcb) {
      return { error: 'Spec and PCB must be complete before enclosure generation' }
    }

    const input = buildEnclosureInputFromSpec(
      this.currentSpec.finalSpec.name,
      this.currentSpec.finalSpec.summary,
      this.currentSpec.pcb,
      this.currentSpec.finalSpec
    )

    // Override style if provided
    if (style) {
      input.style.type = style as 'box' | 'rounded_box' | 'handheld' | 'wall_mount' | 'desktop'
    }
    if (wallThickness) input.style.wallThickness = wallThickness
    if (cornerRadius) input.style.cornerRadius = cornerRadius

    // Build prompt, including feedback if this is a revision
    let userPrompt = buildEnclosurePrompt(input)
    if (feedback) {
      userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${feedback}`
    }

    const response = await llm.chat({
      messages: [
        { role: 'system', content: ENCLOSURE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 4096,
      projectId: this.projectId,
    })

    // Extract OpenSCAD code
    const codeMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/) || [
      null,
      response.content,
    ]
    const openScadCode = codeMatch[1]?.trim() || response.content

    if (this.currentSpec) {
      this.currentSpec.enclosure = {
        openScadCode,
        iterations: [],
      }
      await this.callbacks.onSpecUpdate({ enclosure: this.currentSpec.enclosure })
    }

    // Return FULL code to orchestrator - it needs this to reason about the design
    // With 1M context window, this is useful, not wasteful (~2-5K tokens)
    const dimensions = this.extractEnclosureDimensions(openScadCode)
    const features = this.extractEnclosureFeatures(openScadCode)

    return {
      success: true,
      code: openScadCode, // FULL CODE - orchestrator sees everything
      codeLength: openScadCode.length,
      dimensions,
      features,
      isRevision: !!feedback,
    }
  }

  private async executeGenerateFirmware(
    enableWifi?: boolean,
    enableBle?: boolean,
    enableOta?: boolean,
    enableDeepSleep?: boolean,
    feedback?: string
  ): Promise<unknown> {
    if (!this.currentSpec?.finalSpec || !this.currentSpec?.pcb) {
      return { error: 'Spec and PCB must be complete before firmware generation' }
    }

    const input = buildFirmwareInputFromSpec(
      this.currentSpec.finalSpec.name,
      this.currentSpec.finalSpec.summary,
      this.currentSpec.finalSpec,
      this.currentSpec.pcb
    )

    // Override preferences if provided
    if (enableWifi !== undefined) input.preferences.useWiFi = enableWifi
    if (enableBle !== undefined) input.preferences.useBLE = enableBle
    if (enableOta !== undefined) input.preferences.useOTA = enableOta
    if (enableDeepSleep !== undefined) input.power.deepSleepEnabled = enableDeepSleep

    // Build prompt, including feedback if this is a revision
    let userPrompt = buildFirmwarePrompt(input)
    if (feedback) {
      userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${feedback}`
    }

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 8192,
      projectId: this.projectId,
    })

    // Parse firmware files from JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    let files: FirmwareFile[] = []

    const validLanguages = ['cpp', 'c', 'h', 'json'] as const
    const toFirmwareFile = (f: { path: string; content: string; language?: string }): FirmwareFile => ({
      path: f.path,
      content: f.content,
      language: validLanguages.includes(f.language as (typeof validLanguages)[number])
        ? (f.language as FirmwareFile['language'])
        : 'cpp',
    })

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        const rawFiles = parsed.files || []
        files = rawFiles.map(toFirmwareFile)
      } catch {
        // If JSON parse fails, create a single main.cpp file
        files = [{ path: 'src/main.cpp', content: response.content, language: 'cpp' }]
      }
    } else {
      files = [{ path: 'src/main.cpp', content: response.content, language: 'cpp' }]
    }

    if (this.currentSpec) {
      this.currentSpec.firmware = {
        files,
        buildStatus: 'pending',
      }
      await this.callbacks.onSpecUpdate({ firmware: this.currentSpec.firmware })
    }

    // Return FULL files to orchestrator - it needs to see the code
    // With 1M context window, this is useful (~3-8K tokens)
    return {
      success: true,
      files, // FULL FILES - orchestrator sees all code
      fileCount: files.length,
      fileNames: files.map((f) => f.path),
      isRevision: !!feedback,
    }
  }

  // ===========================================================================
  // REVIEW TOOLS - Analyst specialists review generated artifacts
  // ===========================================================================

  private async executeReviewEnclosure(): Promise<unknown> {
    const code = this.currentSpec?.enclosure?.openScadCode
    if (!code) {
      return { error: 'No enclosure code to review' }
    }

    const spec = this.currentSpec?.finalSpec
    if (!spec) {
      return { error: 'No specification to review against' }
    }

    // Build context for the analyst
    const reviewContext = `## Project Specification
Name: ${spec.name}
Summary: ${spec.summary}

## Inputs
${JSON.stringify(spec.inputs, null, 2)}

## Outputs
${JSON.stringify(spec.outputs, null, 2)}

## Power
${JSON.stringify(spec.power, null, 2)}

## Enclosure Requirements
${JSON.stringify(spec.enclosure, null, 2)}

## PCB Dimensions
${JSON.stringify(this.currentSpec?.pcb?.boardSize || {}, null, 2)}

## OpenSCAD Code to Review
\`\`\`openscad
${code}
\`\`\`
`

    const response = await llm.chat({
      messages: [
        { role: 'system', content: ENCLOSURE_REVIEW_PROMPT },
        { role: 'user', content: reviewContext },
      ],
      temperature: 0.2, // Lower temp for more consistent analysis
      maxTokens: 2048,
      projectId: this.projectId,
    })

    // Parse the review response
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0])
        return {
          success: true,
          score: review.score || 0,
          verdict: review.verdict || 'revise',
          issues: review.issues || [],
          positives: review.positives || [],
          summary: review.summary || 'Review completed',
        }
      }
    } catch {
      // If JSON parse fails, try to extract key info
    }

    return {
      success: true,
      score: 70,
      verdict: 'revise',
      issues: [{ severity: 'warning', description: 'Could not parse review response' }],
      summary: response.content.slice(0, 200),
    }
  }

  private async executeReviewFirmware(): Promise<unknown> {
    const files = this.currentSpec?.firmware?.files
    if (!files || files.length === 0) {
      return { error: 'No firmware code to review' }
    }

    const spec = this.currentSpec?.finalSpec
    if (!spec) {
      return { error: 'No specification to review against' }
    }

    // Build context for the analyst
    const filesContent = files
      .map((f) => `### ${f.path}\n\`\`\`${f.language || 'cpp'}\n${f.content}\n\`\`\``)
      .join('\n\n')

    const reviewContext = `## Project Specification
Name: ${spec.name}
Summary: ${spec.summary}

## Inputs
${JSON.stringify(spec.inputs, null, 2)}

## Outputs
${JSON.stringify(spec.outputs, null, 2)}

## Power
${JSON.stringify(spec.power, null, 2)}

## Communication
${JSON.stringify(spec.communication, null, 2)}

## PCB Pin Assignments
${JSON.stringify(this.currentSpec?.pcb?.netList || {}, null, 2)}

## Firmware Files to Review
${filesContent}
`

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FIRMWARE_REVIEW_PROMPT },
        { role: 'user', content: reviewContext },
      ],
      temperature: 0.2,
      maxTokens: 2048,
      projectId: this.projectId,
    })

    // Parse the review response
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const review = JSON.parse(jsonMatch[0])
        return {
          success: true,
          score: review.score || 0,
          verdict: review.verdict || 'revise',
          issues: review.issues || [],
          positives: review.positives || [],
          missingFeatures: review.missingFeatures || [],
          summary: review.summary || 'Review completed',
        }
      }
    } catch {
      // If JSON parse fails, try to extract key info
    }

    return {
      success: true,
      score: 70,
      verdict: 'revise',
      issues: [{ severity: 'warning', description: 'Could not parse review response' }],
      summary: response.content.slice(0, 200),
    }
  }

  private async executeAcceptAndRender(stage: string): Promise<unknown> {
    if (stage === 'enclosure') {
      // Trigger STL render for user preview
      this.addHistoryItem({
        type: 'progress',
        stage: 'enclosure',
        action: 'Enclosure accepted - rendering STL preview for user',
      })

      // The actual render happens in the frontend via OpenSCAD WASM
      // We just signal that it's ready
      return {
        success: true,
        stage: 'enclosure',
        message: 'Enclosure accepted. STL render triggered for user preview.',
        nextStep: 'mark_stage_complete("enclosure")',
      }
    } else if (stage === 'firmware') {
      this.addHistoryItem({
        type: 'progress',
        stage: 'firmware',
        action: 'Firmware accepted - ready for user review',
      })

      return {
        success: true,
        stage: 'firmware',
        message: 'Firmware accepted. Code ready for user review.',
        nextStep: 'mark_stage_complete("firmware")',
      }
    }

    return { error: `Unknown stage for accept_and_render: ${stage}` }
  }

  private async executeValidation(checkType: string): Promise<unknown> {
    if (!this.currentSpec) {
      return { error: 'No spec to validate' }
    }

    this.updateState({ status: 'validating' })

    const result = validateCrossStage(
      this.currentSpec,
      checkType as 'pcb_fits_enclosure' | 'firmware_matches_pcb' | 'spec_satisfied' | 'all'
    )

    this.updateState({
      validationResult: result,
      status: result.valid ? 'running' : 'fixing',
    })

    this.addHistoryItem({
      type: 'validation',
      stage: this.state.currentStage,
      action: `Validation (${checkType})`,
      result: result.valid ? 'PASSED' : `FAILED: ${result.issues.length} issues`,
      details: { issueCount: result.issues.length, issues: result.issues.map((i) => i.message) },
    })

    return {
      valid: result.valid,
      issueCount: result.issues.length,
      issues: result.issues.map((i) => ({
        severity: i.severity,
        stage: i.stage,
        message: i.message,
      })),
      suggestions: result.suggestions.map((s) => ({
        stage: s.stage,
        action: s.action,
        autoFixable: s.autoFixable,
      })),
      report: generateValidationReport(result),
    }
  }

  private async executeFixIssue(stage: string, issue: string, fix: string): Promise<unknown> {
    this.addHistoryItem({
      type: 'fix',
      stage: stage as OrchestratorStage,
      action: `Fixing: ${issue}`,
      result: fix,
    })

    // Re-run the appropriate stage generation
    switch (stage) {
      case 'enclosure':
        return this.executeGenerateEnclosure('rounded_box')
      case 'firmware':
        return this.executeGenerateFirmware(true, false, true, false)
      case 'pcb':
        return this.executeSelectBlocks([], fix)
      default:
        return { success: true, message: `Issue noted: ${fix}` }
    }
  }

  private async executeMarkComplete(stage: string): Promise<unknown> {
    if (this.currentSpec?.stages) {
      const stageKey = stage as keyof typeof this.currentSpec.stages
      this.currentSpec.stages[stageKey] = {
        status: 'complete',
        completedAt: new Date().toISOString(),
      }

      // Advance to next stage
      const stageOrder: OrchestratorStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']
      const currentIndex = stageOrder.indexOf(stage as OrchestratorStage)
      if (currentIndex < stageOrder.length - 1) {
        const nextStage = stageOrder[currentIndex + 1]
        this.currentSpec.stages[nextStage] = { status: 'in_progress' }
        this.updateState({ currentStage: nextStage })
      }

      await this.callbacks.onSpecUpdate({ stages: this.currentSpec.stages })
    }

    return { success: true, stage, status: 'complete' }
  }

  private executeReportProgress(message: string, stage: string, percentage?: number): unknown {
    this.addHistoryItem({
      type: 'progress',
      stage: stage as OrchestratorStage,
      action: message,
      details: percentage !== undefined ? { percentage } : undefined,
    })

    this.updateState({
      currentStage: stage as OrchestratorStage,
      currentAction: message,
    })

    return { success: true }
  }

  private async executeRequestUserInput(
    question: string,
    options: string[] | undefined,
    _context: string
  ): Promise<unknown> {
    if (!this.callbacks.onUserInputRequired) {
      // In VIBE IT mode, pick first option
      if (this.mode === 'vibe_it' && options && options.length > 0) {
        return { answer: options[0], autoSelected: true }
      }
      return { error: 'User input not available in this mode' }
    }

    const answer = await this.callbacks.onUserInputRequired(question, options)
    return { answer, userProvided: true }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract key dimensions from OpenSCAD code for decision-making.
   * Returns structured dimensions that the orchestrator can reason about.
   */
  private extractEnclosureDimensions(code: string): Record<string, number | string> | null {
    if (!code) return null

    const dimensions: Record<string, number | string> = {}

    // Extract common dimension variables
    const patterns = [
      { name: 'case_w', regex: /case_w\s*=\s*([\d.]+)/ },
      { name: 'case_h', regex: /case_h\s*=\s*([\d.]+)/ },
      { name: 'case_d', regex: /case_d\s*=\s*([\d.]+)/ },
      { name: 'wall', regex: /wall(?:_thickness)?\s*=\s*([\d.]+)/ },
      { name: 'pcb_w', regex: /pcb_w\s*=\s*([\d.]+)/ },
      { name: 'pcb_h', regex: /pcb_h\s*=\s*([\d.]+)/ },
      { name: 'corner_radius', regex: /corner_radius\s*=\s*([\d.]+)/ },
    ]

    for (const { name, regex } of patterns) {
      const match = code.match(regex)
      if (match) {
        dimensions[name] = parseFloat(match[1])
      }
    }

    // Count features
    const buttonHoles = (code.match(/button_hole|btn_.*_pos/g) || []).length
    const usbCutout = code.includes('usb') ? 1 : 0
    const ledHoles = (code.match(/led_hole|led_pos/g) || []).length

    if (buttonHoles) dimensions.buttonHoles = buttonHoles
    if (usbCutout) dimensions.hasUsbCutout = 'yes'
    if (ledHoles) dimensions.ledHoles = ledHoles

    return Object.keys(dimensions).length > 0 ? dimensions : null
  }

  /**
   * Extract feature information from OpenSCAD code.
   * Identifies cutouts, mounting points, and design features.
   */
  private extractEnclosureFeatures(code: string): Record<string, unknown> | null {
    if (!code) return null

    const features: Record<string, unknown> = {}

    // Count button cutouts
    const buttonMatches = code.match(/button|btn/gi)
    if (buttonMatches) {
      features.buttonCount = buttonMatches.length
    }

    // Check for USB cutout
    if (/usb|type.?c/i.test(code)) {
      features.hasUsbCutout = true
    }

    // Check for LED holes/light pipes
    const ledMatches = code.match(/led|light.?pipe/gi)
    if (ledMatches) {
      features.ledCount = ledMatches.length
    }

    // Check for mounting holes/screw bosses
    const mountMatches = code.match(/mount|screw|boss/gi)
    if (mountMatches) {
      features.hasMountingHoles = true
      features.mountingCount = mountMatches.length
    }

    // Check for sensor openings
    if (/sensor|pir|vent|opening/i.test(code)) {
      features.hasSensorOpenings = true
    }

    // Check for lid/base design
    if (/lid|base|top|bottom/i.test(code)) {
      features.hasLidDesign = true
    }

    // Check for snap fits or other assembly features
    if (/snap|clip|latch|hinge/i.test(code)) {
      features.hasSnapFits = true
    }

    // Identify enclosure style
    if (/rounded|fillet|chamfer/i.test(code)) {
      features.style = 'rounded'
    } else if (/wall.?mount/i.test(code)) {
      features.style = 'wall_mount'
    } else if (/handheld|ergonomic/i.test(code)) {
      features.style = 'handheld'
    } else {
      features.style = 'box'
    }

    return Object.keys(features).length > 0 ? features : null
  }

  /**
   * Compress tool results for conversation history.
   * Full artifacts are stored in currentSpec; history only gets summaries.
   * This reduces token usage by ~80% for large results.
   */
  private compressToolResult(toolName: string, result: unknown): unknown {
    // Handle error results as-is
    if (result && typeof result === 'object' && 'error' in result) {
      return result
    }

    const r = result as Record<string, unknown>

    switch (toolName) {
      case 'analyze_feasibility':
        return {
          success: r.success ?? true,
          manufacturable: r.manufacturable,
          score: r.overallScore ?? r.score,
          openQuestionCount: Array.isArray(r.openQuestions) ? r.openQuestions.length : 0,
          // Full feasibility stored in spec.feasibility
        }

      case 'generate_blueprints':
        return {
          success: true,
          blueprintCount: Array.isArray(r.blueprints) ? r.blueprints.length : (r.blueprintCount ?? 4),
          // Full blueprints stored in spec.blueprints
        }

      case 'select_blueprint':
        return {
          success: true,
          selectedIndex: r.selectedIndex ?? r.index,
          reasoning: r.reasoning,
        }

      case 'finalize_spec':
        return {
          success: true,
          specLocked: true,
          // Full finalSpec stored in spec.finalSpec
        }

      case 'select_pcb_blocks':
        return {
          success: true,
          blockCount: Array.isArray(r.placedBlocks) ? r.placedBlocks.length : (r.blockCount ?? 0),
          reasoning: r.reasoning,
          // Full blocks stored in spec.pcb.placedBlocks
        }

      case 'generate_enclosure': {
        // FULL OpenSCAD code passed to orchestrator - it needs to see the code
        // to understand review feedback and make informed decisions
        // With 1M context window, ~2-5K tokens for OpenSCAD is fine
        const code = typeof r.openScadCode === 'string' ? r.openScadCode : (r.code as string) || ''
        const dimensions = this.extractEnclosureDimensions(code)
        const features = this.extractEnclosureFeatures(code)
        return {
          success: true,
          code, // FULL CODE - orchestrator sees everything for decision-making
          codeLength: code.length || (r.codeLength ?? 0),
          dimensions,
          features,
          isRevision: r.isRevision,
        }
      }

      case 'generate_firmware': {
        // FULL files passed to orchestrator - it needs to see the code
        // to understand review feedback and make informed decisions
        // With 1M context window, ~3-8K tokens for firmware is fine
        const files = Array.isArray(r.files) ? r.files : []
        return {
          success: true,
          files, // FULL FILES - orchestrator sees all code for decision-making
          fileCount: files.length || (r.fileCount ?? 0),
          fileNames: files.map((f: { path?: string }) => f.path).filter(Boolean),
          isRevision: r.isRevision,
        }
      }

      case 'validate_cross_stage':
        // Validation reports are already reasonably sized
        return {
          valid: r.valid ?? (r.issueCount === 0),
          issueCount: r.issueCount ?? 0,
          issues: r.issues ?? [],
          suggestions: r.suggestions ?? [],
          report: r.report,
        }

      case 'mark_stage_complete':
        return {
          success: true,
          stage: r.stage,
          status: 'complete',
        }

      case 'review_enclosure':
      case 'review_firmware':
        // CRITICAL: Review results must pass through UNCOMPRESSED
        // The orchestrator needs to see ALL issues to pass meaningful feedback
        // for the generate → review → decide workflow
        return result

      case 'accept_and_render':
        // Accept results should include what was accepted
        return {
          success: r.success ?? true,
          stage: r.stage,
          message: r.message,
        }

      case 'report_progress':
      case 'fix_stage_issue':
      case 'request_user_input':
      case 'answer_questions_auto':
        // These are already small, pass through
        return result

      default:
        // Unknown tools: truncate if too large
        const json = JSON.stringify(result)
        if (json.length > 500) {
          return { success: true, truncated: true, preview: json.slice(0, 200) + '...' }
        }
        return result
    }
  }

  /**
   * Trim conversation history to prevent unbounded growth.
   * Keeps the system message and most recent messages.
   * OPTIMIZED: More aggressive trimming (15→8 instead of 40→20)
   */
  private trimConversationHistory(): void {
    const MAX_MESSAGES = 15 // Reduced from 40 for token efficiency
    const TRIM_TO = 8 // Reduced from 20 - keep system + summary + last 6 exchanges

    if (this.conversationHistory.length <= MAX_MESSAGES) {
      return
    }

    // Always keep the system message (first message)
    const systemMessage = this.conversationHistory[0]
    const recentMessages = this.conversationHistory.slice(-TRIM_TO)

    // Create a concise summary of trimmed history with current state
    const trimmedCount = this.conversationHistory.length - TRIM_TO - 1
    const completedStages = Object.entries(this.currentSpec?.stages || {})
      .filter(([, s]) => s?.status === 'complete')
      .map(([name]) => name)
      .join(', ')

    const summaryMessage: ChatMessage = {
      role: 'user',
      content: `[${trimmedCount} messages trimmed. Stage: ${this.state.currentStage}. Completed: ${completedStages || 'none'}. Iteration: ${this.state.iterationCount}. Continue.]`,
    }

    this.conversationHistory = [systemMessage, summaryMessage, ...recentMessages]
  }

  /**
   * Persist orchestrator state for resume capability.
   * Saves conversation history and iteration count so the user can
   * pause, reload the page, and resume from where they left off.
   */
  private async persistState(
    status: PersistedOrchestratorState['status']
  ): Promise<void> {
    if (!this.currentSpec) return

    // Filter out tool messages (results stored in spec) and stringify content
    const filteredHistory = this.conversationHistory
      .filter((msg) => msg.role !== 'tool')
      .map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      }))

    const persistedState: PersistedOrchestratorState = {
      conversationHistory: filteredHistory,
      iteration: this.state.iterationCount,
      status,
      currentStage: this.state.currentStage,
      updatedAt: new Date().toISOString(),
    }

    this.currentSpec.orchestratorState = persistedState
    await this.callbacks.onSpecUpdate({ orchestratorState: persistedState })
  }

  private isComplete(): boolean {
    return this.currentSpec?.stages?.export?.status === 'complete'
  }

  private updateState(updates: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...updates }
    this.callbacks.onStateChange(this.state)
  }

  private addHistoryItem(item: Omit<OrchestratorHistoryItem, 'id' | 'timestamp'>): void {
    const historyItem: OrchestratorHistoryItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    }
    this.state.history.push(historyItem)
    this.callbacks.onStateChange(this.state)
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createOrchestrator(
  projectId: string,
  mode: OrchestratorMode,
  callbacks: OrchestratorCallbacks
): HardwareOrchestrator {
  return new HardwareOrchestrator(projectId, mode, callbacks)
}
