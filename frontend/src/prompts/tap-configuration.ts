/**
 * Tap Configuration Prompt
 *
 * Builds prompts for LLM-assisted 0R resistor tap configuration.
 * The LLM determines which resistor taps should be populated based on
 * project requirements (I2C addresses, GPIO routing, power isolation).
 */

import { z } from 'zod'
import type { PlacedBlock, FinalSpec, ResistorTapState } from '../db/schema'
import type { BlockDefinition, BusTap, I2cAddressConfig } from '../schemas/block'
import { extractAndValidateJson } from '../../functions/lib/json'

// =============================================================================
// Zod Schema for LLM Response
// =============================================================================

export const TapConfigResponseSchema = z.object({
  configurations: z.array(
    z.object({
      blockSlug: z.string(),
      reference: z.string(), // "R3", "R6", etc.
      signal: z.string(), // "I2C1_SDA", "ADDR_SEL", etc.
      populated: z.boolean(), // true = fit, false = nofit
      reason: z.string(), // Explanation for decision
    })
  ),
  conflicts: z.array(
    z.object({
      type: z.enum(['i2c_address', 'gpio', 'power', 'signal']),
      description: z.string(),
      affectedBlocks: z.array(z.string()),
      resolution: z.string().optional(),
    })
  ),
  notes: z.string(),
})

export type TapConfigResponse = z.infer<typeof TapConfigResponseSchema>

// =============================================================================
// Types
// =============================================================================

export interface TapConfigContext {
  projectName: string
  projectDescription?: string
  finalSpec?: FinalSpec | null
  placedBlocks: PlacedBlock[]
  blockDefinitions: Map<string, BlockDefinition>
}

export interface BlockTapInfo {
  slug: string
  name: string
  taps: BusTap[]
  i2cAddresses?: number[]
  i2cAddressConfigs?: I2cAddressConfig[]
  category: string
}

// =============================================================================
// System Prompt
// =============================================================================

export const TAP_CONFIGURATION_SYSTEM_PROMPT = `You are a hardware design assistant specializing in PCB configuration. Your task is to determine the optimal 0R resistor tap configuration for a hardware project.

## Background

0R resistor "taps" are used to:
1. Configure I2C addresses by pulling address pins high/low
2. Connect/disconnect signal lines from the bus
3. Isolate power rails for specific blocks
4. Route GPIO signals through the bus

A tap can be either:
- **populated** (fit): The 0R resistor connects the signal
- **not populated** (nofit): The signal is isolated/disconnected

## Configuration Rules

1. **I2C Address Configuration**:
   - No two devices on the same I2C bus can share the same address
   - Select addresses that avoid conflicts
   - Use the address configuration options provided for each block
   - Default to the lowest available address unless there's a conflict

2. **Power Taps**:
   - Power taps (3V3, 5V0) should be populated unless:
     - The block needs isolated power
     - Multiple power sources conflict
   - GND taps are almost always populated

3. **Signal Taps**:
   - I2C_SDA, I2C_SCL taps should be populated for I2C devices
   - SPI taps should be populated for SPI devices
   - GPIO taps depend on project requirements

4. **Conflict Resolution**:
   - When I2C address conflicts exist, change one device's address configuration
   - Report any unresolvable conflicts

## Output Format

Return a JSON object with:
- configurations: Array of tap states (blockSlug, reference, signal, populated, reason)
- conflicts: Array of any detected conflicts (type, description, affectedBlocks, resolution)
- notes: Summary of the configuration decisions

Be concise but clear in your reasoning.`

// =============================================================================
// Prompt Builder
// =============================================================================

/**
 * Extract tap information from placed blocks
 */
export function extractBlockTapInfo(
  placedBlocks: PlacedBlock[],
  blockDefinitions: Map<string, BlockDefinition>
): BlockTapInfo[] {
  const infos: BlockTapInfo[] = []

  for (const placed of placedBlocks) {
    const definition = blockDefinitions.get(placed.blockSlug)
    if (!definition) continue

    // Get taps from bus interface
    const taps = definition.bus.taps || []
    if (taps.length === 0) continue

    infos.push({
      slug: placed.blockSlug,
      name: definition.name,
      taps,
      i2cAddresses: definition.bus.i2c?.addresses,
      i2cAddressConfigs: definition.remote?.i2cAddressConfigs,
      category: definition.category,
    })
  }

  return infos
}

/**
 * Build the user prompt for tap configuration
 */
