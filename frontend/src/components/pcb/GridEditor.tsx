/**
 * PCB Grid Editor Component
 *
 * Visual grid for placing PCB blocks with:
 * - Drag-and-drop block placement
 * - Ghost preview showing valid/invalid placement
 * - Real-time validation feedback
 * - Bus continuity visualization
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  RotateCw,
  Trash2,
  Zap,
  CheckCircle2,
  XCircle,
  Grid3X3,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockDefinition } from '../../schemas/block'
import type { PlacedBlock, PcbBlock } from '../../db/schema'
import {
  placeBlock,
  removeBlock,
  canPlaceBlock,
  validateGrid,
  fromPlacedBlocks,
  toPlacedBlocks,
  getEffectiveSize,
  getEdgeMount,
  GRID_UNIT_MM,
  type PlacementResult,
} from '../../services/pcb-grid'

// =============================================================================
// Types
// =============================================================================

interface GridEditorProps {
  /** Current placed blocks */
  placedBlocks: PlacedBlock[]
  /** Block definitions keyed by slug */
  blockDefinitions: Map<string, BlockDefinition>
  /** Callback when blocks change */
  onBlocksChange: (blocks: PlacedBlock[]) => void
  /** Grid dimensions */
  gridWidth?: number
  gridHeight?: number
  /** Whether editing is disabled */
  disabled?: boolean
  /** Block being dragged in from outside */
  draggedBlock?: PcbBlock | null
  /** Callback when external drag ends */
  onDragEnd?: () => void
  /** Additional class names */
  className?: string
}

interface DragState {
  blockId: string | null
  isExternal: boolean
  offsetX: number
  offsetY: number
}

// =============================================================================
// Constants
// =============================================================================

const CELL_SIZE = 48 // px per grid unit
const GRID_GAP = 2 // px between cells

// Category colors for blocks
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  mcu: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  power: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400' },
  sensor: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400' },
  output: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  connector: { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400' },
  utility: { bg: 'bg-gray-500/20', border: 'border-gray-500/40', text: 'text-gray-400' },
}

// =============================================================================
// Component
// =============================================================================

