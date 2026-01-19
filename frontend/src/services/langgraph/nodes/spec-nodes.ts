/**
 * Spec Pipeline Nodes
 *
 * LangGraph nodes for the specification pipeline:
 * - analyzeFeasibility: Analyze hardware idea feasibility
 * - collectAnswers: Collect user answers to refinement questions
 * - checkMoreQuestions: Check if more refinement is needed
 * - generateBlueprints: Generate product blueprint images
 * - selectBlueprint: Select a blueprint (user or AI)
 * - generateNames: Generate project name options
 * - selectName: Select project name (user or AI)
 * - finalizeSpec: Generate final locked specification
 */

import type { RunnableConfig } from '@langchain/core/runnables'
import {
  type OrchestratorState,
  type OrchestratorStateUpdate,
  createHistoryItem,
  requiresUserInput,
} from '../state'
import { llm } from '../../llm'
import { buildFeasibilityPrompt, FEASIBILITY_SYSTEM_PROMPT } from '../../../prompts/feasibility'

// =============================================================================
// IMAGE GENERATION
// =============================================================================

async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('/api/llm/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error('Image generation failed')
  const data = await response.json()
  return data.imageUrl
}
import { buildRefinementPrompt, REFINEMENT_SYSTEM_PROMPT } from '../../../prompts/refinement'
import { buildBlueprintPrompts } from '../../../prompts/blueprint'
import { buildFinalSpecPrompt, FINAL_SPEC_SYSTEM_PROMPT } from '../../../prompts/finalSpec'
import { NAMING_SYSTEM_PROMPT, buildNamingPrompt } from '../../../prompts/naming'
import type { FeasibilityAnalysis, Decision, Blueprint, FinalSpec } from '../../../db/schema'

// =============================================================================
// NODE CONTEXT
// =============================================================================

/**
 * Context passed to nodes from the graph configuration
 */
export interface NodeContext {
  projectId: string
  userId: string
}

/**
 * Extract node context from runnable config
 */
function getNodeContext(config?: RunnableConfig): NodeContext {
  const configurable = config?.configurable as Record<string, unknown> | undefined
  return {
    projectId: (configurable?.thread_id as string) ?? '',
    userId: (configurable?.userId as string) ?? '',
  }
}

// =============================================================================
// FEASIBILITY NODE
// =============================================================================

/**
 * Analyze hardware idea feasibility.
 *
 * Input: description
 * Output: feasibility, openQuestions (or rejection)
 */
export async function analyzeFeasibility(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'analyzeFeasibility'

  // Add history entry
  const historyEntry = createHistoryItem(nodeId, 'node_enter', {
    description: state.description.slice(0, 100),
  })

  try {
    // Build prompt
    const userPrompt = buildFeasibilityPrompt(state.description)

    // Call LLM
    const response = await llm.chat({
      messages: [
        { role: 'system', content: FEASIBILITY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      projectId: ctx.projectId,
    })

    // Parse response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON in feasibility response')
    }

    const result = JSON.parse(jsonMatch[0]) as {
      manufacturable: boolean
      rejection_reason?: string
      analysis: FeasibilityAnalysis
      open_questions: Array<{
        id: string
        question: string
        options: string[]
        explanation?: string
      }>
    }

    // Check for rejection
    if (!result.manufacturable) {
      return {
        feasibility: result.analysis,
        status: 'rejected',
        error: result.rejection_reason ?? 'Project not manufacturable with available components',
        history: [
          historyEntry,
          createHistoryItem(nodeId, 'node_exit', { rejected: true }),
        ],
      }
    }

    // Success - return feasibility and open questions
    return {
      feasibility: result.analysis,
      openQuestions: result.open_questions ?? [],
      currentStage: 'spec',
      status: 'running',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', {
          model: response.model,
          tokens: response.usage?.totalTokens,
        }),
        createHistoryItem(nodeId, 'node_exit', {
          manufacturable: true,
          questionCount: result.open_questions?.length ?? 0,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Feasibility analysis failed',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
      ],
    }
  }
}

// =============================================================================
// REFINEMENT NODES
// =============================================================================

/**
 * Collect user answers to refinement questions.
 *
 * This node handles user input - it either:
 * 1. In vibe_it mode: AI picks answers automatically
 * 2. In fix_it/design_it: Waits for user input (interrupt)
 */
