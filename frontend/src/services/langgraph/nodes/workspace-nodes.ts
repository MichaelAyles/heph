/**
 * Workspace Stage Nodes
 *
 * LangGraph nodes for the workspace pipeline:
 * - suggestPcbBlocks: AI suggests block placements
 * - confirmPcbBlocks: User confirms block selection
 * - generateEnclosure: Generate OpenSCAD enclosure code
 * - reviewEnclosure: Review generated enclosure
 * - fixEnclosure: Auto-fix enclosure issues
 * - generateFirmware: Generate ESP32 firmware
 * - reviewFirmware: Review generated firmware
 */

import type { RunnableConfig } from '@langchain/core/runnables'
import {
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type ReviewResult,
  createHistoryItem,
  requiresUserInput,
} from '../state'
import { llm } from '../../llm'
import {
  buildPCBSelectionSystemPrompt,
  buildPCBSelectionUserPrompt,
  parsePCBSuggestionResponse,
} from '../../../prompts/pcb-selection'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
} from '../../../prompts/enclosure'
import {
  buildValidationPrompt,
  buildFixPrompt,
  parseValidationResponse,
  OPENSCAD_VALIDATION_PROMPT,
} from '../../../prompts/enclosure-validation'
import {
  FIRMWARE_SYSTEM_PROMPT,
  buildFirmwarePrompt,
  buildFirmwareInputFromSpec,
} from '../../../prompts/firmware'
import { FIRMWARE_REVIEW_PROMPT } from '../../../prompts/review'
import type { PlacedBlock } from '../../../db/schema'

// =============================================================================
// TYPES
// =============================================================================

interface NodeContext {
  projectId: string
  userId: string
}

function getNodeContext(config?: RunnableConfig): NodeContext {
  const configurable = config?.configurable as Record<string, unknown> | undefined
  return {
    projectId: (configurable?.thread_id as string) ?? '',
    userId: (configurable?.userId as string) ?? '',
  }
}

// =============================================================================
// PCB NODES
// =============================================================================

/**
 * AI suggests PCB block placements based on final spec.
 */