export function GridEditor({
  placedBlocks,
  blockDefinitions,
  onBlocksChange,
  gridWidth = 4,
  gridHeight = 6,
  disabled = false,
  draggedBlock,
  onDragEnd,
  className,
}: GridEditorProps) {
  // Refs
  const gridRef = useRef<HTMLDivElement>(null)

  // Local state for dragging
  const [dragState, setDragState] = useState<DragState>({
    blockId: null,
    isExternal: false,
    offsetX: 0,
    offsetY: 0,
  })
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Convert mouse position to grid cell
  const mouseToCellPosition = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!gridRef.current) return null

      const rect = gridRef.current.getBoundingClientRect()
      const padding = 8 // p-2 = 8px padding

      const relX = clientX - rect.left - padding
      const relY = clientY - rect.top - padding

      const cellX = Math.floor(relX / (CELL_SIZE + GRID_GAP))
      const cellY = Math.floor(relY / (CELL_SIZE + GRID_GAP))

      // Check bounds
      if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight) {
        return null
      }

      return { x: cellX, y: cellY }
    },
    [gridWidth, gridHeight]
  )

  // Build grid state from placed blocks
  const gridState = useMemo(() => {
    return fromPlacedBlocks(placedBlocks, blockDefinitions, gridWidth, gridHeight)
  }, [placedBlocks, blockDefinitions, gridWidth, gridHeight])

  // Validate the current grid
  const validationResult = useMemo(() => {
    return validateGrid(gridState)
  }, [gridState])

  // Get the block being dragged (internal or external)
  const activeDragBlock = useMemo(() => {
    if (draggedBlock) {
      // External drag - use the block's definition if available
      return blockDefinitions.get(draggedBlock.slug) || null
    }
    if (dragState.blockId) {
      // Internal drag - find the block definition
      const placement = placedBlocks.find((p) => p.blockId === dragState.blockId)
      if (placement) {
        return blockDefinitions.get(placement.blockSlug) || null
      }
    }
    return null
  }, [draggedBlock, dragState.blockId, placedBlocks, blockDefinitions])

  // Check if current hover position is valid for the dragged block
  const canPlaceAtHover = useMemo(() => {
    if (!hoverCell || !activeDragBlock) return null

    // For internal drag, temporarily remove the block from grid
    let checkGrid = gridState
    if (dragState.blockId && !dragState.isExternal) {
      checkGrid = removeBlock(gridState, dragState.blockId)
    }

    return canPlaceBlock(checkGrid, activeDragBlock, hoverCell.x, hoverCell.y, 0)
  }, [hoverCell, activeDragBlock, gridState, dragState])

  // Handle cell mouse enter for hover preview (only used when not dragging)
  const handleCellHover = useCallback(
    (x: number, y: number) => {
      // Only set hover on enter if we have an external drag or click-to-place mode
      if (!isDragging && (activeDragBlock || draggedBlock)) {
        setHoverCell({ x, y })
      }
    },
    [isDragging, activeDragBlock, draggedBlock]
  )

  // Handle cell mouse leave (only used when not dragging)
  const handleCellLeave = useCallback(() => {
    if (!isDragging) {
      setHoverCell(null)
    }
  }, [isDragging])

  // Handle dropping a block on the grid
  const handleDrop = useCallback(
    (x: number, y: number) => {
      if (disabled) return

      let blockDef: BlockDefinition | null = null
      let blockSlug: string | null = null

      if (draggedBlock) {
        // External drop
        blockDef = blockDefinitions.get(draggedBlock.slug) || null
        blockSlug = draggedBlock.slug
      } else if (dragState.blockId) {
        // Internal move
        const placement = placedBlocks.find((p) => p.blockId === dragState.blockId)
        if (placement) {
          blockDef = blockDefinitions.get(placement.blockSlug) || null
          blockSlug = placement.blockSlug
        }
      }

      if (!blockDef || !blockSlug) {
        setDragState({ blockId: null, isExternal: false, offsetX: 0, offsetY: 0 })
        onDragEnd?.()
        return
      }

      // For internal moves, remove the block first
      let newGrid = gridState
      if (dragState.blockId && !dragState.isExternal) {
        newGrid = removeBlock(gridState, dragState.blockId)
      }

      // Check if placement is valid
      const placement = canPlaceBlock(newGrid, blockDef, x, y, 0)
      if (!placement.valid) {
        setDragState({ blockId: null, isExternal: false, offsetX: 0, offsetY: 0 })
        onDragEnd?.()
        return
      }

      // Place the block
      try {
        const finalGrid = placeBlock(newGrid, blockDef, x, y, 0)
        onBlocksChange(toPlacedBlocks(finalGrid))
      } catch (error) {
        console.error('Failed to place block:', error)
      }

      setDragState({ blockId: null, isExternal: false, offsetX: 0, offsetY: 0 })
      setHoverCell(null)
      onDragEnd?.()
    },
    [disabled, draggedBlock, dragState, placedBlocks, blockDefinitions, gridState, onBlocksChange, onDragEnd]
  )

  // Handle starting an internal drag
  const handleBlockDragStart = useCallback(
    (blockId: string, e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()

      setDragState({
        blockId,
        isExternal: false,
        offsetX: 0,
        offsetY: 0,
      })
      setIsDragging(true)
      setSelectedBlockId(blockId)

      // Set initial hover position
      const cellPos = mouseToCellPosition(e.clientX, e.clientY)
      if (cellPos) {
        setHoverCell(cellPos)
      }
    },
    [disabled, mouseToCellPosition]
  )

  // Global mouse move handler for dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const cellPos = mouseToCellPosition(e.clientX, e.clientY)
      setHoverCell(cellPos)
    }

    const handleMouseUp = (e: MouseEvent) => {
      const cellPos = mouseToCellPosition(e.clientX, e.clientY)
      if (cellPos && hoverCell) {
        // Try to drop at current position
        handleDrop(cellPos.x, cellPos.y)
      } else {
        // Cancel drag
        setDragState({ blockId: null, isExternal: false, offsetX: 0, offsetY: 0 })
        setHoverCell(null)
        onDragEnd?.()
      }
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, mouseToCellPosition, hoverCell, handleDrop, onDragEnd])

  // Handle removing a block
  const handleRemoveBlock = useCallback(
    (blockId: string) => {
      if (disabled) return
      const newGrid = removeBlock(gridState, blockId)
      onBlocksChange(toPlacedBlocks(newGrid))
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null)
      }
    },
    [disabled, gridState, onBlocksChange, selectedBlockId]
  )

  // Handle rotating a block (only 0 and 180 supported for now)
  const handleRotateBlock = useCallback(
    (blockId: string) => {
      if (disabled) return
      const placement = placedBlocks.find((p) => p.blockId === blockId)
      if (!placement) return

      const newRotation = placement.rotation === 0 ? 180 : 0
      const updated = placedBlocks.map((p) =>
        p.blockId === blockId ? { ...p, rotation: newRotation as 0 | 180 } : p
      )
      onBlocksChange(updated)
    },
    [disabled, placedBlocks, onBlocksChange]
  )

  // Render a single cell
  const renderCell = (x: number, y: number) => {
    const cell = gridState.cells.get(`${x},${y}`)
    const isOccupied = cell?.blockId !== null
    const isHovered = hoverCell?.x === x && hoverCell?.y === y

    // Determine if this cell is part of a gap in the bus
    const hasGap = validationResult.suggestedFixes.some(
      (f) => f.type === 'add_passthrough' && f.gridX === x && f.gridY === y
    )

    return (
      <div
        key={`${x},${y}`}
        className={clsx(
          'relative border transition-colors',
          isOccupied ? 'border-transparent' : 'border-surface-600 hover:border-surface-500',
          hasGap && !isOccupied && 'border-red-500/50 bg-red-500/10',
          isHovered && !isOccupied && canPlaceAtHover?.valid && 'bg-green-500/20 border-green-500',
          isHovered && !isOccupied && canPlaceAtHover && !canPlaceAtHover.valid && 'bg-red-500/20 border-red-500'
        )}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          gridColumn: x + 1,
          gridRow: y + 1,
        }}
        onMouseEnter={() => handleCellHover(x, y)}
        onMouseLeave={handleCellLeave}
        onClick={() => {
          if (!isOccupied && (activeDragBlock || draggedBlock)) {
            handleDrop(x, y)
          }
        }}
      >
        {/* Cell coordinates (shown faintly) */}
        {!isOccupied && (
          <span className="absolute bottom-0.5 right-1 text-[8px] text-surface-600 font-mono">
            {x},{y}
          </span>
        )}
      </div>
    )
  }

  // Render a placed block
  const renderPlacedBlock = (placement: PlacedBlock) => {
    const blockDef = blockDefinitions.get(placement.blockSlug)
    if (!blockDef) return null

    const [width, height] = getEffectiveSize(blockDef, placement.rotation)
    const colors = CATEGORY_COLORS[blockDef.category] || CATEGORY_COLORS.utility
    const isSelected = selectedBlockId === placement.blockId
    const isThisBlockDragging = dragState.blockId === placement.blockId
    const edgeMount = getEdgeMount(blockDef)

    return (
      <div
        key={placement.blockId}
        className={clsx(
          'absolute rounded border-2 transition-all',
          colors.bg,
          colors.border,
          isSelected && 'ring-2 ring-copper ring-offset-1 ring-offset-surface-900',
          isThisBlockDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab'
        )}
        style={{
          left: placement.gridX * (CELL_SIZE + GRID_GAP),
          top: placement.gridY * (CELL_SIZE + GRID_GAP),
          width: width * (CELL_SIZE + GRID_GAP) - GRID_GAP,
          height: height * (CELL_SIZE + GRID_GAP) - GRID_GAP,
        }}
        onMouseDown={(e) => handleBlockDragStart(placement.blockId, e)}
        onClick={(e) => {
          e.stopPropagation()
          setSelectedBlockId(isSelected ? null : placement.blockId)
        }}
      >
        {/* Block content */}
        <div className="absolute inset-1 flex flex-col justify-between overflow-hidden">
          <div className="flex items-start justify-between gap-1">
            <span className={clsx('text-xs font-medium truncate', colors.text)}>
              {blockDef.name}
            </span>
            {edgeMount && (
              <span className="text-[8px] bg-surface-800 px-1 rounded text-steel-dim">
                {edgeMount}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-steel-dim font-mono">
              {width}x{height}
            </span>
            {blockDef.bus.power?.provides?.length ? (
              <Zap className="w-3 h-3 text-yellow-400" />
            ) : null}
          </div>
        </div>

        {/* Actions (shown when selected) */}
        {isSelected && !disabled && (
          <div className="absolute -top-8 left-0 flex gap-1 bg-surface-800 rounded p-1 border border-surface-600 shadow-lg z-10">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRotateBlock(placement.blockId)
              }}
              className="p-1 hover:bg-surface-700 rounded text-steel-dim hover:text-steel"
              title="Rotate 180°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRemoveBlock(placement.blockId)
              }}
              className="p-1 hover:bg-surface-700 rounded text-steel-dim hover:text-red-400"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Render ghost preview for drag
  const renderGhostPreview = () => {
    if (!hoverCell || !activeDragBlock) return null

    const [width, height] = getEffectiveSize(activeDragBlock, 0)
    const isValid = canPlaceAtHover?.valid

    return (
      <div
        className={clsx(
          'absolute rounded border-2 border-dashed pointer-events-none transition-colors',
          isValid ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
        )}
        style={{
          left: hoverCell.x * (CELL_SIZE + GRID_GAP),
          top: hoverCell.y * (CELL_SIZE + GRID_GAP),
          width: width * (CELL_SIZE + GRID_GAP) - GRID_GAP,
          height: height * (CELL_SIZE + GRID_GAP) - GRID_GAP,
        }}
      >
        <div className="absolute inset-1 flex items-center justify-center">
          {isValid ? (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          ) : (
            <XCircle className="w-6 h-6 text-red-500" />
          )}
        </div>
      </div>
    )
  }

  // Build the grid cells
  const gridCells = []
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      gridCells.push(renderCell(x, y))
    }
  }

  return (
    <div className={clsx('flex flex-col gap-4', className)}>
      {/* Grid */}
      <div className="relative">
        {/* Grid container */}
        <div
          ref={gridRef}
          className={clsx(
            'relative bg-surface-900 rounded-lg p-2',
            isDragging && 'cursor-grabbing'
          )}
          style={{
            width: gridWidth * (CELL_SIZE + GRID_GAP) + GRID_GAP + 16,
            height: gridHeight * (CELL_SIZE + GRID_GAP) + GRID_GAP + 16,
          }}
          onClick={() => setSelectedBlockId(null)}
        >
          {/* Grid background */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${gridWidth}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${gridHeight}, ${CELL_SIZE}px)`,
              gap: GRID_GAP,
            }}
          >
            {gridCells}
          </div>

          {/* Placed blocks layer */}
          <div className="absolute inset-2">
            {placedBlocks.map(renderPlacedBlock)}
            {renderGhostPreview()}
          </div>

          {/* Edge labels */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-steel-dim font-mono">
            NORTH
          </div>
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-steel-dim font-mono">
            SOUTH (power)
          </div>
        </div>

        {/* Grid dimensions */}
        <div className="absolute -right-16 top-1/2 -translate-y-1/2 text-xs text-steel-dim text-center">
          <div>{gridHeight * GRID_UNIT_MM}mm</div>
          <div className="text-[10px]">({gridHeight} units)</div>
        </div>
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs text-steel-dim text-center">
          <span>{gridWidth * GRID_UNIT_MM}mm</span>
          <span className="text-[10px] ml-1">({gridWidth} units)</span>
        </div>
      </div>

      {/* Validation feedback */}
      <ValidationPanel result={validationResult} />
    </div>
  )
}

// =============================================================================
// Validation Panel Component
// =============================================================================

interface ValidationPanelProps {
  result: PlacementResult
}

function ValidationPanel({ result }: ValidationPanelProps) {
  if (result.valid && result.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>Layout valid - bus continuity and power budget OK</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded">
          <div className="flex items-center gap-2 text-sm text-red-400 mb-1">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Validation Errors</span>
          </div>
          <ul className="text-xs text-red-300 space-y-0.5 ml-6">
            {result.errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-center gap-2 text-sm text-yellow-400 mb-1">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Warnings</span>
          </div>
          <ul className="text-xs text-yellow-300 space-y-0.5 ml-6">
            {result.warnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested fixes */}
      {result.suggestedFixes.length > 0 && (
        <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded">
          <div className="flex items-center gap-2 text-sm text-blue-400 mb-1">
            <Grid3X3 className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Suggested Fixes</span>
          </div>
          <ul className="text-xs text-blue-300 space-y-0.5 ml-6">
            {result.suggestedFixes.slice(0, 5).map((fix, i) => (
              <li key={i}>• {fix.description}</li>
            ))}
            {result.suggestedFixes.length > 5 && (
              <li className="text-steel-dim">
                ...and {result.suggestedFixes.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default GridEditor
