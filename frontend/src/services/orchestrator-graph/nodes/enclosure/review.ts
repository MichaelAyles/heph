/**
 * Review Enclosure Node
 *
 * LangGraph node that reviews the generated enclosure using an analyst LLM.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type ReviewResult,
} from '../../state'
import { ENCLOSURE_REVIEW_PROMPT } from '../../../../prompts/review'

/**
 * Review the generated enclosure code against the spec.
 *
 * @param state - Current orchestrator state
 * @returns State update with review result
 */
export async function reviewEnclosureNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { enclosure, finalSpec, pcb, projectId } = state

  if (!enclosure?.openScadCode) {
    return {
      error: 'No enclosure code to review',
      history: [
        createHistoryItem('error', 'enclosure', 'review_enclosure', 'No enclosure code'),
      ],
    }
  }

  if (!finalSpec) {
    return {
      error: 'No specification to review against',
      history: [
        createHistoryItem('error', 'enclosure', 'review_enclosure', 'No specification'),
      ],
    }
  }

  try {
    // Build context for the analyst
    const reviewContext = `## Project Specification
Name: ${finalSpec.name}
Summary: ${finalSpec.summary}

## Inputs
${JSON.stringify(finalSpec.inputs, null, 2)}

## Outputs
${JSON.stringify(finalSpec.outputs, null, 2)}

## Power
${JSON.stringify(finalSpec.power, null, 2)}

## Enclosure Requirements
${JSON.stringify(finalSpec.enclosure, null, 2)}

## PCB Dimensions
${JSON.stringify(pcb?.boardSize || {}, null, 2)}

## OpenSCAD Code to Review
\`\`\`openscad
${enclosure.openScadCode}
\`\`\`
`

    const chatRequest = createChatRequest(
      ENCLOSURE_REVIEW_PROMPT,
      reviewContext,
      { temperature: 0.2, maxTokens: 2048, projectId } // Lower temp for consistency
    )

    const response = await llmAdapter.chat(chatRequest)
    const review = llmAdapter.parseJson<ReviewResult>(response.content)

    if (review) {
      // Ensure required fields have defaults
      const normalizedReview: ReviewResult = {
        score: review.score || 0,
        verdict: review.verdict || 'revise',
        issues: review.issues || [],
        positives: review.positives || [],
        summary: review.summary || 'Review completed',
      }

      return {
        enclosureReview: normalizedReview,
        history: [
          createHistoryItem(
            'tool_result',
            'enclosure',
            'review_enclosure',
            `Review score: ${normalizedReview.score}, verdict: ${normalizedReview.verdict}`,
            {
              score: normalizedReview.score,
              verdict: normalizedReview.verdict,
              issueCount: normalizedReview.issues.length,
            }
          ),
        ],
      }
    }

    // Fallback if parsing fails
    return {
      enclosureReview: {
        score: 70,
        verdict: 'revise',
        issues: [{ severity: 'warning', description: 'Could not parse review response', suggestion: 'Re-run review' }],
        positives: [],
        summary: response.content.slice(0, 200),
      },
      history: [
        createHistoryItem(
          'tool_result',
          'enclosure',
          'review_enclosure',
          'Review completed (parse fallback)',
          { parseError: true }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Enclosure review failed: ${message}`,
      history: [
        createHistoryItem('error', 'enclosure', 'review_enclosure', message),
      ],
    }
  }
}

/**
 * Check if enclosure has been reviewed
 */
export function hasEnclosureReview(state: OrchestratorState): boolean {
  return state.enclosureReview !== null
}
