/**
 * Server-side PCB block validation utilities
 *
 * Provides comprehensive validation for PCB blocks including:
 * - block.json schema validation
 * - Required files verification
 * - DRC (Design Rule Check) helpers
 */

import {
  BlockDefinition,
  BlockDefinitionSchema,
  validateEdgeConnections,
  validateI2cAddresses,
  BlockCategory,
} from '../../src/schemas/block'
import { z } from 'zod'

// =============================================================================
// Types
// =============================================================================

export interface BlockValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface BlockFileRequirements {
  required: string[]
  optional: string[]
}

export interface BlockCompatibilityCheck {
  compatible: boolean
  errors: string[]
  warnings: string[]
}

// =============================================================================
// File Requirements
// =============================================================================

/**
 * Get the required and optional files for a block
 * @param slug - Block slug (used for filename generation)
 */
export function getBlockFileRequirements(slug: string): BlockFileRequirements {
  return {
    required: [
      `${slug}.kicad_sch`, // Source for schematic merge
      `${slug}.kicad_pcb`, // Source for PCB merge
      `${slug}.step`, // 3D model for enclosure generation
      'block.json', // Structured metadata for DRC
    ],
    optional: [
      `${slug}.png`, // Thumbnail for UI
      'README.md', // Auto-generated from block.json
    ],
  }
}

/**
 * Check if a set of files meets the block requirements
 * @param slug - Block slug
 * @param files - Array of filenames present
 */
export function validateBlockFiles(
  slug: string,
  files: string[]
): BlockValidationResult {
  const requirements = getBlockFileRequirements(slug)
  const errors: string[] = []
  const warnings: string[] = []

  // Check required files
  for (const required of requirements.required) {
    if (!files.includes(required)) {
      errors.push(`Missing required file: ${required}`)
    }
  }

  // Check for unknown files
  const allKnown = [...requirements.required, ...requirements.optional]
  for (const file of files) {
    if (!allKnown.includes(file)) {
      warnings.push(`Unexpected file: ${file}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// Schema Validation
// =============================================================================

/**
 * Validate a block.json against the schema
 * @param data - Parsed JSON data
 */
export function validateBlockJson(
  data: unknown
): { success: true; data: BlockDefinition } | { success: false; errors: string[] } {
  // Validate against Zod schema
  const result = BlockDefinitionSchema.safeParse(data)

  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    }
  }

  // Run semantic validations
  const semanticErrors: string[] = [
    ...validateEdgeConnections(result.data),
    ...validateI2cAddresses(result.data),
  ]

  if (semanticErrors.length > 0) {
    return { success: false, errors: semanticErrors }
  }

  return { success: true, data: result.data }
}

/**
 * Parse and validate block.json from a string
 * @param jsonString - Raw JSON string
 */
export function parseBlockJson(
  jsonString: string
): { success: true; data: BlockDefinition } | { success: false; errors: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error'
    return { success: false, errors: [`JSON parse error: ${message}`] }
  }

  return validateBlockJson(parsed)
}

// =============================================================================
// DRC (Design Rule Check) Helpers
// =============================================================================

/**
 * Check if two blocks have I2C address conflicts
 */
export function checkI2cConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): string[] {
  const errors: string[] = []

  if (!block1.bus.i2c?.addresses || !block2.bus.i2c?.addresses) {
    return errors
  }

  const overlap = block1.bus.i2c.addresses.filter((addr) =>
    block2.bus.i2c!.addresses.includes(addr)
  )

  for (const addr of overlap) {
    // Check if either block has configurable addresses
    if (block1.bus.i2c.addressConfigurable || block2.bus.i2c.addressConfigurable) {
      errors.push(
        `I2C address conflict at 0x${addr.toString(16).padStart(2, '0')} between ${block1.name} and ${block2.name} ` +
          `(one or both have configurable addresses - adjust jumpers to resolve)`
      )
    } else {
      errors.push(
        `I2C address conflict at 0x${addr.toString(16).padStart(2, '0')} between ${block1.name} and ${block2.name} ` +
          `(cannot use both blocks together)`
      )
    }
  }

  return errors
}

/**
 * Check if blocks have GPIO claim conflicts
 */
export function checkGpioConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): string[] {
  const errors: string[] = []

  if (!block1.bus.gpio?.claims || !block2.bus.gpio?.claims) {
    return errors
  }

  const overlap = block1.bus.gpio.claims.filter((gpio) =>
    block2.bus.gpio!.claims.includes(gpio)
  )

  for (const gpio of overlap) {
    errors.push(
      `GPIO conflict: ${gpio} claimed by both ${block1.name} and ${block2.name}`
    )
  }

  return errors
}

/**
 * Check if blocks have SPI CS conflicts
 */
export function checkSpiConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): string[] {
  const errors: string[] = []

  if (!block1.bus.spi?.csPin || !block2.bus.spi?.csPin) {
    return errors
  }

  if (block1.bus.spi.csPin === block2.bus.spi.csPin) {
    errors.push(
      `SPI chip select conflict: ${block1.bus.spi.csPin} used by both ${block1.name} and ${block2.name}`
    )
  }

  return errors
}

/**
 * Calculate total power requirements
 */
export function calculatePowerBudget(blocks: BlockDefinition[]): {
  provides: Record<string, number>
  requires: Record<string, { typical: number; max: number }>
  warnings: string[]
} {
  const provides: Record<string, number> = {}
  const requires: Record<string, { typical: number; max: number }> = {}
  const warnings: string[] = []

  for (const block of blocks) {
    // Aggregate provides
    if (block.bus.power?.provides) {
      for (const p of block.bus.power.provides) {
        const rail = p.rail
        if (provides[rail]) {
          // Multiple providers - take the max (assuming they shouldn't both be active)
          warnings.push(
            `Multiple blocks provide ${rail}: ${block.name}. Ensure power sources don't conflict.`
          )
          provides[rail] = Math.max(provides[rail], p.maxMa)
        } else {
          provides[rail] = p.maxMa
        }
      }
    }

    // Aggregate requires
    if (block.bus.power?.requires) {
      for (const r of block.bus.power.requires) {
        const rail = r.rail
        if (!requires[rail]) {
          requires[rail] = { typical: 0, max: 0 }
        }
        requires[rail].typical += r.typicalMa
        requires[rail].max += r.maxMa
      }
    }
  }

  // Check if requirements exceed provisions
  for (const [rail, req] of Object.entries(requires)) {
    const available = provides[rail] || 0
    if (available === 0) {
      warnings.push(`No block provides ${rail} rail, but ${req.max}mA max required`)
    } else if (req.max > available) {
      warnings.push(
        `${rail} rail budget exceeded: ${req.max}mA required, ${available}mA available`
      )
    } else if (req.typical > available * 0.8) {
      warnings.push(
        `${rail} rail near capacity: ${req.typical}mA typical usage, ${available}mA available`
      )
    }
  }

  return { provides, requires, warnings }
}

