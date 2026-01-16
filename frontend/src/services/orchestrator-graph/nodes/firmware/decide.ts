/**
 * Decide Firmware Node
 *
 * LangGraph node that decides whether to accept, revise, or escalate
 * based on the review score. Uses Command API for routing.
 */

import { Command } from '@langchain/langgraph'
import {
  createHistoryItem,
  hasExceededMaxIterations,
  createMaxIterationsError,
  MAX_LOOP_ATTEMPTS,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/** Minimum score to accept firmware */
const ACCEPT_THRESHOLD = 85

/**
 * Decide next action based on firmware review.
 *
 * Decision logic:
 * - Max iterations exceeded: Stop with error
 * - score >= 85: Accept and render
 * - attempts >= MAX_LOOP_ATTEMPTS: Request user input (can't auto-improve further)
 * - otherwise: Regenerate with feedback
 *
 * @param state - Current orchestrator state
 * @returns Command with goto routing
 */
export function decideFirmwareNode(
  state: OrchestratorState
): Command {
  // Safety check for runaway loops
  if (hasExceededMaxIterations(state)) {
    return new Command({
      update: createMaxIterationsError(state),
      goto: '__end__',
    })
  }

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
        firmwareFeedback: null, // Clear feedback on accept
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
  if (firmwareAttempts >= MAX_LOOP_ATTEMPTS) {
    return new Command({
      update: {
        history: [
          createHistoryItem(
            'progress',
            'firmware',
            'decide_firmware',
            `Max attempts (${MAX_LOOP_ATTEMPTS}) reached, requesting user input`,
            { score, attempts: firmwareAttempts, decision: 'escalate' }
          ),
        ],
      } as OrchestratorStateUpdate,
      goto: 'requestUserInput',
    })
  }

  // Otherwise, regenerate with feedback (store in proper state field)
  const feedback = issues
    .map((issue) => `- ${issue.description}${issue.suggestion ? `: ${issue.suggestion}` : ''}`)
    .join('\n')

  return new Command({
    update: {
      firmwareReview: null, // Clear review for fresh attempt
      firmwareFeedback: feedback, // Store feedback in proper state field
      history: [
        createHistoryItem(
          'progress',
          'firmware',
          'decide_firmware',
          `Regenerating firmware (score: ${score}, attempt ${firmwareAttempts + 1})`,
          { score, attempts: firmwareAttempts, decision: 'revise', issueCount: issues.length }
        ),
      ],
    } as OrchestratorStateUpdate,
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
  return state.firmwareAttempts >= MAX_LOOP_ATTEMPTS
}
