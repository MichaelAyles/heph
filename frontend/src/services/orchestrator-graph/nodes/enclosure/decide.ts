/**
 * Decide Enclosure Node
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

/** Minimum score to accept enclosure */
const ACCEPT_THRESHOLD = 85

/**
 * Decide next action based on enclosure review.
 *
 * Decision logic:
 * - Max iterations exceeded: Stop with error
 * - score >= 85: Accept and move to render
 * - attempts >= MAX_LOOP_ATTEMPTS: Request user input (can't auto-improve further)
 * - otherwise: Regenerate with feedback
 *
 * @param state - Current orchestrator state
 * @returns Command with goto routing
 */
export function decideEnclosureNode(
  state: OrchestratorState
): Command {
  // Safety check for runaway loops
  if (hasExceededMaxIterations(state)) {
    return new Command({
      update: createMaxIterationsError(state),
      goto: '__end__',
    })
  }

  const { enclosureReview, enclosureAttempts } = state

  if (!enclosureReview) {
    // No review yet, shouldn't happen but route to review
    return new Command({
      update: {
        history: [
          createHistoryItem('progress', 'enclosure', 'decide_enclosure', 'No review found, routing to review'),
        ],
      } as OrchestratorStateUpdate,
      goto: 'reviewEnclosure',
    })
  }

  const { score, verdict, issues } = enclosureReview

  // Accept if score meets threshold and verdict is accept
  if (score >= ACCEPT_THRESHOLD || verdict === 'accept') {
    return new Command({
      update: {
        enclosureFeedback: null, // Clear feedback on accept
        history: [
          createHistoryItem(
            'progress',
            'enclosure',
            'decide_enclosure',
            `Enclosure accepted (score: ${score})`,
            { score, verdict, decision: 'accept' }
          ),
        ],
      } as OrchestratorStateUpdate,
      goto: 'acceptEnclosure',
    })
  }

  // If max attempts reached, request user input
  if (enclosureAttempts >= MAX_LOOP_ATTEMPTS) {
    return new Command({
      update: {
        history: [
          createHistoryItem(
            'progress',
            'enclosure',
            'decide_enclosure',
            `Max attempts (${MAX_LOOP_ATTEMPTS}) reached, requesting user input`,
            { score, attempts: enclosureAttempts, decision: 'escalate' }
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
      enclosureReview: null, // Clear review for fresh attempt
      enclosureFeedback: feedback, // Store feedback in proper state field
      history: [
        createHistoryItem(
          'progress',
          'enclosure',
          'decide_enclosure',
          `Regenerating enclosure (score: ${score}, attempt ${enclosureAttempts + 1})`,
          { score, attempts: enclosureAttempts, decision: 'revise', issueCount: issues.length }
        ),
      ],
    } as OrchestratorStateUpdate,
    goto: 'generateEnclosure',
  })
}

/**
 * Check if enclosure should be accepted based on review
 */
export function shouldAcceptEnclosure(state: OrchestratorState): boolean {
  const { enclosureReview } = state
  if (!enclosureReview) return false
  return enclosureReview.score >= ACCEPT_THRESHOLD || enclosureReview.verdict === 'accept'
}

/**
 * Check if enclosure attempts are exhausted
 */
export function enclosureAttemptsExhausted(state: OrchestratorState): boolean {
  return state.enclosureAttempts >= MAX_LOOP_ATTEMPTS
}
