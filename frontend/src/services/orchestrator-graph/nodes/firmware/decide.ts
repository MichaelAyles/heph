/**
 * Decide Firmware Node
 *
 * LangGraph node that decides whether to accept, revise, or escalate
 * based on the review score. Uses Command API for routing.
 */

import { Command } from '@langchain/langgraph'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/** Minimum score to accept firmware */
const ACCEPT_THRESHOLD = 85

/** Maximum number of generation attempts */
const MAX_ATTEMPTS = 3

/**
 * Decide next action based on firmware review.
 *
 * Decision logic:
 * - score >= 85: Accept and render
 * - attempts >= 3: Request user input (can't auto-improve further)
 * - otherwise: Regenerate with feedback
 *
 * @param state - Current orchestrator state
 * @returns Command with goto routing
 */
export function decideFirmwareNode(
  state: OrchestratorState
): Command {
  const { firmwareReview, firmwareAttempts } = state

  if (!firmwareReview) {
    // No review yet, shouldn't happen but route to review
    return new Command({
      update: {
        history: [
          createHistoryItem('progress', 'firmware', 'decide_firmware', 'No review found, routing to review'),
        ],
      } as OrchestratorStateUpdate,
      goto: 'reviewFirmware',
    })
  }

  const { score, verdict, issues } = firmwareReview

  // Accept if score meets threshold and verdict is accept
  if (score >= ACCEPT_THRESHOLD || verdict === 'accept') {
    return new Command({
      update: {
        history: [
          createHistoryItem(
            'progress',
            'firmware',
            'decide_firmware',
            `Firmware accepted (score: ${score})`,
            { score, verdict, decision: 'accept' }
          ),
        ],
      } as OrchestratorStateUpdate,
      goto: 'acceptFirmware',
    })
  }

  // If max attempts reached, request user input
  if (firmwareAttempts >= MAX_ATTEMPTS) {
    return new Command({
      update: {
        history: [
          createHistoryItem(
            'progress',
            'firmware',
            'decide_firmware',
            `Max attempts (${MAX_ATTEMPTS}) reached, requesting user input`,
            { score, attempts: firmwareAttempts, decision: 'escalate' }
          ),
        ],
      } as OrchestratorStateUpdate,
      goto: 'requestUserInput',
    })
  }

  // Otherwise, regenerate with feedback
  const feedback = issues
    .map((issue) => `- ${issue.description}${issue.suggestion ? `: ${issue.suggestion}` : ''}`)
    .join('\n')

  return new Command({
    update: {
      firmwareReview: null, // Clear review for fresh attempt
      history: [
        createHistoryItem(
          'progress',
          'firmware',
          'decide_firmware',
          `Regenerating firmware (score: ${score}, attempt ${firmwareAttempts + 1})`,
          { score, attempts: firmwareAttempts, decision: 'revise', issueCount: issues.length }
        ),
      ],
      // Store feedback for next generation
      _firmwareFeedback: feedback,
    } as OrchestratorStateUpdate & { _firmwareFeedback: string },
    goto: 'generateFirmware',
  })
}

/**
 * Check if firmware should be accepted based on review
 */
export function shouldAcceptFirmware(state: OrchestratorState): boolean {
  const { firmwareReview } = state
  if (!firmwareReview) return false
  return firmwareReview.score >= ACCEPT_THRESHOLD || firmwareReview.verdict === 'accept'
}

/**
 * Check if firmware attempts are exhausted
 */
export function firmwareAttemptsExhausted(state: OrchestratorState): boolean {
  return state.firmwareAttempts >= MAX_ATTEMPTS
}
