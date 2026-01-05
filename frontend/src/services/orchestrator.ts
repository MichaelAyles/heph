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
import {
  buildFirmwarePrompt,
  buildFirmwareInputFromSpec,
  FIRMWARE_SYSTEM_PROMPT,
} from '@/prompts/firmware'
import type { ProjectSpec, FinalSpec, PlacedBlock, PcbBlock } from '@/db/schema'

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
    this.currentSpec = existingSpec || {
      description,
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
      stages: {
        spec: { status: 'in_progress' },
        pcb: { status: 'pending' },
        enclosure: { status: 'pending' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      },
    }

    this.updateState({
      status: 'running',
      startedAt: new Date().toISOString(),
      currentAction: 'Initializing orchestrator...',
    })

    // Initialize conversation
    this.conversationHistory = [
      {
        role: 'system',
        content: ORCHESTRATOR_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildOrchestratorInitPrompt(description, this.mode),
      },
    ]

    try {
      // Main orchestration loop
      while (this.isRunning && !this.isComplete()) {
        this.state.iterationCount++
        await this.runIteration()

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
        this.callbacks.onComplete(this.state)
      }
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        currentAction: null,
      })
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.isRunning = false
    this.updateState({
      status: 'paused',
      currentAction: null,
    })
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
            args.corner_radius as number | undefined
          )
          break

        case 'generate_firmware':
          result = await this.executeGenerateFirmware(
            args.enable_wifi as boolean | undefined,
            args.enable_ble as boolean | undefined,
            args.enable_ota as boolean | undefined,
            args.enable_deep_sleep as boolean | undefined
          )
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

    // Add tool result to conversation
    this.conversationHistory.push({
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: id,
    })

    this.addHistoryItem({
      type: 'tool_result',
      stage: this.state.currentStage,
      action: name,
      result: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 200),
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

  private async executeFinalizeSpec(confirm: boolean): Promise<unknown> {
    if (!confirm) {
      return { error: 'Confirmation required to finalize spec' }
    }

    // Generate final spec from decisions
    const finalSpec: FinalSpec = {
      name: this.currentSpec?.description?.slice(0, 50) || 'Hardware Project',
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
        if (!finalSpec.outputs.some((o) => o.type.toLowerCase().includes(output.toLowerCase()))) {
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
    blocks: Array<{ blockSlug: string; gridX: number; gridY: number }>,
    reasoning: string
  ): Promise<unknown> {
    let placedBlocks: PlacedBlock[]

    if (blocks && blocks.length > 0) {
      // Use provided blocks
      placedBlocks = blocks.map((b) => ({
        blockId: b.blockSlug,
        blockSlug: b.blockSlug,
        gridX: b.gridX,
        gridY: b.gridY,
        rotation: 0 as const,
      }))
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
    cornerRadius?: number
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

    const response = await llm.chat({
      messages: [
        { role: 'system', content: ENCLOSURE_SYSTEM_PROMPT },
        { role: 'user', content: buildEnclosurePrompt(input) },
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

    return { success: true, codeLength: openScadCode.length }
  }

  private async executeGenerateFirmware(
    enableWifi?: boolean,
    enableBle?: boolean,
    enableOta?: boolean,
    enableDeepSleep?: boolean
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

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
        { role: 'user', content: buildFirmwarePrompt(input) },
      ],
      temperature: 0.3,
      maxTokens: 8192,
      projectId: this.projectId,
    })

    // Parse firmware files from JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    let files = []

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        files = parsed.files || []
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

    return { success: true, fileCount: files.length }
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
