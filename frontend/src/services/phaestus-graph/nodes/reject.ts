/**
 * Reject Node
 *
 * Generate a helpful rejection explanation when the project
 * cannot be built with available capabilities.
 */

import type { PhaestusState } from '../state'
import { addMessage } from '../state'

/**
 * Generate rejection message based on assessment
 */
export function generateRejectionMessage(state: PhaestusState): string {
  const assessment = state.capabilityAssessment

  if (!assessment) {
    return `I'm unable to assess this project at the moment. Please try again or rephrase your request.`
  }

  const parts: string[] = []

  // Main explanation
  parts.push(`I've analyzed your project idea, and unfortunately, I don't think we can build this with the current PHAESTUS platform.`)
  parts.push('')
  parts.push(`**Why:** ${assessment.reasoning}`)

  // Missing capabilities
  if (assessment.missingCapabilities.length > 0) {
    parts.push('')
    parts.push(`**What's missing:**`)
    assessment.missingCapabilities.forEach((cap) => {
      parts.push(`- ${cap}`)
    })
  }

  // Suggested alternatives
  if (assessment.suggestedAlternatives.length > 0) {
    parts.push('')
    parts.push(`**Alternative approaches you might consider:**`)
    assessment.suggestedAlternatives.forEach((alt) => {
      parts.push(`- ${alt}`)
    })
  }

  // Invitation to continue
  parts.push('')
  parts.push(`Would you like to try a modified version of your idea? I'm happy to help you find an approach that works within our capabilities.`)

  return parts.join('\n')
}

/**
 * Reject node - generate rejection explanation
 */
export function rejectNode(state: PhaestusState): PhaestusState {
  const message = generateRejectionMessage(state)
  return addMessage(state, 'assistant', message)
}
