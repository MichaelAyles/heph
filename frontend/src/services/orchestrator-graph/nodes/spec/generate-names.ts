/**
 * Generate Names Node
 *
 * LangGraph node that generates creative project name options.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type GeneratedName,
} from '../../state'
import { NAMING_SYSTEM_PROMPT, buildNamingPrompt } from '../../../../prompts/naming'

/**
 * Default fallback names if generation fails
 */
const FALLBACK_NAMES: GeneratedName[] = [
  { name: 'Project Alpha', style: 'abstract', reasoning: 'Default fallback' },
  { name: 'DevBoard One', style: 'compound', reasoning: 'Default fallback' },
  { name: 'Prototype', style: 'punchy', reasoning: 'Default fallback' },
  { name: 'HardwareKit', style: 'descriptive', reasoning: 'Default fallback' },
]

/**
 * Generate 4 creative project name options.
 *
 * @param state - Current orchestrator state
 * @returns State update with generated names
 */
export async function generateNamesNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { description, feasibility, decisions, projectId } = state

  if (!description) {
    return {
      generatedNames: FALLBACK_NAMES,
      history: [
        createHistoryItem(
          'tool_result',
          'spec',
          'generate_names',
          'Using fallback names (no description)',
          { fallback: true }
        ),
      ],
    }
  }

  try {
    const prompt = buildNamingPrompt(
      description,
      {
        primaryFunction: (feasibility as { primaryFunction?: string } | null)?.primaryFunction,
        matchedComponents: (feasibility as { matchedComponents?: string[] } | null)?.matchedComponents,
      },
      decisions.map((d) => ({ question: d.question, answer: d.answer }))
    )

    const chatRequest = createChatRequest(
      NAMING_SYSTEM_PROMPT,
      prompt,
      { temperature: 0.8, maxTokens: 1024, projectId } // Higher temp for creativity
    )

    const response = await llmAdapter.chat(chatRequest)
    const parsed = llmAdapter.parseJson<{ names: GeneratedName[] }>(response.content)

    if (parsed?.names && parsed.names.length > 0) {
      return {
        generatedNames: parsed.names,
        history: [
          createHistoryItem(
            'tool_result',
            'spec',
            'generate_names',
            `Generated ${parsed.names.length} name options`,
            { nameCount: parsed.names.length, names: parsed.names.map((n) => n.name) }
          ),
        ],
      }
    }

    // Fallback if parsing fails
    return {
      generatedNames: FALLBACK_NAMES,
      history: [
        createHistoryItem(
          'tool_result',
          'spec',
          'generate_names',
          'Using fallback names (parse failed)',
          { fallback: true }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      generatedNames: FALLBACK_NAMES,
      history: [
        createHistoryItem('error', 'spec', 'generate_names', message),
      ],
    }
  }
}

/**
 * Check if names have been generated
 */
export function hasNamesGenerated(state: OrchestratorState): boolean {
  return state.generatedNames.length > 0
}
