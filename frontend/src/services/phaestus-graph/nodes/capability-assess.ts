/**
 * Capability Assessment Node
 *
 * LLM call to assess whether the user's project can be built
 * with available components and capabilities.
 */

import type { PhaestusState, BlockSummary } from '../state'
import { setAssessment, setRoute, setError, setDebugLlm } from '../state'
import type { CapabilityAssessment, SystemPrompt } from '../../../db/schema'
import type { D1Database } from '../types'

// =============================================================================
// Types
// =============================================================================

export interface LLMClient {
  chat: (params: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    temperature?: number
    projectId?: string
  }) => Promise<{ content: string }>
}

// =============================================================================
// Assessment Node
// =============================================================================

/**
 * Build the prompt for capability assessment
 */
export function buildAssessmentPrompt(
  userRequest: string,
  availableBlocks: BlockSummary[],
  systemPrompt: SystemPrompt
): string {
  const blocksContext = availableBlocks.length > 0
    ? `\n\nAvailable Hardware Blocks:\n${availableBlocks
        .map((b) => `- ${b.name} (${b.category}): ${b.description}`)
        .join('\n')}`
    : ''

  const designConstraints = systemPrompt.designConstraints
    ? `\n\n${systemPrompt.designConstraints}`
    : ''

  return `${systemPrompt.capabilityAssessmentBase}${blocksContext}${designConstraints}

User's Project Idea:
"${userRequest}"

Assess this project and respond with JSON.`
}

/**
 * Parse LLM response into CapabilityAssessment
 */
export function parseAssessmentResponse(content: string): CapabilityAssessment | null {
  try {
    // Extract JSON from response (may have markdown code fences)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (typeof parsed.canBuild !== 'boolean') return null
    if (typeof parsed.confidence !== 'number') return null
    if (typeof parsed.reasoning !== 'string') return null

    return {
      canBuild: parsed.canBuild,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
      missingCapabilities: Array.isArray(parsed.missingCapabilities)
        ? parsed.missingCapabilities
        : [],
      suggestedAlternatives: Array.isArray(parsed.suggestedAlternatives)
        ? parsed.suggestedAlternatives
        : [],
    }
  } catch {
    return null
  }
}

/**
 * Determine route based on assessment
 */
export function determineRoute(assessment: CapabilityAssessment): 'REJECT' | 'CLARIFY' | 'PROCEED' {
  // Definite rejection
  if (!assessment.canBuild && assessment.confidence > 0.8) {
    return 'REJECT'
  }

  // Need clarification
  if (assessment.missingCapabilities.length > 0 || assessment.confidence < 0.7) {
    return 'CLARIFY'
  }

  // Good to proceed
  return 'PROCEED'
}

/**
 * Capability assessment node - LLM call to assess project
 */
export async function capabilityAssessNode(
  state: PhaestusState,
  llm: LLMClient,
  systemPrompt: SystemPrompt
): Promise<PhaestusState> {
  // Skip if already assessed or already routed
  if (state.capabilityAssessment || state.route === 'REJECT') {
    return state
  }

  try {
    const prompt = buildAssessmentPrompt(
      state.userRequest,
      state.availableBlocks,
      systemPrompt
    )

    const response = await llm.chat({
      messages: [
        { role: 'system', content: systemPrompt.capabilityAssessmentBase },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      projectId: state.projectId ?? undefined,
    })

    // Track LLM call in debug
    let newState = setDebugLlm(state, prompt, response.content)

    const assessment = parseAssessmentResponse(response.content)

    if (!assessment) {
      return setError(newState, 'Failed to parse capability assessment')
    }

    // Determine route based on assessment
    const route = determineRoute(assessment)

    // Update state
    newState = setAssessment(newState, assessment)
    newState = setRoute(newState, route)

    return newState
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return setError(state, `Assessment failed: ${errorMessage}`)
  }
}

/**
 * For server-side use: fetch system prompt from database
 */
export async function getActiveSystemPrompt(db: D1Database): Promise<SystemPrompt | null> {
  const stmt = db.prepare(
    'SELECT * FROM system_prompts WHERE is_active = 1 ORDER BY version DESC LIMIT 1'
  )
  const result = await stmt.first<{
    id: number
    name: string
    description: string | null
    capability_assessment_base: string
    design_constraints: string | null
    cad_capability: string | null
    firmware_capability: string | null
    is_active: number
    version: number
    created_at: string
    updated_at: string
  }>()

  if (!result) return null

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    capabilityAssessmentBase: result.capability_assessment_base,
    designConstraints: result.design_constraints,
    cadCapability: result.cad_capability,
    firmwareCapability: result.firmware_capability,
    isActive: result.is_active === 1,
    version: result.version,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  }
}