export async function collectAnswers(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'collectAnswers'

  // Check if we need user input
  if (requiresUserInput(state.mode, nodeId)) {
    // Return interrupt state
    return {
      status: 'awaiting_input',
      userInputRequest: {
        nodeId,
        prompt: state.openQuestions[0]?.question ?? 'Please answer the question',
        options: state.openQuestions[0]?.options ?? [],
        allowCustom: true,
      },
      history: [
        createHistoryItem(nodeId, 'node_enter', { awaitingInput: true }),
      ],
    }
  }

  // In vibe_it mode, AI picks answers
  const historyEntry = createHistoryItem(nodeId, 'node_enter', { autoMode: true })

  try {
    // AI picks the first option for each question (simple heuristic)
    // In a real implementation, this would use the LLM to make intelligent choices
    const newDecisions: Decision[] = state.openQuestions.map((q) => ({
      questionId: q.id,
      question: q.question,
      answer: q.options[0] ?? 'Default option',
      timestamp: new Date().toISOString(),
    }))

    return {
      decisions: newDecisions,
      openQuestions: [], // Clear questions after answering
      refinementRound: state.refinementRound + 1,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'node_exit', {
          answeredCount: newDecisions.length,
          autoMode: true,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to collect answers',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
      ],
    }
  }
}

/**
 * Process user input response for collectAnswers.
 * Called after user provides their answer.
 */
export async function processAnswerInput(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'collectAnswers'

  if (!state.userInputResponse) {
    return {
      status: 'error',
      error: 'No user input response provided',
    }
  }

  const currentQuestion = state.openQuestions[0]
  if (!currentQuestion) {
    return {
      openQuestions: [],
      refinementRound: state.refinementRound + 1,
      userInputRequest: null,
      userInputResponse: null,
      status: 'running',
    }
  }

  const answer = Array.isArray(state.userInputResponse.selection)
    ? state.userInputResponse.selection.join(', ')
    : state.userInputResponse.selection

  const decision: Decision = {
    questionId: currentQuestion.id,
    question: currentQuestion.question,
    answer,
    timestamp: new Date().toISOString(),
  }

  return {
    decisions: [decision], // Reducer will append
    openQuestions: state.openQuestions.slice(1), // Remove answered question
    userInputRequest: null,
    userInputResponse: null,
    status: 'running',
    history: [
      createHistoryItem(nodeId, 'user_input', {
        question: currentQuestion.question,
        answer,
      }),
    ],
  }
}

/**
 * Check if more refinement questions are needed.
 *
 * Calls LLM to determine if we have enough info or need more questions.
 * Max 5 rounds of refinement.
 */
export async function checkMoreQuestions(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'checkMoreQuestions'

  const historyEntry = createHistoryItem(nodeId, 'node_enter', {
    round: state.refinementRound,
    decisionCount: state.decisions.length,
  })

  // Max 5 rounds
  if (state.refinementRound >= 5) {
    return {
      openQuestions: [],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'node_exit', { complete: true, reason: 'max_rounds' }),
      ],
    }
  }

  try {
    // Build prompt with current decisions
    const userPrompt = buildRefinementPrompt(
      state.description,
      state.feasibility ?? {},
      state.decisions
    )

    // Call LLM
    const response = await llm.chat({
      messages: [
        { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      projectId: ctx.projectId,
    })

    // Parse response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // No JSON means no more questions needed
      return {
        openQuestions: [],
        history: [
          historyEntry,
          createHistoryItem(nodeId, 'node_exit', { complete: true }),
        ],
      }
    }

    const result = JSON.parse(jsonMatch[0]) as {
      complete: boolean
      additional_questions?: Array<{
        id: string
        question: string
        options: string[]
        explanation?: string
      }>
    }

    if (result.complete || !result.additional_questions?.length) {
      return {
        openQuestions: [],
        history: [
          historyEntry,
          createHistoryItem(nodeId, 'llm_call', { model: response.model }),
          createHistoryItem(nodeId, 'node_exit', { complete: true }),
        ],
      }
    }

    return {
      openQuestions: result.additional_questions,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', {
          complete: false,
          newQuestions: result.additional_questions.length,
        }),
      ],
    }
  } catch (error) {
    // On error, proceed anyway (be resilient)
    return {
      openQuestions: [],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
        createHistoryItem(nodeId, 'node_exit', { complete: true, reason: 'error_fallback' }),
      ],
    }
  }
}

