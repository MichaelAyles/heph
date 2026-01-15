/**
 * Select Blocks Node
 *
 * LangGraph node that selects and places PCB blocks based on the final spec.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'
import { autoSelectBlocks } from '../../../../prompts/block-selection'
import type { PlacedBlock, PCBArtifacts } from '../../../../db/schema'

/** Grid size in mm */
const GRID_SIZE_MM = 12.7

/**
 * Select and place PCB blocks based on the final specification.
 *
 * In VIBE_IT mode, this auto-selects blocks using the autoSelectBlocks function.
 * Alternatively, blocks can be provided directly.
 *
 * @param state - Current orchestrator state
 * @param blocks - Optional manually specified blocks
 * @param reasoning - Optional reasoning for block selection
 * @returns State update with PCB artifacts
 */
export async function selectBlocksNode(
  state: OrchestratorState,
  blocks?: Array<{
    blockSlug?: string
    block_slug?: string
    gridX?: number
    grid_x?: number
    gridY?: number
    grid_y?: number
  }>,
  reasoning?: string
): Promise<OrchestratorStateUpdate> {
  const { finalSpec, availableBlocks } = state

  if (!finalSpec) {
    return {
      error: 'Final spec must be complete before block selection',
      history: [
        createHistoryItem('error', 'pcb', 'select_blocks', 'No final spec available'),
      ],
    }
  }

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
  } else {
    // Auto-select blocks using the block selection algorithm
    const selection = autoSelectBlocks(finalSpec, availableBlocks)
    placedBlocks = selection.blocks.map((b) => ({
      blockId: b.blockSlug,
      blockSlug: b.blockSlug,
      gridX: b.gridX,
      gridY: b.gridY,
      rotation: b.rotation,
    }))
  }

  // Calculate board size from placed blocks
  let maxX = 0
  let maxY = 0

  for (const block of placedBlocks) {
    const blockDef = availableBlocks.find((b) => b.slug === block.blockSlug)
    if (blockDef) {
      maxX = Math.max(maxX, block.gridX + blockDef.widthUnits)
      maxY = Math.max(maxY, block.gridY + blockDef.heightUnits)
    }
  }

  const pcb: PCBArtifacts = {
    placedBlocks,
    boardSize: {
      width: Math.max(maxX, 4) * GRID_SIZE_MM,
      height: Math.max(maxY, 3) * GRID_SIZE_MM,
      unit: 'mm',
    },
    netList: [],
  }

  return {
    pcb,
    history: [
      createHistoryItem(
        'tool_result',
        'pcb',
        'select_blocks',
        `Placed ${placedBlocks.length} blocks`,
        {
          blockCount: placedBlocks.length,
          boardSize: pcb.boardSize,
          reasoning: reasoning || 'Auto-selected based on spec',
        }
      ),
    ],
  }
}

/**
 * Check if PCB blocks have been selected
 */
export function hasBlocksSelected(state: OrchestratorState): boolean {
  return state.pcb !== null && (state.pcb.placedBlocks?.length ?? 0) > 0
}
