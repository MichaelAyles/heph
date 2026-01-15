/**
 * Review Firmware Node
 *
 * LangGraph node that reviews the generated firmware using an analyst LLM.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type ReviewResult,
} from '../../state'
import { FIRMWARE_REVIEW_PROMPT } from '@/prompts/review'

/**
 * Review the generated firmware code against the spec.
 *
 * @param state - Current orchestrator state
 * @returns State update with review result
 */
export async function reviewFirmwareNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { firmware, finalSpec, pcb, projectId } = state

  if (!firmware?.files || firmware.files.length === 0) {
    return {
      error: 'No firmware code to review',
      history: [
        createHistoryItem('error', 'firmware', 'review_firmware', 'No firmware code'),
      ],
    }
  }

  if (!finalSpec) {
    return {
      error: 'No specification to review against',
      history: [
        createHistoryItem('error', 'firmware', 'review_firmware', 'No specification'),
      ],
    }
  }

  try {
    // Build context for the analyst
    const filesContent = firmware.files
      .map((f) => `### ${f.path}\n\`\`\`${f.language || 'cpp'}\n${f.content}\n\`\`\``)
      .join('\n\n')

    const reviewContext = `## Project Specification
Name: ${finalSpec.name}
Summary: ${finalSpec.summary}

## Inputs
${JSON.stringify(finalSpec.inputs, null, 2)}

## Outputs
${JSON.stringify(finalSpec.outputs, null, 2)}

## Power
${JSON.stringify(finalSpec.power, null, 2)}

## Communication
${JSON.stringify(finalSpec.communication, null, 2)}

## PCB Pin Assignments
${JSON.stringify(pcb?.netList || {}, null, 2)}

## Firmware Files to Review
${filesContent}
`

    const chatRequest = createChatRequest(
      FIRMWARE_REVIEW_PROMPT,
      reviewContext,
      { temperature: 0.2, maxTokens: 2048, projectId }
    )

    const response = await llmAdapter.chat(chatRequest)
    const review = llmAdapter.parseJson<ReviewResult & { missingFeatures?: string[] }>(response.content)

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
        firmwareReview: normalizedReview,
        history: [
          createHistoryItem(
            'tool_result',
            'firmware',
            'review_firmware',
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
      firmwareReview: {
        score: 70,
        verdict: 'revise',
        issues: [{ severity: 'warning', description: 'Could not parse review response', suggestion: 'Re-run review' }],
        positives: [],
        summary: response.content.slice(0, 200),
      },
      history: [
        createHistoryItem(
          'tool_result',
          'firmware',
          'review_firmware',
          'Review completed (parse fallback)',
          { parseError: true }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Firmware review failed: ${message}`,
      history: [
        createHistoryItem('error', 'firmware', 'review_firmware', message),
      ],
    }
  }
}

/**
 * Check if firmware has been reviewed
 */
export function hasFirmwareReview(state: OrchestratorState): boolean {
  return state.firmwareReview !== null
}
