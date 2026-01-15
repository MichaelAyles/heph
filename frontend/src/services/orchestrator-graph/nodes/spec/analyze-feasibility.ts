/**
 * Analyze Feasibility Node
 *
 * LangGraph node that analyzes a project description for feasibility.
 * Determines if the project can be built with available components.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import { createHistoryItem, type OrchestratorState, type OrchestratorStateUpdate } from '../../state'
import { buildFeasibilityPrompt, FEASIBILITY_SYSTEM_PROMPT } from '@/prompts/feasibility'
import type { FeasibilityAnalysis, OpenQuestion } from '@/db/schema'

/**
 * Analyze the feasibility of a project description.
 *
 * This is the entry point for the spec stage. It:
 * 1. Calls the LLM to analyze the description
 * 2. Determines if the project is manufacturable
 * 3. Extracts open questions that need answers
 *
 * @param state - Current orchestrator state
 * @returns State update with feasibility analysis
 */
export async function analyzeFeasibilityNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { description, projectId } = state

  if (!description) {
    return {
      error: 'No description provided for feasibility analysis',
      history: [
        createHistoryItem('error', 'spec', 'analyze_feasibility', 'No description provided'),
      ],
    }
  }

  try {
    const chatRequest = createChatRequest(
      FEASIBILITY_SYSTEM_PROMPT,
      buildFeasibilityPrompt(description),
      { temperature: 0.3, projectId }
    )

    const response = await llmAdapter.chat(chatRequest)
    const feasibility = llmAdapter.parseJson<FeasibilityAnalysis>(response.content)

    if (!feasibility) {
      return {
        error: 'Failed to parse feasibility response from LLM',
        history: [
          createHistoryItem('error', 'spec', 'analyze_feasibility', 'Failed to parse JSON response'),
        ],
      }
    }

    // Check for hard rejection
    if (!feasibility.manufacturable) {
      return {
        feasibility,
        openQuestions: [],
        error: feasibility.rejectionReason || 'Project not manufacturable',
        history: [
          createHistoryItem(
            'tool_result',
            'spec',
            'analyze_feasibility',
            `Rejected: ${feasibility.rejectionReason}`,
            { score: feasibility.overallScore, manufacturable: false }
          ),
        ],
      }
    }

    // openQuestions comes from the LLM response alongside feasibility
    // The LLM returns them together, but we store them separately in state
    const responseWithQuestions = llmAdapter.parseJson<FeasibilityAnalysis & { openQuestions?: OpenQuestion[] }>(response.content)
    const openQuestions = responseWithQuestions?.openQuestions || []

    return {
      feasibility,
      openQuestions,
      history: [
        createHistoryItem(
          'tool_result',
          'spec',
          'analyze_feasibility',
          `Feasibility score: ${feasibility.overallScore}`,
          {
            score: feasibility.overallScore,
            manufacturable: true,
            openQuestionCount: openQuestions.length,
          }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Feasibility analysis failed: ${message}`,
      history: [
        createHistoryItem('error', 'spec', 'analyze_feasibility', message),
      ],
    }
  }
}

/**
 * Check if feasibility was rejected (for conditional routing)
 */
export function isFeasibilityRejected(state: OrchestratorState): boolean {
  return state.feasibility !== null && !state.feasibility.manufacturable
}

/**
 * Check if there are open questions to answer
 */
export function hasOpenQuestions(state: OrchestratorState): boolean {
  return state.openQuestions.length > 0
}
