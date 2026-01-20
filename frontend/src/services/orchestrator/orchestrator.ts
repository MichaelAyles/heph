/**
 * Hardware Design Orchestrator Service
 *
 * Marathon agent that autonomously drives hardware design from spec through
 * PCB, enclosure, firmware, and export stages using Gemini tool calling.
 *
 * Supports two modes:
 * 1. LLM-driven (default): Uses Gemini tool calling with hardcoded prompts
 * 2. Edge-driven (experimental): Uses DB-stored prompts and graph-based navigation
 */

import { llm, type ChatMessage, type ToolCall } from '../llm'
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  ORCHESTRATOR_TOOLS,
  buildOrchestratorInitPrompt,
} from '@/prompts/orchestrator'
import type { ProjectSpec, PcbBlock } from '@/db/schema'
import type {
  OrchestratorMode,
  OrchestratorState,
  OrchestratorStage,
  OrchestratorCallbacks,
  OrchestratorHistoryItem,
  OrchestratorContext,
  PersistenceStatus,
} from './types'

import { getTool } from './tools'
import { compressToolResult } from './helpers/compression'
import { trimConversationHistory, persistState, buildDefaultStages } from './helpers/state'

// New edge-driven imports
import { loadPrompt } from './prompt-loader'
import { EdgeExecutionEngine } from './edge-engine'
import { buildContextFromSelector, renderPromptTemplate } from './context-builder'

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

  // Shared state for cross-tool communication
  private generatedNames: Array<{ name: string; style: string; reasoning: string }> = []
  private selectedProjectName: string | null = null

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

    // Merge existingSpec with defaults, ensuring stages always exists
    this.currentSpec = existingSpec
      ? {
          ...existingSpec,
          stages: {
            ...buildDefaultStages(),
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
          stages: buildDefaultStages(),
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
        await this.persistCurrentState('running')

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
        await this.persistCurrentState('completed')
        this.callbacks.onComplete(this.state)
      }
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        currentAction: null,
      })
      await this.persistCurrentState('error')
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
    await this.persistCurrentState('paused')
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
    this.conversationHistory = trimConversationHistory(
      this.conversationHistory,
      this.state.currentStage,
      this.currentSpec,
      this.state.iterationCount
    )

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
        // IMPORTANT: Add assistant message FIRST, then tool results
        // Gemini requires: assistant (with tool_calls) -> tool results (in order)
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        })

        // Execute all tool calls and collect results
        const toolResults: Array<{ toolCallId: string; result: unknown }> = []
        for (const toolCall of response.toolCalls) {
          const result = await this.executeToolCall(toolCall)
          toolResults.push({ toolCallId: toolCall.id, result })
        }

        // Add ALL tool results to history (must match count of tool calls)
        for (const { toolCallId, result } of toolResults) {
          const toolCall = response.toolCalls.find((tc) => tc.id === toolCallId)
          const compressedResult = compressToolResult(toolCall?.name || '', result)
          this.conversationHistory.push({
            role: 'tool',
            content: JSON.stringify(compressedResult),
            toolCallId,
          })
        }
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

  /**
   * Build the context object for tool execution
   */
  private buildContext(): OrchestratorContext {
    return {
      projectId: this.projectId,
      mode: this.mode,
      currentSpec: this.currentSpec,
      availableBlocks: this.availableBlocks,
      callbacks: this.callbacks,

      // State accessors
      getCurrentStage: () => this.state.currentStage,

      // State mutators
      updateSpec: (spec: ProjectSpec | null) => {
        this.currentSpec = spec
      },
      setSpec: async (partial: Partial<ProjectSpec>) => {
        await this.callbacks.onSpecUpdate(partial)
      },
      addHistoryItem: (item) => this.addHistoryItem(item),
      updateState: (updates) => this.updateState(updates),

      // Shared state
      generatedNames: this.generatedNames,
      selectedProjectName: this.selectedProjectName,
      setGeneratedNames: (names) => {
        this.generatedNames = names
      },
      setSelectedProjectName: (name) => {
        this.selectedProjectName = name
      },
    }
  }

  /**
   * Execute a tool call using the tool registry
   */
  private async executeToolCall(toolCall: ToolCall): Promise<unknown> {
    const { name, arguments: args } = toolCall

    this.addHistoryItem({
      type: 'tool_call',
      stage: this.state.currentStage,
      action: name,
      details: args as Record<string, unknown>,
    })

    this.updateState({ currentAction: `Executing: ${name}` })

    let result: unknown

    try {
      const handler = getTool(name)
      if (!handler) {
        result = { error: `Unknown tool: ${name}` }
      } else {
        const ctx = this.buildContext()
        result = await handler(ctx, args as Record<string, unknown>)
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

    // Add to display history
    this.addHistoryItem({
      type: 'tool_result',
      stage: this.state.currentStage,
      action: name,
      result:
        typeof result === 'string'
          ? result
          : JSON.stringify(compressToolResult(name, result)).slice(0, 200),
    })

    return result
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async persistCurrentState(status: PersistenceStatus): Promise<void> {
    await persistState(
      this.currentSpec,
      this.conversationHistory,
      this.state.iterationCount,
      status,
      this.state.currentStage,
      this.callbacks
    )
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

  // ===========================================================================
  // EDGE-DRIVEN EXECUTION (EXPERIMENTAL)
  // ===========================================================================

  /**
   * Execute a single prompt node using DB-loaded configuration.
   * This is the building block for edge-driven execution.
   *
   * @param nodeName - The prompt node to execute
   * @param additionalContext - Extra context to merge with selector-derived context
   * @returns The result from the prompt execution
   */
  async executePromptNode(
    nodeName: string,
    additionalContext?: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      // Load the prompt from DB
      const prompt = await loadPrompt(nodeName)
      if (!prompt) {
        return { success: false, error: `Prompt not found: ${nodeName}` }
      }

      // Build context from selector
      const selectorContext = buildContextFromSelector(
        this.currentSpec,
        prompt.contextSelector || ['*']
      )

      // Merge with additional context
      const context = { ...selectorContext, ...additionalContext }

      // Render the user prompt template
      const userPrompt = prompt.userPromptTemplate
        ? renderPromptTemplate(prompt.userPromptTemplate, context)
        : JSON.stringify(context, null, 2)

      // Build messages for LLM
      const messages: ChatMessage[] = [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userPrompt },
      ]

      this.addHistoryItem({
        type: 'tool_call',
        stage: this.state.currentStage,
        action: `Executing: ${nodeName}`,
        details: { nodeName, contextKeys: Object.keys(context) },
      })

      // Call LLM
      const response = await llm.chat({
        messages,
        temperature: 0.3,
        projectId: this.projectId,
      })

      // Parse response based on output format
      let data: unknown
      if (prompt.outputFormat === 'json') {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0])
        } else {
          return { success: false, error: 'No JSON found in response' }
        }
      } else if (prompt.outputFormat === 'code') {
        // Extract code from markdown code blocks if present
        const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)```/)
        data = codeMatch ? codeMatch[1] : response.content
      } else {
        data = response.content
      }

      this.addHistoryItem({
        type: 'tool_result',
        stage: this.state.currentStage,
        action: `${nodeName} completed`,
        result: typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200),
      })

      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.addHistoryItem({
        type: 'error',
        stage: this.state.currentStage,
        action: `${nodeName} failed`,
        result: errorMessage,
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get the edge engine for this orchestrator instance.
   * Used for advanced edge-driven navigation.
   */
  async getEdgeEngine(): Promise<EdgeExecutionEngine> {
    const engine = new EdgeExecutionEngine()
    await Promise.all([engine.loadEdges(), engine.loadHooks()])

    // Initialize context from current state
    engine.updateContext({
      mode: this.mode,
      spec: this.currentSpec as unknown as Record<string, unknown>,
      currentStage: this.state.currentStage,
      loopCount: {
        spec: 0,
        pcb: 0,
        enclosure: 0,
        firmware: 0,
      },
      lastResult: null,
      lastValidation: null,
      lastReview: null,
    })

    return engine
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
