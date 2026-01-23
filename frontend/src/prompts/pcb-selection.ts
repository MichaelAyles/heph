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
    gridX: number
    gridY: number
    rotation: 0 | 180
    reason: string
  }>
  boardSize: { width: number; height: number }
  notes: string
}

// Zod schema for response validation with sensible defaults
const PCBBlockSchema = z.object({
  slug: z.string(),
  gridX: z.number(),
  gridY: z.number(),
  rotation: z.union([z.literal(0), z.literal(180)]).optional().default(0),
  reason: z.string().optional().default(''),
})

const PCBSuggestionResponseSchema = z.object({
  blocks: z.array(PCBBlockSchema),
  boardSize: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
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

/**
 * Build the system prompt for PCB block selection
 */
export function buildPCBSelectionSystemPrompt(): string {
  return `You are an expert PCB design assistant for PHAESTUS, a modular hardware design platform.

Your task is to select and arrange pre-validated circuit blocks to build a PCB that meets the user's requirements.

## Design Constraints

1. **Grid System**: All blocks snap to a 12.7mm (0.5") grid
2. **Bus Continuity**: The bus runs north→south per column. Each column MUST have unbroken block coverage for signals to propagate. If there's a gap, use a passthrough block (1x1-passthrough).
3. **Edge Mount**: Blocks with connectors (USB-C, etc.) must be placed at the specified board edge
4. **MCU Required**: Every design needs exactly one MCU block (esp32-c6-mcu)
5. **Power Budget**: Total power consumption must not exceed what power blocks provide

## Available Block Categories

- **mcu**: Microcontroller (required - provides bus and 3V3)
- **power**: Power input/regulation (USB-C, battery, etc.)
- **sensor**: Environmental sensors (I2C/SPI)
- **output**: LEDs, buzzers, relays, motor drivers
- **connector**: External connections (buttons, displays, FPCs)
- **utility**: Passthrough blocks for bus continuity

## Response Format

Return a JSON object with this structure:
{
  "blocks": [
    {
      "slug": "block-slug",
      "gridX": 0,
      "gridY": 0,
      "rotation": 0,
      "reason": "Brief explanation why this block is needed"
    }
  ],
  "boardSize": { "width": 2, "height": 4 },
  "notes": "Overall design notes and considerations"
}

## Layout Guidelines

1. Place MCU at the top (row 0) - it defines the bus
2. Place power blocks at the bottom (south edge) for USB-C
3. Fill gaps with passthrough blocks to maintain bus continuity
4. Minimize board size while ensuring all requirements are met
5. Consider I2C address conflicts (each address can only be used once)

Be concise but thorough. Select the minimal set of blocks needed.`
}

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

  // Calculate board size if not provided
  let boardSize = parsed.boardSize
  if (!boardSize) {
    let maxX = 0
    let maxY = 0
    for (const block of parsed.blocks) {
      maxX = Math.max(maxX, block.gridX + 1)
      maxY = Math.max(maxY, block.gridY + 1)
    }
    boardSize = { width: Math.max(2, maxX), height: Math.max(4, maxY) }
  }

  return {
    blocks: parsed.blocks.map((b) => ({
      slug: b.slug,
      gridX: b.gridX,
      gridY: b.gridY,
      rotation: b.rotation as 0 | 180,
      reason: b.reason,
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
  const positions = new Set<string>()
  for (const block of suggestion.blocks) {
    const key = `${block.gridX},${block.gridY}`
    if (positions.has(key)) {
      errors.push(`Multiple blocks at position (${block.gridX},${block.gridY})`)
    }
    positions.add(key)
  }

  // Check bounds
  for (const block of suggestion.blocks) {
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

// =============================================================================
// Convenience Function
// =============================================================================

/**
 * Build complete prompt messages for the LLM
 */
export function buildPCBSelectionMessages(request: PCBSuggestionRequest): Array<{
  role: 'system' | 'user'
  content: string
}> {
  return [
    { role: 'system', content: buildPCBSelectionSystemPrompt() },
    { role: 'user', content: buildPCBSelectionUserPrompt(request) },
  ]
}