export function buildTapConfigPrompt(context: TapConfigContext): string {
  const { projectName, projectDescription, finalSpec, placedBlocks, blockDefinitions } = context

  const blockInfos = extractBlockTapInfo(placedBlocks, blockDefinitions)

  // Build project context section
  const projectContext = [
    `## Project: ${projectName}`,
    projectDescription ? `Description: ${projectDescription}` : null,
    finalSpec?.summary ? `Summary: ${finalSpec.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Build blocks section
  const blocksSection = blockInfos
    .map((info) => {
      const lines = [
        `### ${info.name} (${info.slug})`,
        `Category: ${info.category}`,
      ]

      // Add I2C info if present
      if (info.i2cAddresses && info.i2cAddresses.length > 0) {
        lines.push(`I2C Addresses: ${info.i2cAddresses.map((a) => `0x${a.toString(16)}`).join(', ')}`)
      }

      // Add I2C address configs if present
      if (info.i2cAddressConfigs && info.i2cAddressConfigs.length > 0) {
        lines.push('Address Configuration Options:')
        for (const config of info.i2cAddressConfigs) {
          const resistorStates = config.resistors
            .map((r) => `${r.reference}=${r.state}`)
            .join(', ')
          const defaultMarker = config.isDefault ? ' (default)' : ''
          lines.push(`  - 0x${config.address.toString(16)}: ${resistorStates}${defaultMarker}`)
        }
      }

      // Add taps
      if (info.taps.length > 0) {
        lines.push('Bus Taps:')
        for (const tap of info.taps) {
          const voltageInfo = tap.voltage
            ? ` [${tap.voltage.min}-${tap.voltage.max}V, ${tap.voltage.direction}]`
            : ''
          lines.push(`  - ${tap.reference}: ${tap.signal}${voltageInfo}`)
          lines.push(`    Isolates: ${tap.isolates.from} → ${tap.isolates.to}`)
          lines.push(`    Purpose: ${tap.isolates.purpose}`)
        }
      }

      return lines.join('\n')
    })
    .join('\n\n')

  // Build requirements section from finalSpec
  let requirementsSection = ''
  if (finalSpec) {
    const requirements: string[] = []

    if (finalSpec.inputs && finalSpec.inputs.length > 0) {
      requirements.push('Inputs:')
      for (const input of finalSpec.inputs) {
        requirements.push(`  - ${input.type} (x${input.count})${input.notes ? `: ${input.notes}` : ''}`)
      }
    }

    if (finalSpec.outputs && finalSpec.outputs.length > 0) {
      requirements.push('Outputs:')
      for (const output of finalSpec.outputs) {
        requirements.push(`  - ${output.type} (x${output.count})${output.notes ? `: ${output.notes}` : ''}`)
      }
    }

    if (finalSpec.communication) {
      requirements.push(`Communication: ${finalSpec.communication.type} (${finalSpec.communication.protocol})`)
    }

    if (requirements.length > 0) {
      requirementsSection = '\n## Project Requirements\n' + requirements.join('\n')
    }
  }

  return `${projectContext}
${requirementsSection}

## Placed Blocks with Bus Taps

${blocksSection}

## Instructions

Analyze the blocks above and determine the optimal tap configuration:

1. Check for I2C address conflicts between blocks
2. Determine which taps should be populated vs nofit
3. Explain your reasoning for each decision
4. Report any conflicts that cannot be resolved

Return your configuration as a JSON object.`
}

/**
 * Build complete messages for LLM chat
 */
export function buildTapConfigMessages(
  context: TapConfigContext
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: TAP_CONFIGURATION_SYSTEM_PROMPT },
    { role: 'user', content: buildTapConfigPrompt(context) },
  ]
}

// =============================================================================
// Response Parser
// =============================================================================

/**
 * Parse and validate LLM response for tap configuration
 */
export function parseTapConfigResponse(content: string): TapConfigResponse | null {
  const result = extractAndValidateJson(content, TapConfigResponseSchema)
  return result.success ? result.data : null
}

/**
 * Convert LLM response to ResistorTapState array
 */
export function toResistorTapStates(
  response: TapConfigResponse,
  blockDefinitions: Map<string, BlockDefinition>
): ResistorTapState[] {
  const states: ResistorTapState[] = []

  for (const config of response.configurations) {
    const definition = blockDefinitions.get(config.blockSlug)
    if (!definition) continue

    // Find the tap definition to get isolates info
    const tap = definition.bus.taps?.find((t) => t.reference === config.reference)
    if (!tap) continue

    states.push({
      blockSlug: config.blockSlug,
      reference: config.reference,
      signal: config.signal,
      populated: config.populated,
      reason: config.reason,
      isolates: {
        from: tap.isolates.from,
        to: tap.isolates.to,
      },
    })
  }

  return states
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if tap configuration has conflicts
 */
export function hasConflicts(response: TapConfigResponse): boolean {
  return response.conflicts.length > 0
}

/**
 * Get conflict summary for display
 */
export function getConflictSummary(response: TapConfigResponse): string {
  if (response.conflicts.length === 0) return ''

  return response.conflicts
    .map((c) => `${c.type}: ${c.description} (${c.affectedBlocks.join(', ')})`)
    .join('\n')
}
