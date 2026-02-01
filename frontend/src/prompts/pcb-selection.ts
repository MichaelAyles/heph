/**
 * PCB Block Selection Prompt
 *
 * Generates prompts for LLM-assisted block selection and layout suggestion.
 * The LLM recommends which blocks to use and how to arrange them on the grid.
 */

import { z } from 'zod'
import type { BlockDefinition } from '../schemas/block'
import type { FinalSpec } from '../db/schema'
import { extractAndValidateJson } from '../../functions/lib/json'

// =============================================================================
// Types
// =============================================================================

export interface BlockCatalogEntry {
  slug: string
  name: string
  category: string
  gridSize: [number, number]
  description: string
  provides?: string[]
  requires?: string[]
  interfaces?: string[]
  edgeMount?: string
}

export interface PCBSuggestionRequest {
  projectName: string
  description: string
  finalSpec?: FinalSpec | null
  availableBlocks: BlockCatalogEntry[]
}

export interface PCBSuggestionResponse {
  blocks: Array<{
    slug: string
    gridX?: number
    gridY?: number
    rotation?: 0 | 180
    reason: string
    isRemote?: boolean
  }>
  boardSize: { width: number; height: number }
  notes: string
}

// Zod schema for response validation with sensible defaults
// gridX/gridY are optional to support remote blocks which don't have grid positions
const PCBBlockSchema = z.object({
  slug: z.string(),
  gridX: z.number().optional(),
  gridY: z.number().optional(),
  rotation: z
    .union([z.literal(0), z.literal(180)])
    .optional()
    .default(0),
  reason: z.string().optional().default(''),
  isRemote: z.boolean().optional(), // Flag for remote blocks that don't go on the grid
})

const PCBSuggestionResponseSchema = z.object({
  blocks: z.array(PCBBlockSchema),
  boardSize: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  notes: z.string().optional().default(''),
})

// =============================================================================
// Block Catalog Builder
// =============================================================================

/**
 * Convert BlockDefinition to a simplified catalog entry for the prompt
 */
export function toBlockCatalogEntry(block: BlockDefinition): BlockCatalogEntry {
  // Skip remote blocks for PCB selection as they don't go on the main grid
  // Provide a default gridSize for compatibility if somehow called
  const entry: BlockCatalogEntry = {
    slug: block.slug,
    name: block.name,
    category: block.category,
    gridSize: block.gridSize ?? [1, 1],
    description: block.description,
  }

  // Power
  if (block.bus.power?.provides) {
    entry.provides = block.bus.power.provides.map((p) => `${p.rail}@${p.maxMa}mA`)
  }
  if (block.bus.power?.requires) {
    entry.requires = block.bus.power.requires.map((r) => `${r.rail}@${r.maxMa}mA`)
  }

  // Interfaces
  const interfaces: string[] = []
  if (block.bus.i2c?.addresses) {
    interfaces.push(`I2C: ${block.bus.i2c.addresses.map((a) => `0x${a.toString(16)}`).join(',')}`)
  }
  if (block.bus.spi?.csPin) {
    interfaces.push(`SPI: ${block.bus.spi.csPin}`)
  }
  if (block.bus.gpio?.claims) {
    interfaces.push(`GPIO: ${block.bus.gpio.claims.join(',')}`)
  }
  if (interfaces.length > 0) {
    entry.interfaces = interfaces
  }

  // Edge mount
  if (block.physical?.edgeMount) {
    entry.edgeMount = block.physical.edgeMount
  }

  return entry
}

// =============================================================================
// Prompt Builder
// =============================================================================

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/block_selection to get AI suggestions

/**
 * Build the user prompt for a specific project
 */
