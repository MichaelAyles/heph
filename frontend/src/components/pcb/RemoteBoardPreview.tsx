/**
 * RemoteBoardPreview - Visual preview of remote boards in the PCB grid view
 *
 * Displays a simplified grid view of each remote board, showing:
 * - Board name and type
 * - Placed blocks on the remote board
 * - Board dimensions
 * - Connection indicator
 */

import { useMemo } from 'react'
import { clsx } from 'clsx'
import { Monitor, ToggleLeft, Usb, Cpu, Zap, Cable } from 'lucide-react'
import type { RemoteBoard, PlacedBlock } from '../../db/schema'
import type { BlockDefinition } from '../../schemas/block'
import { getEffectiveSize, GRID_UNIT_MM } from '../../services/pcb-grid'

// =============================================================================
// Types
// =============================================================================

interface RemoteBoardPreviewProps {
  /** Remote boards to display */
  remoteBoards: RemoteBoard[]
  /** Block definitions keyed by slug */
  blockDefinitions: Map<string, BlockDefinition>
  /** Optional click handler */
  onBoardClick?: (boardId: string) => void
  /** Currently selected board */
  selectedBoardId?: string | null
  /** Additional class names */
  className?: string
}

// =============================================================================
// Constants
// =============================================================================

const CELL_SIZE = 32 // px per grid unit (smaller than main grid's 48px)
const GRID_GAP = 1 // px between cells

// Category colors for blocks (same as GridEditor)
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  mcu: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  power: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400' },
  sensor: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400' },
  output: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  connector: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400' },
  utility: { bg: 'bg-gray-500/20', border: 'border-gray-500/40', text: 'text-gray-400' },
}

// Remote board type icons
const BOARD_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  button: ToggleLeft,
  display: Monitor,
  connector: Usb,
  custom: Cpu,
}

// Remote board type colors
const BOARD_TYPE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  button: { border: 'border-amber-500/50', bg: 'bg-amber-500/5', text: 'text-amber-400' },
  display: { border: 'border-cyan-500/50', bg: 'bg-cyan-500/5', text: 'text-cyan-400' },
  connector: { border: 'border-pink-500/50', bg: 'bg-pink-500/5', text: 'text-pink-400' },
  custom: { border: 'border-purple-500/50', bg: 'bg-purple-500/5', text: 'text-purple-400' },
}

// =============================================================================
// Component
// =============================================================================

export function RemoteBoardPreview({
  remoteBoards,
  blockDefinitions,
  onBoardClick,
  selectedBoardId,
  className,
}: RemoteBoardPreviewProps) {
  if (remoteBoards.length === 0) {
    return null
  }

  return (
    <div className={clsx('flex flex-col gap-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Cable className="w-4 h-4 text-copper" />
        <span className="text-sm font-medium text-steel">Remote Boards</span>
        <span className="text-xs text-steel-dim">({remoteBoards.length})</span>
      </div>

      {/* Board previews */}
      <div className="flex flex-col gap-3">
        {remoteBoards.map((board) => (
          <SingleBoardPreview
            key={board.id}
            board={board}
            blockDefinitions={blockDefinitions}
            isSelected={selectedBoardId === board.id}
            onClick={() => onBoardClick?.(board.id)}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Single Board Preview
// =============================================================================

interface SingleBoardPreviewProps {
  board: RemoteBoard
  blockDefinitions: Map<string, BlockDefinition>
  isSelected?: boolean
  onClick?: () => void
}

function SingleBoardPreview({
  board,
  blockDefinitions,
  isSelected,
  onClick,
}: SingleBoardPreviewProps) {
  const typeColors = BOARD_TYPE_COLORS[board.type] || BOARD_TYPE_COLORS.custom
  const TypeIcon = BOARD_TYPE_ICONS[board.type] || Cpu

  // Calculate grid dimensions
  const gridWidth = board.gridWidth || 2
  const gridHeight = board.gridHeight || 2

  // Build cells array
  const cells = useMemo(() => {
    const result = []
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        result.push({ x, y })
      }
    }
    return result
  }, [gridWidth, gridHeight])

  // Render a placed block
  const renderPlacedBlock = (placement: PlacedBlock) => {
    const blockDef = blockDefinitions.get(placement.blockSlug)
    if (!blockDef) return null

    const [width, height] = getEffectiveSize(blockDef, placement.rotation)
    const colors = CATEGORY_COLORS[blockDef.category] || CATEGORY_COLORS.utility

    return (
      <div
        key={placement.blockId}
        className={clsx('absolute rounded border', colors.bg, colors.border)}
        style={{
          left: placement.gridX * (CELL_SIZE + GRID_GAP),
          top: placement.gridY * (CELL_SIZE + GRID_GAP),
          width: width * (CELL_SIZE + GRID_GAP) - GRID_GAP,
          height: height * (CELL_SIZE + GRID_GAP) - GRID_GAP,
        }}
      >
        <div className="absolute inset-0.5 flex flex-col justify-between overflow-hidden p-0.5">
          <span className={clsx('text-[8px] font-medium truncate', colors.text)}>
            {blockDef.name}
          </span>
          <div className="flex items-center justify-between">
            <span className="text-[7px] text-steel-dim font-mono">
              {width}x{height}
            </span>
            {blockDef.bus.power?.provides?.length ? (
              <Zap className="w-2 h-2 text-yellow-400" />
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'rounded-lg border p-3 transition-all cursor-pointer',
        typeColors.border,
        typeColors.bg,
        isSelected && 'ring-2 ring-copper ring-offset-1 ring-offset-surface-900'
      )}
      onClick={onClick}
    >
      {/* Board header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TypeIcon className={clsx('w-4 h-4', typeColors.text)} />
          <span className="text-sm font-medium text-steel">{board.name}</span>
        </div>
        <span className="text-[10px] text-steel-dim font-mono">
          {board.boardSize.width}x{board.boardSize.height}mm
        </span>
      </div>

      {/* Grid preview */}
      <div className="relative bg-surface-900 rounded p-1.5">
        {/* Grid cells */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${gridWidth}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${gridHeight}, ${CELL_SIZE}px)`,
            gap: GRID_GAP,
          }}
        >
          {cells.map(({ x, y }) => (
            <div
              key={`${x},${y}`}
              className="border border-surface-700 rounded-sm"
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
            />
          ))}
        </div>

        {/* Placed blocks */}
        <div className="absolute inset-1.5">{board.placedBlocks.map(renderPlacedBlock)}</div>
      </div>

      {/* Connection info */}
      {board.connectionMapping.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-steel-dim">
          <Cable className="w-3 h-3" />
          <span>{board.connectionMapping.length} connection(s) mapped</span>
        </div>
      )}

      {/* Dimension labels */}
      <div className="mt-1.5 flex items-center justify-between text-[9px] text-steel-dim font-mono">
        <span>{(gridWidth * GRID_UNIT_MM).toFixed(1)}mm wide</span>
        <span>{(gridHeight * GRID_UNIT_MM).toFixed(1)}mm tall</span>
      </div>
    </div>
  )
}

export default RemoteBoardPreview
