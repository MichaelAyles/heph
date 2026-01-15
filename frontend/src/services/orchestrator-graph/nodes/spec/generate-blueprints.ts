/**
 * Generate Blueprints Node
 *
 * LangGraph node that generates 4 product render variations
 * for user selection.
 */

import { createHistoryItem, type OrchestratorState, type OrchestratorStateUpdate } from '../../state'
import type { Blueprint } from '@/db/schema'

/**
 * Default style hints for blueprint generation
 */
const DEFAULT_STYLE_HINTS = [
  'minimalist modern design with clean lines',
  'industrial rugged design with exposed components',
  'consumer electronics polished design',
  'maker/DIY aesthetic with visible electronics',
]

/**
 * Generate 4 blueprint variations in parallel.
 *
 * @param state - Current orchestrator state
 * @returns State update with generated blueprints
 */
export async function generateBlueprintsNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { description, decisions, feasibility } = state
  const styleHints = DEFAULT_STYLE_HINTS

  if (!description) {
    return {
      error: 'No description available for blueprint generation',
      history: [
        createHistoryItem('error', 'spec', 'generate_blueprints', 'No description available'),
      ],
    }
  }

  // Build context-aware prompts
  const contextDetails = buildContextDetails(description, decisions, feasibility)
  const prompts = styleHints.map((style) => `${contextDetails} - ${style} style`)

  try {
    // Generate images in parallel
    const results = await Promise.allSettled(
      prompts.map(async (prompt) => {
        const response = await fetch('/api/llm/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        })

        if (!response.ok) {
          throw new Error(`Image generation failed: ${response.status}`)
        }

        const data = await response.json()
        if (!data.imageUrl) {
          throw new Error('No image URL in response')
        }

        return { url: data.imageUrl, prompt }
      })
    )

    // Collect successful results
    const blueprints: Blueprint[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        blueprints.push(result.value)
      }
    }

    if (blueprints.length === 0) {
      return {
        error: 'All image generations failed',
        history: [
          createHistoryItem('error', 'spec', 'generate_blueprints', 'All image generations failed'),
        ],
      }
    }

    return {
      blueprints,
      history: [
        createHistoryItem(
          'tool_result',
          'spec',
          'generate_blueprints',
          `Generated ${blueprints.length} blueprints`,
          { blueprintCount: blueprints.length }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Blueprint generation failed: ${message}`,
      history: [
        createHistoryItem('error', 'spec', 'generate_blueprints', message),
      ],
    }
  }
}

/**
 * Build context details for image prompt from current state
 */
function buildContextDetails(
  description: string,
  decisions: OrchestratorState['decisions'],
  feasibility: OrchestratorState['feasibility']
): string {
  const parts = [description]

  // Add relevant decisions
  if (decisions && decisions.length > 0) {
    const relevantDecisions = decisions
      .filter((d) => d.question.toLowerCase().includes('display') || d.question.toLowerCase().includes('led'))
      .map((d) => d.answer)
    if (relevantDecisions.length > 0) {
      parts.push(`with ${relevantDecisions.join(', ')}`)
    }
  }

  // Add power source if known
  if (feasibility?.power?.options?.[0]) {
    parts.push(`powered by ${feasibility.power.options[0]}`)
  }

  return parts.join(' ')
}

/**
 * Check if blueprints have been generated
 */
export function hasBlueprintsGenerated(state: OrchestratorState): boolean {
  return state.blueprints.length > 0
}
