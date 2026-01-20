/**
 * Panel Preview Component
 *
 * SVG visualization of panelized PCB layout showing:
 * - Main board
 * - Remote boards
 * - V-score lines (dashed red)
 * - Board labels and dimensions
 */

import { useMemo } from 'react'
import { clsx } from 'clsx'
import type { PanelConfiguration, RemoteBoard } from '../../db/schema'

// =============================================================================
// Types
// =============================================================================

interface PanelPreviewProps {
  mainBoardSize: { width: number; height: number }
  remoteBoards: RemoteBoard[]
  panelConfig: PanelConfiguration
  onBoardClick?: (boardId: string | 'main') => void
  selectedBoardId?: string | 'main' | null
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function PanelPreview({
  mainBoardSize,
  remoteBoards,
  panelConfig,
  onBoardClick,
  selectedBoardId,
  className,
}: PanelPreviewProps) {
  // Calculate SVG viewBox with padding
  const viewBox = useMemo(() => {
    const padding = 10
    return {
      x: -padding,
      y: -padding,
      width: panelConfig.panelSize.width + padding * 2,
      height: panelConfig.panelSize.height + padding * 2,
    }
  }, [panelConfig.panelSize])

  // Scale factor for display (mm to SVG units)
  const scale = 1

  return (
    <div className={clsx('bg-surface-900 rounded-lg p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-steel">Panel Layout</h3>
        <div className="text-xs text-steel-dim">
          {panelConfig.panelSize.width.toFixed(1)} × {panelConfig.panelSize.height.toFixed(1)} mm
        </div>
      </div>

      {/* SVG Preview */}
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="w-full h-auto max-h-96 border border-surface-700 rounded bg-surface-800"
        style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }}
      >
        {/* Panel background */}
        <rect
          x={0}
          y={0}
          width={panelConfig.panelSize.width * scale}
          height={panelConfig.panelSize.height * scale}
          fill="#1a1a1a"
          stroke="#333"
          strokeWidth={0.5}
        />

        {/* Main board */}
        <g
          className="cursor-pointer"
          onClick={() => onBoardClick?.('main')}
        >
          <rect
            x={panelConfig.mainBoardPosition.x * scale}
            y={panelConfig.mainBoardPosition.y * scale}
            width={mainBoardSize.width * scale}
            height={mainBoardSize.height * scale}
            fill={selectedBoardId === 'main' ? '#2a5a2a' : '#1a3a1a'}
            stroke={selectedBoardId === 'main' ? '#4a8a4a' : '#2a5a2a'}
            strokeWidth={0.5}
            rx={0.5}
          />
          <text
            x={(panelConfig.mainBoardPosition.x + mainBoardSize.width / 2) * scale}
            y={(panelConfig.mainBoardPosition.y + mainBoardSize.height / 2) * scale}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6a9a6a"
            fontSize={Math.min(mainBoardSize.width, mainBoardSize.height) * 0.15}
            fontFamily="monospace"
          >
            MAIN
          </text>
          {/* Board dimensions */}
          <text
            x={(panelConfig.mainBoardPosition.x + mainBoardSize.width / 2) * scale}
            y={(panelConfig.mainBoardPosition.y + mainBoardSize.height - 2) * scale}
            textAnchor="middle"
            fill="#4a7a4a"
            fontSize={2}
            fontFamily="monospace"
          >
            {mainBoardSize.width.toFixed(1)}×{mainBoardSize.height.toFixed(1)}
          </text>
        </g>

        {/* Remote boards */}
        {panelConfig.remoteBoards.map((pos) => {
          const board = remoteBoards.find((b) => b.id === pos.remoteBoardId)
          if (!board) return null

          const isSelected = selectedBoardId === board.id

          return (
            <g
              key={pos.remoteBoardId}
              className="cursor-pointer"
              onClick={() => onBoardClick?.(board.id)}
            >
              <rect
                x={pos.position.x * scale}
                y={pos.position.y * scale}
                width={board.boardSize.width * scale}
                height={board.boardSize.height * scale}
                fill={isSelected ? '#2a4a5a' : '#1a3a4a'}
                stroke={isSelected ? '#4a8aaa' : '#2a5a7a'}
                strokeWidth={0.5}
                rx={0.5}
              />
              <text
                x={(pos.position.x + board.boardSize.width / 2) * scale}
                y={(pos.position.y + board.boardSize.height / 2) * scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#6a9aba"
                fontSize={Math.min(board.boardSize.width, board.boardSize.height) * 0.2}
                fontFamily="monospace"
              >
                {board.name.substring(0, 8)}
              </text>
              {/* Board dimensions */}
              <text
                x={(pos.position.x + board.boardSize.width / 2) * scale}
                y={(pos.position.y + board.boardSize.height - 2) * scale}
                textAnchor="middle"
                fill="#4a7a9a"
                fontSize={2}
                fontFamily="monospace"
              >
                {board.boardSize.width.toFixed(1)}×{board.boardSize.height.toFixed(1)}
              </text>
            </g>
          )
        })}

        {/* V-Score lines */}
        {panelConfig.vScoreLines.map((line, index) => (
          <line
            key={index}
            x1={
              line.orientation === 'vertical'
                ? line.position * scale
                : line.startMm * scale
            }
            y1={
              line.orientation === 'horizontal'
                ? line.position * scale
                : line.startMm * scale
            }
            x2={
              line.orientation === 'vertical'
                ? line.position * scale
                : line.endMm * scale
            }
            y2={
              line.orientation === 'horizontal'
                ? line.position * scale
                : line.endMm * scale
            }
            stroke="#ff4444"
            strokeWidth={0.3}
            strokeDasharray="1,1"
            opacity={0.7}
          />
        ))}

        {/* Panel margin indicators (corners) */}
        <g stroke="#555" strokeWidth={0.2} fill="none">
          {/* Top-left corner */}
          <path d={`M 0,${panelConfig.panelMargin} L 0,0 L ${panelConfig.panelMargin},0`} />
          {/* Top-right corner */}
          <path
            d={`M ${panelConfig.panelSize.width - panelConfig.panelMargin},0 L ${panelConfig.panelSize.width},0 L ${panelConfig.panelSize.width},${panelConfig.panelMargin}`}
          />
          {/* Bottom-right corner */}
          <path
            d={`M ${panelConfig.panelSize.width},${panelConfig.panelSize.height - panelConfig.panelMargin} L ${panelConfig.panelSize.width},${panelConfig.panelSize.height} L ${panelConfig.panelSize.width - panelConfig.panelMargin},${panelConfig.panelSize.height}`}
          />
          {/* Bottom-left corner */}
          <path
            d={`M ${panelConfig.panelMargin},${panelConfig.panelSize.height} L 0,${panelConfig.panelSize.height} L 0,${panelConfig.panelSize.height - panelConfig.panelMargin}`}
          />
        </g>
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-steel-dim">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#1a3a1a] border border-[#2a5a2a] rounded-sm" />
          <span>Main Board</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#1a3a4a] border border-[#2a5a7a] rounded-sm" />
          <span>Remote Board</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0 border-t border-dashed border-red-500" />
          <span>V-Score</span>
        </div>
      </div>

      {/* Panel stats */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-surface-500">
        <span>Boards: {1 + panelConfig.remoteBoards.length}</span>
        <span>V-Scores: {panelConfig.vScoreLines.length}</span>
        <span>
          Area: {(panelConfig.panelSize.width * panelConfig.panelSize.height / 100).toFixed(1)} cm²
        </span>
      </div>
    </div>
  )
}

export default PanelPreview