export async function suggestPcbBlocks(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'suggestPcbBlocks'

  if (!state.finalSpec) {
    return {
      status: 'error',
      error: 'Final spec required before PCB block selection',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    const systemPrompt = buildPCBSelectionSystemPrompt()
    const userPrompt = buildPCBSelectionUserPrompt({
      projectName: state.finalSpec.name,
      description: state.description,
      finalSpec: state.finalSpec,
      availableBlocks: state.availableBlocks.map((b) => ({
        slug: b.slug,
        name: b.name,
        category: b.category,
        description: b.description,
        gridSize: [b.widthUnits, b.heightUnits] as [number, number],
      })),
    })

    const response = await llm.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      projectId: ctx.projectId,
    })

    const suggestion = parsePCBSuggestionResponse(response.content)

    if (!suggestion) {
      throw new Error('Failed to parse PCB suggestion response')
    }

    const suggestedBlocks = suggestion.blocks.map((b) => ({
      slug: b.slug,
      x: b.gridX,
      y: b.gridY,
      reasoning: b.reason,
    }))

    return {
      suggestedBlocks,
      gridSize: suggestion.boardSize,
      currentStage: 'pcb',
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', {
          blockCount: suggestedBlocks.length,
          boardSize: suggestion.boardSize,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'PCB block suggestion failed',
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

/**
 * User confirms or modifies PCB block selection.
 */
export async function confirmPcbBlocks(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'confirmPcbBlocks'

  // In vibe_it mode, auto-accept
  if (state.mode === 'vibe_it') {
    const placedBlocks: PlacedBlock[] = state.suggestedBlocks.map((s) => ({
      blockId: s.slug,
      blockSlug: s.slug,
      gridX: s.x,
      gridY: s.y,
      rotation: 0,
    }))

    return {
      placedBlocks,
      status: 'running',
      history: [
        createHistoryItem(nodeId, 'node_enter', { autoMode: true }),
        createHistoryItem(nodeId, 'node_exit', { accepted: true }),
      ],
    }
  }

  // In fix_it/design_it, wait for user confirmation
  if (requiresUserInput(state.mode, nodeId)) {
    return {
      status: 'awaiting_input',
      userInputRequest: {
        nodeId,
        prompt: 'Review and confirm the suggested PCB block placement',
        options: ['Accept suggestion', 'Modify placement'],
        allowCustom: true,
      },
      history: [createHistoryItem(nodeId, 'node_enter', { awaitingInput: true })],
    }
  }

  // Fallback: accept suggestion
  const placedBlocks: PlacedBlock[] = state.suggestedBlocks.map((s) => ({
    blockId: s.slug,
    blockSlug: s.slug,
    gridX: s.x,
    gridY: s.y,
    rotation: 0,
  }))

  return {
    placedBlocks,
    status: 'running',
    history: [createHistoryItem(nodeId, 'node_exit', { accepted: true })],
  }
}

/**
 * Process user PCB confirmation response.
 */
export async function processPcbConfirmation(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const nodeId = 'confirmPcbBlocks'

  if (!state.userInputResponse) {
    return {
      status: 'error',
      error: 'No PCB confirmation response provided',
    }
  }

  const selection = Array.isArray(state.userInputResponse.selection)
    ? state.userInputResponse.selection[0]
    : state.userInputResponse.selection

  // If accepted, use suggested blocks
  if (selection.toLowerCase().includes('accept')) {
    const placedBlocks: PlacedBlock[] = state.suggestedBlocks.map((s) => ({
      blockId: s.slug,
      blockSlug: s.slug,
      gridX: s.x,
      gridY: s.y,
      rotation: 0,
    }))

    return {
      placedBlocks,
      userInputRequest: null,
      userInputResponse: null,
      status: 'running',
      history: [createHistoryItem(nodeId, 'user_input', { action: 'accepted' })],
    }
  }

  // User wants to modify - this would require more complex UI interaction
  // For now, accept with a note
  const placedBlocks: PlacedBlock[] = state.suggestedBlocks.map((s) => ({
    blockId: s.slug,
    blockSlug: s.slug,
    gridX: s.x,
    gridY: s.y,
    rotation: 0,
  }))

  return {
    placedBlocks,
    userInputRequest: null,
    userInputResponse: null,
    status: 'running',
    history: [createHistoryItem(nodeId, 'user_input', { action: 'modified', note: selection })],
  }
}

// =============================================================================
// ENCLOSURE NODES
// =============================================================================

/**
 * Generate OpenSCAD enclosure code.
 */
export async function generateEnclosure(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'generateEnclosure'

  if (!state.finalSpec) {
    return {
      status: 'error',
      error: 'Final spec required for enclosure generation',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    // Build enclosure input from spec
    const input = buildEnclosureInputFromSpec(
      state.finalSpec.name,
      state.description,
      {
        boardSize: state.gridSize ?? undefined,
        placedBlocks: state.placedBlocks.map((b) => ({
          blockSlug: b.blockSlug,
          gridX: b.gridX,
          gridY: b.gridY,
        })),
      },
      state.finalSpec
    )
    const userPrompt = buildEnclosurePrompt(input)

    const response = await llm.chat({
      messages: [
        { role: 'system', content: ENCLOSURE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      projectId: ctx.projectId,
    })

    // Extract OpenSCAD code from response
    const codeMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
    const enclosureCode = codeMatch ? codeMatch[1].trim() : response.content

    return {
      enclosureCode,
      currentStage: 'enclosure',
      enclosureIterations: [
        {
          feedback: 'Initial generation',
          openScadCode: enclosureCode,
          timestamp: new Date().toISOString(),
        },
      ],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', {
          codeLength: enclosureCode.length,
        }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Enclosure generation failed',
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

/**
 * Review generated enclosure for issues.
 */
export async function reviewEnclosure(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'reviewEnclosure'

  if (!state.enclosureCode) {
    return {
      status: 'error',
      error: 'No enclosure code to review',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    const hasOled =
      state.finalSpec?.outputs?.some((o) => o.type.toLowerCase().includes('oled')) ?? false
    const hasUsb = state.finalSpec?.power?.source?.toLowerCase().includes('usb') ?? true
    const hasButtons =
      state.finalSpec?.inputs?.some((i) => i.type.toLowerCase().includes('button')) ?? false

    const validationPrompt = buildValidationPrompt(state.enclosureCode, {
      pcbWidth: state.gridSize?.width ?? 50,
      pcbHeight: state.gridSize?.height ?? 50,
      hasOled,
      hasUsb,
      hasButtons,
    })

    const response = await llm.chat({
      messages: [
        { role: 'system', content: OPENSCAD_VALIDATION_PROMPT },
        { role: 'user', content: validationPrompt },
      ],
      temperature: 0.1,
      projectId: ctx.projectId,
    })

    const validationResult = parseValidationResponse(response.content)

    // Calculate score based on issues
    const criticalCount = validationResult.issues.filter((i) => i.severity === 'critical').length
    const warningCount = validationResult.issues.filter((i) => i.severity === 'warning').length
    const score = Math.max(0, 100 - criticalCount * 30 - warningCount * 10)

    const review: ReviewResult = {
      score,
      issues: validationResult.issues.map((i) => `[${i.severity}] ${i.description}`),
      verdict:
        validationResult.isValid && criticalCount === 0
          ? 'accept'
          : criticalCount > 0
            ? 'reject'
            : 'revise',
      suggestions: validationResult.issues.filter((i) => i.fix).map((i) => i.fix),
    }

    return {
      enclosureReview: review,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', {
          score: review.score,
          verdict: review.verdict,
          issueCount: review.issues.length,
        }),
      ],
    }
  } catch (error) {
    return {
      enclosureReview: {
        score: 50,
        issues: ['Review failed: ' + String(error)],
        verdict: 'revise',
        suggestions: [],
      },
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

/**
 * Auto-fix enclosure issues based on review.
 */
export async function fixEnclosure(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'fixEnclosure'

  if (!state.enclosureCode || !state.enclosureReview) {
    return {
      status: 'error',
      error: 'Enclosure code and review required for fixing',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    // Parse issues back to ValidationIssue format for fix prompt
    const issues = state.enclosureReview.issues.map((issueStr) => {
      const match = issueStr.match(/\[(critical|warning|suggestion)\] (.+)/)
      return {
        severity: (match?.[1] ?? 'warning') as 'critical' | 'warning' | 'suggestion',
        category: 'enclosure',
        description: match?.[2] ?? issueStr,
        fix: '',
      }
    })

    const fixPrompt = buildFixPrompt(state.enclosureCode, issues, {
      pcbWidth: state.gridSize?.width ?? 50,
      pcbHeight: state.gridSize?.height ?? 50,
    })

    const response = await llm.chat({
      messages: [
        { role: 'system', content: ENCLOSURE_SYSTEM_PROMPT },
        { role: 'user', content: fixPrompt },
      ],
      temperature: 0.2,
      projectId: ctx.projectId,
    })

    // Extract fixed code
    const codeMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
    const fixedCode = codeMatch ? codeMatch[1].trim() : response.content

    return {
      enclosureCode: fixedCode,
      enclosureReview: null, // Clear review for re-evaluation
      enclosureIterations: [
        {
          feedback: `Fix attempt: ${state.enclosureReview.issues.slice(0, 2).join('; ')}`,
          openScadCode: fixedCode,
          timestamp: new Date().toISOString(),
        },
      ],
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', { codeLength: fixedCode.length }),
      ],
    }
  } catch (error) {
    return {
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

// =============================================================================
// FIRMWARE NODES
// =============================================================================

/**
 * Generate ESP32 firmware code.
 */
export async function generateFirmware(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'generateFirmware'

  if (!state.finalSpec) {
    return {
      status: 'error',
      error: 'Final spec required for firmware generation',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    const input = buildFirmwareInputFromSpec(
      state.finalSpec.name,
      state.description,
      state.finalSpec,
      {
        placedBlocks: state.placedBlocks.map((b) => ({
          blockSlug: b.blockSlug,
          gridX: b.gridX,
          gridY: b.gridY,
          rotation: b.rotation,
        })),
      }
    )
    const userPrompt = buildFirmwarePrompt(input)

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      projectId: ctx.projectId,
    })

    // Parse firmware files from response
    const files = parseFirmwareFiles(response.content)

    return {
      firmwareFiles: files,
      currentStage: 'firmware',
      firmwareIterations: 1,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', { fileCount: files.length }),
      ],
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Firmware generation failed',
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

/**
 * Review generated firmware for issues.
 */
export async function reviewFirmware(
  state: OrchestratorState,
  config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  const ctx = getNodeContext(config)
  const nodeId = 'reviewFirmware'

  if (state.firmwareFiles.length === 0) {
    return {
      status: 'error',
      error: 'No firmware files to review',
    }
  }

  const historyEntry = createHistoryItem(nodeId, 'node_enter')

  try {
    const filesContent = state.firmwareFiles
      .map((f) => `=== ${f.path} ===\n${f.content}`)
      .join('\n\n')

    const response = await llm.chat({
      messages: [
        { role: 'system', content: FIRMWARE_REVIEW_PROMPT },
        {
          role: 'user',
          content: `Review this ESP32-C6 firmware:\n\n${filesContent}\n\nSpec requirements:\n${JSON.stringify(state.finalSpec, null, 2)}`,
        },
      ],
      temperature: 0.1,
      projectId: ctx.projectId,
    })

    // Parse review response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    let review: ReviewResult

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      review = {
        score: parsed.score ?? 70,
        issues: parsed.issues ?? [],
        verdict: parsed.score >= 70 ? 'accept' : parsed.score >= 40 ? 'revise' : 'reject',
        suggestions: parsed.suggestions ?? [],
      }
    } else {
      review = {
        score: 70,
        issues: [],
        verdict: 'accept',
        suggestions: [],
      }
    }

    return {
      firmwareReview: review,
      history: [
        historyEntry,
        createHistoryItem(nodeId, 'llm_call', { model: response.model }),
        createHistoryItem(nodeId, 'node_exit', {
          score: review.score,
          verdict: review.verdict,
        }),
      ],
    }
  } catch (error) {
    return {
      firmwareReview: {
        score: 50,
        issues: ['Review failed: ' + String(error)],
        verdict: 'revise',
        suggestions: [],
      },
      history: [historyEntry, createHistoryItem(nodeId, 'error', { error: String(error) })],
    }
  }
}

// =============================================================================
// COMPLETION NODE
// =============================================================================

/**
 * Mark workflow as complete.
 */
export async function markComplete(
  state: OrchestratorState,
  _config?: RunnableConfig
): Promise<OrchestratorStateUpdate> {
  return {
    status: 'complete',
    currentStage: 'export',
    completedAt: new Date().toISOString(),
    history: [
      createHistoryItem('markComplete', 'node_enter'),
      createHistoryItem('markComplete', 'node_exit', {
        stage: 'export',
        iterationCount: state.iterationCount,
      }),
    ],
  }
}

// =============================================================================
// ROUTING FUNCTIONS
// =============================================================================

/**
 * Route after PCB block confirmation.
 */
export function routeAfterPcbConfirm(state: OrchestratorState): string {
  if (state.status === 'awaiting_input') {
    return '__interrupt__'
  }
  if (state.placedBlocks.length === 0) {
    return 'suggestPcbBlocks' // Retry
  }
  return 'generateEnclosure'
}

/**
 * Route after enclosure review.
 */
export function routeAfterEnclosureReview(state: OrchestratorState): string {
  if (!state.enclosureReview) {
    return 'reviewEnclosure' // Need to review
  }

  // Check iteration limit
  const iterationCount = state.enclosureIterations.length
  if (iterationCount >= 3) {
    return 'generateFirmware' // Max iterations, proceed anyway
  }

  if (state.enclosureReview.verdict === 'accept') {
    return 'generateFirmware'
  }

  return 'fixEnclosure'
}

/**
 * Route after firmware review.
 */
export function routeAfterFirmwareReview(state: OrchestratorState): string {
  if (!state.firmwareReview) {
    return 'reviewFirmware'
  }

  // Check iteration limit
  if (state.firmwareIterations >= 3) {
    return 'markComplete'
  }

  if (state.firmwareReview.verdict === 'accept') {
    return 'markComplete'
  }

  return 'generateFirmware' // Retry
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parse firmware files from LLM response.
 */
function parseFirmwareFiles(content: string): Array<{
  path: string
  content: string
  language: 'cpp' | 'c' | 'h' | 'json'
}> {
  const files: Array<{
    path: string
    content: string
    language: 'cpp' | 'c' | 'h' | 'json'
  }> = []

  // Look for file markers like "=== filename ===" or "// filename"
  const filePattern =
    /(?:===\s*([^\s=]+)\s*===|\/\/\s*File:\s*([^\n]+))\n([\s\S]*?)(?=(?:===|\/\/\s*File:)|$)/g
  let match

  while ((match = filePattern.exec(content)) !== null) {
    const filename = (match[1] || match[2]).trim()
    const fileContent = match[3].trim()

    // Determine language from extension
    let language: 'cpp' | 'c' | 'h' | 'json' = 'cpp'
    if (filename.endsWith('.c')) language = 'c'
    else if (filename.endsWith('.h')) language = 'h'
    else if (filename.endsWith('.json')) language = 'json'

    files.push({
      path: filename,
      content: fileContent,
      language,
    })
  }

  // If no files found, treat entire content as main.cpp
  if (files.length === 0) {
    const codeMatch = content.match(/```(?:cpp|c\+\+)?\s*([\s\S]*?)```/)
    files.push({
      path: 'src/main.cpp',
      content: codeMatch ? codeMatch[1].trim() : content,
      language: 'cpp',
    })
  }

  return files
}
