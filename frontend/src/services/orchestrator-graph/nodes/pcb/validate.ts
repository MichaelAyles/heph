/**
 * Validate PCB Node
 *
 * LangGraph node that validates the PCB layout.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/**
 * Validation issue from PCB check
 */
interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
  block?: string
}

/**
 * Validate the PCB layout for common issues.
 *
 * Checks:
 * - MCU block is present
 * - Power block is present
 * - No overlapping blocks
 * - I2C address conflicts
 *
 * @param state - Current orchestrator state
 * @returns State update with validation results
 */
export async function validatePcbNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { pcb, availableBlocks } = state

  if (!pcb || !pcb.placedBlocks) {
    return {
      error: 'No PCB layout to validate',
      history: [
        createHistoryItem('error', 'pcb', 'validate_pcb', 'No PCB layout'),
      ],
    }
  }

  const issues: ValidationIssue[] = []
  const warnings: string[] = []

  // Check for MCU
  const hasMcu = pcb.placedBlocks.some((b) => b.blockSlug.startsWith('mcu-'))
  if (!hasMcu) {
    issues.push({ severity: 'error', message: 'No MCU block selected' })
  }

  // Check for power
  const hasPower = pcb.placedBlocks.some((b) => b.blockSlug.startsWith('power-'))
  if (!hasPower) {
    issues.push({ severity: 'error', message: 'No power block selected' })
  }

  // Check for overlapping blocks
  const occupiedCells = new Map<string, string>()
  for (const block of pcb.placedBlocks) {
    const blockDef = availableBlocks.find((b) => b.slug === block.blockSlug)
    if (!blockDef) continue

    for (let x = block.gridX; x < block.gridX + blockDef.widthUnits; x++) {
      for (let y = block.gridY; y < block.gridY + blockDef.heightUnits; y++) {
        const key = `${x},${y}`
        if (occupiedCells.has(key)) {
          issues.push({
            severity: 'error',
            message: `Block overlap at (${x}, ${y}): ${block.blockSlug} and ${occupiedCells.get(key)}`,
            block: block.blockSlug,
          })
        } else {
          occupiedCells.set(key, block.blockSlug)
        }
      }
    }
  }

  // Check for I2C address conflicts
  const i2cAddresses: Record<string, string[]> = {
    '0x76': [],
    '0x44': [],
    '0x18': [],
    '0x10': [],
    '0x29': [],
    '0x3C': [],
  }

  const blockAddresses: Record<string, string> = {
    'sensor-bme280': '0x76',
    'sensor-sht40': '0x44',
    'sensor-lis3dh': '0x18',
    'sensor-veml7700': '0x10',
    'sensor-vl53l0x': '0x29',
    'output-oled-096': '0x3C',
  }

  for (const block of pcb.placedBlocks) {
    const addr = blockAddresses[block.blockSlug]
    if (addr && i2cAddresses[addr]) {
      i2cAddresses[addr].push(block.blockSlug)
    }
  }

  for (const [addr, blocks] of Object.entries(i2cAddresses)) {
    if (blocks.length > 1) {
      warnings.push(`I2C address conflict at ${addr}: ${blocks.join(', ')}`)
    }
  }

  const valid = issues.filter((i) => i.severity === 'error').length === 0

  return {
    history: [
      createHistoryItem(
        valid ? 'tool_result' : 'validation',
        'pcb',
        'validate_pcb',
        valid ? 'PCB validation passed' : `PCB validation failed: ${issues.length} issues`,
        {
          valid,
          issueCount: issues.length,
          warningCount: warnings.length,
          issues: issues.map((i) => i.message),
          warnings,
        }
      ),
    ],
  }
}

/**
 * Check if PCB is valid (no errors)
 */
export function isPcbValid(state: OrchestratorState): boolean {
  // PCB is valid if it exists and has blocks
  // Full validation is done by validatePcbNode
  return state.pcb !== null && (state.pcb.placedBlocks?.length ?? 0) > 0
}
