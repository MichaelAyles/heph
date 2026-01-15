/**
 * Finalize Spec Node
 *
 * LangGraph node that locks the specification and generates the final spec
 * with BOM (Bill of Materials).
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type StageState,
} from '../../state'
import type { FinalSpec } from '../../../../db/schema'

/**
 * Finalize the specification and lock it.
 *
 * This creates the FinalSpec object with:
 * - Project name (from naming step or description)
 * - Summary and details from decisions
 * - PCB size and BOM placeholders
 *
 * @param state - Current orchestrator state
 * @param confirm - Must be true to proceed
 * @returns State update with final spec
 */
export async function finalizeSpecNode(
  state: OrchestratorState,
  confirm: boolean = true
): Promise<OrchestratorStateUpdate> {
  if (!confirm) {
    return {
      error: 'Confirmation required to finalize spec',
      history: [
        createHistoryItem('error', 'spec', 'finalize_spec', 'Confirmation not provided'),
      ],
    }
  }

  const { description, selectedName, decisions, feasibility } = state

  // Build final spec from accumulated state
  const finalSpec: FinalSpec = {
    name: selectedName || description?.slice(0, 50) || 'Hardware Project',
    summary: description || '',
    pcbSize: { width: 50.8, height: 38.1, unit: 'mm' },
    inputs: [],
    outputs: [],
    power: { source: 'USB-C', voltage: '5V', current: '500mA' },
    communication: { type: 'WiFi', protocol: 'HTTP/MQTT' },
    enclosure: { style: 'rounded_box', width: 60, height: 45, depth: 25 },
    estimatedBOM: [],
    locked: true,
    lockedAt: new Date().toISOString(),
  }

  // Extract from decisions
  for (const decision of decisions) {
    if (!decision.question || !decision.answer) continue
    const q = decision.question.toLowerCase()
    const a = decision.answer.toLowerCase()

    if (q.includes('power')) {
      finalSpec.power.source = decision.answer
    }
    if (q.includes('display')) {
      if (a.includes('oled')) {
        finalSpec.outputs.push({ type: 'OLED Display', count: 1, notes: '0.96" I2C' })
      } else if (a.includes('lcd')) {
        finalSpec.outputs.push({ type: 'LCD Display', count: 1, notes: 'SPI' })
      }
    }
    if (q.includes('led')) {
      const count = parseInt(a) || 4
      finalSpec.outputs.push({ type: 'WS2812B LEDs', count, notes: 'RGB addressable' })
    }
  }

  // Add from feasibility
  if (feasibility) {
    for (const input of feasibility.inputs?.items || []) {
      finalSpec.inputs.push({ type: input, count: 1, notes: '' })
    }
    for (const output of feasibility.outputs?.items || []) {
      if (!output) continue
      // Avoid duplicates
      if (!finalSpec.outputs.some((o) => o.type?.toLowerCase().includes(output.toLowerCase()))) {
        finalSpec.outputs.push({ type: output, count: 1, notes: '' })
      }
    }
  }

  // Update stage status
  const stages: Record<string, StageState> = {
    spec: { status: 'complete', completedAt: new Date().toISOString() },
    pcb: { status: 'in_progress' },
  }

  return {
    finalSpec,
    currentStage: 'pcb',
    completedStages: new Set(['spec']),
    stages: {
      ...state.stages,
      ...stages,
    },
    history: [
      createHistoryItem(
        'tool_result',
        'spec',
        'finalize_spec',
        `Spec locked: ${finalSpec.name}`,
        {
          specLocked: true,
          projectName: finalSpec.name,
          inputCount: finalSpec.inputs.length,
          outputCount: finalSpec.outputs.length,
        }
      ),
    ],
  }
}

/**
 * Check if spec has been finalized
 */
export function isSpecFinalized(state: OrchestratorState): boolean {
  return state.finalSpec !== null && state.finalSpec.locked === true
}
