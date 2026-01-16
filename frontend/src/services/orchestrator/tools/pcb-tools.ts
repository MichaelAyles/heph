/**
 * PCB Stage Tools
 *
 * Tools for PCB block selection and layout.
 */

import { autoSelectBlocks } from '@/prompts/block-selection'
import type { OrchestratorContext, ToolResult } from '../types'
import type { PlacedBlock } from '@/db/schema'

const GRID_SIZE_MM = 12.7

/**
 * Select and place PCB blocks
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

  let placedBlocks: PlacedBlock[]

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

    return { success: true, blockCount: placedBlocks.length, reasoning }
  } else {
    return { error: 'No final spec available for block selection' }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.pcb = {
      placedBlocks,
      boardSize: { width: 50.8, height: 38.1, unit: 'mm' },
      netList: [],
    }
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ pcb: ctx.currentSpec.pcb })
  }

  return { success: true, blockCount: placedBlocks.length, reasoning }
}