export function buildPCBSelectionUserPrompt(request: PCBSuggestionRequest): string {
  const lines: string[] = []

  lines.push('## Project Requirements')
  lines.push('')
  lines.push(`**Name**: ${request.projectName}`)
  lines.push(`**Description**: ${request.description}`)
  lines.push('')

  // Add final spec details if available
  if (request.finalSpec) {
    const spec = request.finalSpec

    lines.push('### Features')
    lines.push('')

    // Inputs
    if (spec.inputs && spec.inputs.length > 0) {
      lines.push('**Inputs:**')
      for (const input of spec.inputs) {
        lines.push(
          `- ${input.type}${input.count > 1 ? ` (×${input.count})` : ''}${input.notes ? `: ${input.notes}` : ''}`
        )
      }
      lines.push('')
    }

    // Outputs
    if (spec.outputs && spec.outputs.length > 0) {
      lines.push('**Outputs:**')
      for (const output of spec.outputs) {
        lines.push(
          `- ${output.type}${output.count > 1 ? ` (×${output.count})` : ''}${output.notes ? `: ${output.notes}` : ''}`
        )
      }
      lines.push('')
    }

    // Power
    if (spec.power) {
      lines.push(`**Power**: ${spec.power.source} (${spec.power.voltage})`)
      lines.push('')
    }

    // Communication
    if (spec.communication) {
      lines.push(`**Communication**: ${spec.communication.type} (${spec.communication.protocol})`)
      lines.push('')
    }
  }

  // Add available blocks
  lines.push('## Available Blocks')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(request.availableBlocks, null, 2))
  lines.push('```')
  lines.push('')

  lines.push('## Task')
  lines.push('')
  lines.push('Select and arrange blocks to create a PCB that meets these requirements. Remember:')
  lines.push('1. Always include the MCU (esp32-c6-mcu)')
  lines.push('2. Include appropriate power block(s)')
  lines.push('3. Add passthrough blocks to fill any gaps in columns')
  lines.push('4. Place edge-mount blocks at the correct edge')
  lines.push('')
  lines.push('Return your response as a JSON object.')

  return lines.join('\n')
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Parse and validate the LLM response
 */
export function parsePCBSuggestionResponse(content: string): PCBSuggestionResponse | null {
  const result = extractAndValidateJson(content, PCBSuggestionResponseSchema)
  if (!result.success) {
    return null
  }

  const parsed = result.data

  // Calculate board size if not provided (only from grid-placed blocks)
  let boardSize = parsed.boardSize
  if (!boardSize) {
    let maxX = 0
    let maxY = 0
    for (const block of parsed.blocks) {
      // Skip remote blocks (no grid position)
      if (block.gridX !== undefined && block.gridY !== undefined) {
        maxX = Math.max(maxX, block.gridX + 1)
        maxY = Math.max(maxY, block.gridY + 1)
      }
    }
    boardSize = { width: Math.max(2, maxX), height: Math.max(4, maxY) }
  }

  return {
    blocks: parsed.blocks.map((b) => ({
      slug: b.slug,
      gridX: b.gridX,
      gridY: b.gridY,
      rotation: b.rotation as 0 | 180 | undefined,
      reason: b.reason,
      isRemote: b.isRemote,
    })),
    boardSize,
    notes: parsed.notes,
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate the suggested blocks against the available catalog
 */
export function validatePCBSuggestion(
  suggestion: PCBSuggestionResponse,
  availableBlocks: BlockCatalogEntry[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const availableSlugs = new Set(availableBlocks.map((b) => b.slug))

  // Check all blocks exist
  for (const block of suggestion.blocks) {
    if (!availableSlugs.has(block.slug)) {
      errors.push(`Unknown block: ${block.slug}`)
    }
  }

  // Check for MCU
  const hasMcu = suggestion.blocks.some((b) => b.slug.includes('mcu'))
  if (!hasMcu) {
    errors.push('No MCU block selected - an MCU is required')
  }

  // Check for overlaps (basic check - doesn't account for block sizes)
  // Skip remote blocks which don't have grid positions
  const positions = new Set<string>()
  for (const block of suggestion.blocks) {
    if (block.gridX === undefined || block.gridY === undefined) continue // Skip remote blocks
    const key = `${block.gridX},${block.gridY}`
    if (positions.has(key)) {
      errors.push(`Multiple blocks at position (${block.gridX},${block.gridY})`)
    }
    positions.add(key)
  }

  // Check bounds (skip remote blocks)
  for (const block of suggestion.blocks) {
    if (block.gridX === undefined || block.gridY === undefined) continue // Skip remote blocks
    if (block.gridX < 0 || block.gridY < 0) {
      errors.push(`Block ${block.slug} has negative position`)
    }
    if (block.gridX >= suggestion.boardSize.width || block.gridY >= suggestion.boardSize.height) {
      errors.push(`Block ${block.slug} is outside board bounds`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// NOTE: buildPCBSelectionMessages removed - use /api/langgraph/invoke/block_selection instead
