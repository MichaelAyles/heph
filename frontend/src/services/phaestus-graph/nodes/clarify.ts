/**
 * Clarify Node
 *
 * Generate clarifying questions when we need more information
 * to properly assess the project's feasibility.
 */

import type { PhaestusState } from '../state'
import { addMessage } from '../state'

/**
 * Generate clarifying questions based on assessment
 */
export function generateClarifyingQuestions(state: PhaestusState): string {
  const assessment = state.capabilityAssessment

  if (!assessment) {
    return `I'd like to learn more about your project idea. Could you provide more details about:
- What problem are you trying to solve?
- What inputs/sensors do you need?
- What outputs/actuators do you need?
- How should it communicate (WiFi, Bluetooth, etc.)?
- What power source do you envision (battery, USB, wall power)?`
  }

  const parts: string[] = []

  // Acknowledge what we understood
  parts.push(`I've got a good sense of what you're looking to build. My confidence level is ${Math.round(assessment.confidence * 100)}%.`)
  parts.push('')

  // Ask for clarification on missing capabilities
  if (assessment.missingCapabilities.length > 0) {
    parts.push(`I'd like to clarify a few things to make sure we can build this:`)
    parts.push('')

    assessment.missingCapabilities.forEach((cap, i) => {
      parts.push(`${i + 1}. Regarding "${cap}" - could you tell me more about what you need here? There might be an alternative approach that works.`)
    })
  } else {
    // General questions if confidence is low
    parts.push(`To proceed, I need a bit more detail:`)
    parts.push('')
    parts.push(`1. What sensors or inputs will the device need?`)
    parts.push(`2. What outputs (LEDs, displays, motors, etc.) do you need?`)
    parts.push(`3. How should it communicate with other devices or the cloud?`)
    parts.push(`4. What's your power budget (battery life, always-on, etc.)?`)
  }

  parts.push('')
  parts.push(`Please share what you can, and I'll update my assessment.`)

  return parts.join('\n')
}

/**
 * Clarify node - generate clarifying questions
 */
export function clarifyNode(state: PhaestusState): PhaestusState {
  const message = generateClarifyingQuestions(state)
  return addMessage(state, 'assistant', message)
}
