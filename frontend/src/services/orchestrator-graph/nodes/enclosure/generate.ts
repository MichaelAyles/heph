/**
 * Generate Enclosure Node
 *
 * LangGraph node that generates OpenSCAD code for the enclosure.
 */

import { llmAdapter, createChatRequest } from '../../llm-wrapper'
import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'
import {
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
  ENCLOSURE_SYSTEM_PROMPT,
} from '../../../../prompts/enclosure'
import type { EnclosureArtifacts } from '../../../../db/schema'

/**
 * Generate OpenSCAD code for the enclosure.
 *
 * Reads feedback from state.enclosureFeedback if this is a revision attempt.
 *
 * @param state - Current orchestrator state
 * @param style - Enclosure style (box, rounded_box, handheld, wall_mount, desktop)
 * @param wallThickness - Wall thickness in mm (default: 2)
 * @param cornerRadius - Corner radius in mm (default: 3)
 * @returns State update with enclosure artifacts
 */
export async function generateEnclosureNode(
  state: OrchestratorState,
  style?: string,
  wallThickness?: number,
  cornerRadius?: number
): Promise<OrchestratorStateUpdate> {
  const { finalSpec, pcb, projectId, enclosureAttempts, enclosureFeedback } = state

  if (!finalSpec || !pcb) {
    return {
      error: 'Spec and PCB must be complete before enclosure generation',
      history: [
        createHistoryItem('error', 'enclosure', 'generate_enclosure', 'Missing spec or PCB'),
      ],
    }
  }

  try {
    const input = buildEnclosureInputFromSpec(
      finalSpec.name,
      finalSpec.summary,
      pcb,
      finalSpec
    )

    // Override style parameters if provided
    if (style) {
      input.style.type = style as 'box' | 'rounded_box' | 'handheld' | 'wall_mount' | 'desktop'
    }
    if (wallThickness) input.style.wallThickness = wallThickness
    if (cornerRadius) input.style.cornerRadius = cornerRadius

    // Build prompt, including feedback if this is a revision
    let userPrompt = buildEnclosurePrompt(input)
    if (enclosureFeedback) {
      userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${enclosureFeedback}`
    }

    const chatRequest = createChatRequest(
      ENCLOSURE_SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.3, maxTokens: 4096, projectId }
    )

    const response = await llmAdapter.chat(chatRequest)

    // Extract OpenSCAD code
    const openScadCode =
      llmAdapter.extractCodeBlock(response.content, 'openscad') ||
      llmAdapter.extractCodeBlock(response.content) ||
      response.content

    const enclosure: EnclosureArtifacts = {
      openScadCode,
      iterations: [],
    }

    // Extract dimensions for logging
    const dimensions = extractDimensions(openScadCode)
    const features = extractFeatures(openScadCode)

    return {
      enclosure,
      enclosureAttempts: enclosureAttempts + 1,
      enclosureReview: null, // Clear previous review
      enclosureFeedback: null, // Clear feedback after using it
      history: [
        createHistoryItem(
          'tool_result',
          'enclosure',
          'generate_enclosure',
          `Generated enclosure (attempt ${enclosureAttempts + 1})`,
          {
            codeLength: openScadCode.length,
            dimensions,
            features,
            isRevision: !!enclosureFeedback,
          }
        ),
      ],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      error: `Enclosure generation failed: ${message}`,
      history: [
        createHistoryItem('error', 'enclosure', 'generate_enclosure', message),
      ],
    }
  }
}

/**
 * Extract dimensions from OpenSCAD code
 */
function extractDimensions(code: string): Record<string, number> | null {
  const dimensions: Record<string, number> = {}

  const patterns = [
    { name: 'case_w', regex: /case_w\s*=\s*([\d.]+)/ },
    { name: 'case_h', regex: /case_h\s*=\s*([\d.]+)/ },
    { name: 'case_d', regex: /case_d\s*=\s*([\d.]+)/ },
    { name: 'wall', regex: /wall(?:_thickness)?\s*=\s*([\d.]+)/ },
  ]

  for (const { name, regex } of patterns) {
    const match = code.match(regex)
    if (match) {
      dimensions[name] = parseFloat(match[1])
    }
  }

  return Object.keys(dimensions).length > 0 ? dimensions : null
}

/**
 * Extract features from OpenSCAD code
 */
function extractFeatures(code: string): Record<string, unknown> | null {
  const features: Record<string, unknown> = {}

  // Count button cutouts
  const buttonMatches = code.match(/button|btn/gi)
  if (buttonMatches) {
    features.buttonCount = buttonMatches.length
  }

  // Check for USB cutout
  if (/usb|type.?c/i.test(code)) {
    features.hasUsbCutout = true
  }

  // Check for LED holes
  const ledMatches = code.match(/led|light.?pipe/gi)
  if (ledMatches) {
    features.ledCount = ledMatches.length
  }

  // Check for mounting holes
  if (/mount|screw|boss/i.test(code)) {
    features.hasMountingHoles = true
  }

  return Object.keys(features).length > 0 ? features : null
}

/**
 * Check if enclosure has been generated
 */
export function hasEnclosureGenerated(state: OrchestratorState): boolean {
  return state.enclosure !== null && !!state.enclosure.openScadCode
}