// =============================================================================
// BLUEPRINT NODES
// =============================================================================

/**
 * Generate product blueprint images.
 *
 * Generates 8 variations (4 Style A + 4 Style B) in parallel.
 */
export async function generateBlueprints(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'generateBlueprints'

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    // Build 8 prompts (4 each for style A and B)
    const prompts = buildBlueprintPrompts(
      state.description,
      state.decisions,
      state.feasibility ?? {}
    )

    // Generate all images in parallel
    const blueprintPromises = prompts.map(async (prompt, index) => {
      try {
        const imageUrl = await generateImage(prompt)
        return {
          url: imageUrl,
          prompt,
        } as Blueprint
      } catch (error) {
        console.error(`Blueprint ${index} generation failed:`, error)
        return null
      }
    })

    const results = await Promise.all(blueprintPromises)
    const blueprints = results.filter((b): b is Blueprint => b !== null)

    if (blueprints.length === 0) {
      throw new Error('All blueprint generations failed')
    }

    return {
      blueprints,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'node_exit', {
          generated: blueprints.length,
          failed: prompts.length - blueprints.length,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Blueprint generation failed',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
      ],
    }
  }
}

/**
 * Select a blueprint.
 *
 * In vibe_it mode: AI picks the best
 * In fix_it/design_it: User picks
 */
export async function selectBlueprint(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'selectBlueprint'

  // Check if we need user input
  if (requiresUserInput(state.mode, nodeId)) {
    return {
      status: 'awaiting_input',
      userInputRequest: {
        nodeId,
        prompt: 'Select the blueprint that best represents your product vision',
        options: state.blueprints.map((_, i) => `Blueprint ${i + 1}`),
        allowCustom: false,
      },
      history: [
        createHistoryItem(nodeId, 'node_enter', { awaitingInput: true }),
      ],
    }
  }

  // In vibe_it mode, AI picks (for now, just pick the first one)
  // A more sophisticated approach would use vision to evaluate
  return {
    selectedBlueprint: 0,
    status: 'running',
    history: [
      createHistoryItem(nodeId, 'node_enter', { autoMode: true }),
      createHistoryItem(nodeId, 'node_exit', { selected: 0, autoMode: true }),
    ],
  }
}

/**
 * Process user blueprint selection.
 */
export async function processBlueprintSelection(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'selectBlueprint'

  if (!state.userInputResponse) {
    return {
      status: 'error',
      error: 'No blueprint selection provided',
    }
  }

  // Parse selection (e.g., "Blueprint 1" -> 0)
  const selection = Array.isArray(state.userInputResponse.selection)
    ? state.userInputResponse.selection[0]
    : state.userInputResponse.selection

  const match = selection.match(/Blueprint (\d+)/i)
  const index = match ? parseInt(match[1], 10) - 1 : 0

  return {
    selectedBlueprint: Math.max(0, Math.min(index, state.blueprints.length - 1)),
    userInputRequest: null,
    userInputResponse: null,
    status: 'running',
    history: [
      createHistoryItem(nodeId, 'user_input', { selected: index }),
    ],
  }
}

// =============================================================================
// NAMING NODES
// =============================================================================

/**
 * Generate project name options.
 */
export async function generateNames(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'generateNames'

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    // Map FeasibilityAnalysis to the format expected by buildNamingPrompt
    const feasibilityForNaming = state.feasibility
      ? {
          primaryFunction: state.feasibility.communication?.type ?? 'hardware device',
          matchedComponents: [
            ...(state.feasibility.inputs?.items ?? []),
            ...(state.feasibility.outputs?.items ?? []),
          ],
        }
      : {}
    const userPrompt = buildNamingPrompt(
      state.description,
      feasibilityForNaming,
      state.decisions
    )

    const response = await llm.chat({
      messages: [
        { role: 'system', content: NAMING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // Higher for creativity
      projectId: ctx.projectId,
    })

    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Fallback to generic name
      return {
        generatedNames: [
          { name: 'HardwareProject', style: 'generic', reasoning: 'Fallback name' },
        ],
        history: [
          historyEntry,
          createHistoryItem(nodeId, 'node_exit', { count: 1, fallback: true }),
        ],
      }
    }

    const result = JSON.parse(jsonMatch[0]) as {
      names: Array<{ name: string; style: string; reasoning: string }>
    }

    return {
      generatedNames: result.names ?? [],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', { count: result.names?.length ?? 0 }),
      ],
    }
  } catch (error) {
    return {
      generatedNames: [
        { name: 'HardwareProject', style: 'generic', reasoning: 'Error fallback' },
      ],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
      ],
    }
  }
}

