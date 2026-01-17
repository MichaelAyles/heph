/**
 * PCB Stage Tools
 *
 * Tools for PCB block selection and layout with DRC validation.
 */

import { autoSelectBlocks } from '@/prompts/block-selection'
import type { OrchestratorContext, ToolResult } from '../types'
import type { PlacedBlock, PcbBlock } from '@/db/schema'
import type { BlockDefinition } from '@/schemas/block'
import {
  validateBlockCombination,
  type DRCResult,
} from '@/services/block-drc'

const GRID_SIZE_MM = 12.7

/**
 * Convert PcbBlock to BlockDefinition for DRC validation
 * Falls back to creating a partial definition from legacy fields
 */
function toBlockDefinition(block: PcbBlock): BlockDefinition | null {
  // If the block has a formal definition, use it
  if (block.definition) {
    return block.definition
  }

  // Otherwise, create a minimal definition from legacy fields for basic DRC
  // This allows DRC to work even with blocks that haven't been migrated yet
  const i2cAddresses = block.i2cAddresses
    ?.map((addr) => {
      const parsed = parseInt(addr, 16)
      return isNaN(parsed) ? null : parsed
    })
    .filter((a): a is number => a !== null) || []

  return {
    slug: block.slug,
    name: block.name,
    version: block.version || '0.0.0',
    category: block.category,
    description: block.description,
    gridSize: [block.widthUnits, block.heightUnits],
    bus: {
      taps: block.taps?.map((t) => ({
        signal: t.net as BlockDefinition['bus']['taps'][0]['signal'],
        reference: 'R?',
        isolates: { from: '', to: '', purpose: '' },
      })) || [],
      permanent: [],
      i2c: i2cAddresses.length > 0
        ? { addresses: i2cAddresses }
        : undefined,
      spi: block.spiCs ? { csPin: block.spiCs as 'SPI0_CS0' | 'SPI0_CS1' } : undefined,
      power: block.power?.currentMaxMa
        ? block.power.currentMaxMa < 0
          ? { provides: [{ rail: '3V3', maxMa: Math.abs(block.power.currentMaxMa) }] }
          : { requires: [{ rail: '3V3', typicalMa: block.power.currentMaxMa / 2, maxMa: block.power.currentMaxMa }] }
        : undefined,
    },
    edges: {
      north: Array(block.widthUnits).fill({ signals: 'ALL' as const }),
      south: Array(block.widthUnits).fill({ signals: 'ALL' as const }),
    },
    components: block.components?.map((c) => ({
      reference: c.ref,
      value: c.value,
      footprint: c.package,
      quantity: 1,
    })) || [],
  }
}

/**
 * Validate block selection with DRC checks
 */
function validateSelection(
  selectedSlugs: string[],
  availableBlocks: PcbBlock[]
): DRCResult {
  const selectedBlocks = selectedSlugs
    .map((slug) => availableBlocks.find((b) => b.slug === slug))
    .filter((b): b is PcbBlock => b !== undefined)

  const definitions = selectedBlocks
    .map(toBlockDefinition)
    .filter((d): d is BlockDefinition => d !== null)

  return validateBlockCombination(definitions)
}

/**
 * Select and place PCB blocks with DRC validation
 */
export async function selectPcbBlocks(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const blocks = args.blocks as Array<{
    blockSlug?: string
    block_slug?: string
    gridX?: number
    grid_x?: number
    gridY?: number
    grid_y?: number
  }> | undefined
  const reasoning = args.reasoning as string
  const skipDrc = args.skip_drc === true || args.skipDrc === true

  let placedBlocks: PlacedBlock[]
  let selectedSlugs: string[]

  if (blocks && blocks.length > 0) {
    // Use provided blocks - handle both camelCase and snake_case from LLM
    placedBlocks = blocks.map((b) => {
      const slug = b.blockSlug || b.block_slug || ''
      const x = b.gridX ?? b.grid_x ?? 0
      const y = b.gridY ?? b.grid_y ?? 0
      return {
        blockId: slug,
        blockSlug: slug,
        gridX: x,
        gridY: y,
        rotation: 0 as const,
      }
    })
    selectedSlugs = placedBlocks.map((b) => b.blockSlug)
  } else if (ctx.currentSpec?.finalSpec) {
    // Auto-select blocks
    const selection = autoSelectBlocks(ctx.currentSpec.finalSpec, ctx.availableBlocks)
    placedBlocks = selection.blocks.map((b) => ({
      blockId: b.blockSlug,
      blockSlug: b.blockSlug,
      gridX: b.gridX,
      gridY: b.gridY,
      rotation: b.rotation,
    }))
    selectedSlugs = placedBlocks.map((b) => b.blockSlug)
  } else {
    return { error: 'No blocks provided and no final spec available for auto-selection' }
  }

  // Run DRC validation unless explicitly skipped
  if (!skipDrc && ctx.availableBlocks.length > 0) {
    const drcResult = validateSelection(selectedSlugs, ctx.availableBlocks)

    if (!drcResult.valid) {
      // Return DRC errors to the orchestrator for self-correction
      return {
        error: 'DRC validation failed',
        drcErrors: drcResult.errors.map((e) => ({
          code: e.code,
          message: e.message,
          blocks: e.blocks,
        })),
        drcWarnings: drcResult.warnings.map((w) => ({
          code: w.code,
          message: w.message,
          blocks: w.blocks,
        })),
        suggestion: 'Please revise block selection to resolve conflicts. ' +
          'Check I2C addresses, GPIO claims, SPI chip selects, and power requirements.',
        selectedBlocks: selectedSlugs,
      }
    }

    // Include warnings even on success
    if (drcResult.warnings.length > 0) {
      ctx.addHistoryItem({
        type: 'progress',
        stage: ctx.getCurrentStage(),
        action: 'DRC validation',
        result: `Passed with ${drcResult.warnings.length} warning(s)`,
        details: { warnings: drcResult.warnings },
      })
    }
  }

  // Calculate board size
  let maxX = 0
  let maxY = 0
  for (const block of placedBlocks) {
    const blockDef = ctx.availableBlocks.find((b) => b.slug === block.blockSlug)
    if (blockDef) {
      maxX = Math.max(maxX, block.gridX + blockDef.widthUnits)
      maxY = Math.max(maxY, block.gridY + blockDef.heightUnits)
    }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.pcb = {
      placedBlocks,
      boardSize: {
        width: Math.max(maxX, 4) * GRID_SIZE_MM,
        height: Math.max(maxY, 3) * GRID_SIZE_MM,
        unit: 'mm',
      },
      netList: [],
    }
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ pcb: ctx.currentSpec.pcb })
  }

  return {
    success: true,
    blockCount: placedBlocks.length,
    selectedBlocks: selectedSlugs,
    boardSize: {
      width: Math.max(maxX, 4) * GRID_SIZE_MM,
      height: Math.max(maxY, 3) * GRID_SIZE_MM,
    },
    reasoning,
  }
}