/**
 * Check compatibility between a set of blocks
 */
export function checkBlockCompatibility(
  blocks: BlockDefinition[]
): BlockCompatibilityCheck {
  const errors: string[] = []
  const warnings: string[] = []

  // Check pairwise conflicts
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      errors.push(...checkI2cConflict(blocks[i], blocks[j]))
      errors.push(...checkGpioConflict(blocks[i], blocks[j]))
      errors.push(...checkSpiConflict(blocks[i], blocks[j]))
    }
  }

  // Check power budget
  const powerBudget = calculatePowerBudget(blocks)
  warnings.push(...powerBudget.warnings)

  // Check for MCU requirement
  const hasMcu = blocks.some((b) => b.category === 'mcu')
  if (!hasMcu && blocks.length > 0) {
    errors.push('No MCU block selected. An MCU block is required to define the bus.')
  }

  return {
    compatible: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// Block Summary Generation
// =============================================================================

/**
 * Generate a human-readable summary of a block
 */
export function generateBlockSummary(block: BlockDefinition): string {
  const lines: string[] = [
    `# ${block.name} (${block.slug})`,
    '',
    block.description,
    '',
    `**Category:** ${block.category}`,
    `**Grid Size:** ${block.gridSize[0]}x${block.gridSize[1]} (${block.gridSize[0] * 12.7}mm x ${block.gridSize[1] * 12.7}mm)`,
    `**Version:** ${block.version}`,
    '',
  ]

  // Bus interface
  if (block.bus.power?.provides?.length) {
    lines.push('**Power Provides:**')
    for (const p of block.bus.power.provides) {
      lines.push(`- ${p.rail}: ${p.maxMa}mA max`)
    }
    lines.push('')
  }

  if (block.bus.power?.requires?.length) {
    lines.push('**Power Requires:**')
    for (const r of block.bus.power.requires) {
      lines.push(`- ${r.rail}: ${r.typicalMa}mA typical, ${r.maxMa}mA max`)
    }
    lines.push('')
  }

  if (block.bus.i2c?.addresses.length) {
    lines.push(
      `**I2C Addresses:** ${block.bus.i2c.addresses.map((a) => `0x${a.toString(16).padStart(2, '0')}`).join(', ')}`
    )
    if (block.bus.i2c.addressConfigurable) {
      lines.push('(Address configurable via jumper)')
    }
    lines.push('')
  }

  if (block.bus.taps?.length) {
    lines.push('**Bus Taps (0R resistors):**')
    for (const tap of block.bus.taps) {
      lines.push(`- ${tap.reference} (${tap.signal}): ${tap.isolates.purpose}`)
    }
    lines.push('')
  }

  // Components summary
  if (block.components.length) {
    lines.push(`**Components:** ${block.components.length} items`)
    lines.push('')
  }

  // Firmware hints
  if (block.firmware?.dependencies?.length) {
    lines.push(`**PlatformIO Dependencies:** ${block.firmware.dependencies.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}