/**
 * Select project name.
 */
export async function selectName(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'selectName'

  // Check if we need user input
  if (requiresUserInput(state.mode, nodeId)) {
    return {
      status: 'awaiting_input',
      userInputRequest: {
        nodeId,
        prompt: 'Choose a name for your project',
        options: state.generatedNames.map((n) => n.name),
        allowCustom: true,
      },
      history: [
        createHistoryItem(nodeId, 'node_enter', { awaitingInput: true }),
      ],
    }
  }

  // In vibe_it mode, AI picks first name
  const name = state.generatedNames[0]?.name ?? 'HardwareProject'
  return {
    selectedName: name,
    status: 'running',
    history: [
      createHistoryItem(nodeId, 'node_enter', { autoMode: true }),
      createHistoryItem(nodeId, 'node_exit', { selected: name }),
    ],
  }
}

/**
 * Process user name selection.
 */
export async function processNameSelection(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'selectName'

  if (!state.userInputResponse) {
    return {
      status: 'error',
      error: 'No name selection provided',
    }
  }

  const selection = Array.isArray(state.userInputResponse.selection)
    ? state.userInputResponse.selection[0]
    : state.userInputResponse.selection

  return {
    selectedName: selection,
    userInputRequest: null,
    userInputResponse: null,
    status: 'running',
    history: [
      createHistoryItem(nodeId, 'user_input', { selected: selection }),
    ],
  }
}

// =============================================================================
// FINALIZATION NODE
// =============================================================================

/**
 * Generate final locked specification.
 */
export async function finalizeSpec(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'finalizeSpec'

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    const selectedBlueprint = state.blueprints[state.selectedBlueprint ?? 0]
    const userPrompt = buildFinalSpecPrompt(
      state.description,
      state.feasibility ?? {},
      state.decisions,
      selectedBlueprint?.prompt ?? 'Standard product design'
    )

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FINAL_SPEC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2, // Low for consistency
      projectId: ctx.projectId,
    })

    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON in finalization response')
    }

    const result = JSON.parse(jsonMatch[0]) as FinalSpec

    // Ensure locked fields
    const finalSpec: FinalSpec = {
      ...result,
      name: state.selectedName ?? result.name,
      locked: true,
      lockedAt: new Date().toISOString(),
    }

    return {
      finalSpec,
      currentStage: 'pcb', // Move to next stage
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', { name: finalSpec.name }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Spec finalization failed',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'error', { error: String(error) }),
      ],
    }
  }
}

// =============================================================================
// ROUTING FUNCTIONS
// =============================================================================

/**
 * Route after feasibility analysis.
 */
export function routeAfterFeasibility(state: OrchestratorState): string {
  if (state.status === 'rejected' || state.status === 'error') {
    return '__end__'
  }
  if (state.openQuestions.length > 0) {
    return 'collectAnswers'
  }
  return 'generateBlueprints'
}

/**
 * Route after collecting answers.
 */
export function routeAfterAnswers(state: OrchestratorState): string {
  if (state.status === 'awaiting_input') {
    return '__interrupt__'
  }
  if (state.openQuestions.length > 0) {
    return 'collectAnswers'
  }
  return 'checkMoreQuestions'
}

/**
 * Route after checking for more questions.
 */
export function routeAfterQuestionCheck(state: OrchestratorState): string {
  if (state.openQuestions.length > 0) {
    return 'collectAnswers'
  }
  return 'generateBlueprints'
}

/**
 * Route after blueprint selection.
 */
export function routeAfterBlueprintSelect(state: OrchestratorState): string {
  if (state.status === 'awaiting_input') {
    return '__interrupt__'
  }
  return 'generateNames'
}

/**
 * Route after name selection.
 */
export function routeAfterNameSelect(state: OrchestratorState): string {
  if (state.status === 'awaiting_input') {
    return '__interrupt__'
  }
  return 'finalizeSpec'
}
