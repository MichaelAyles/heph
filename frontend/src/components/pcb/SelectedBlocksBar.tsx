/**
 * SelectedBlocksBar - Display selected blocks with summary stats
 */

import { XCircle } from 'lucide-react'
import type { PlacedBlock } from '../../db/schema'

interface SelectedBlocksBarProps {
  selectedBlocks: PlacedBlock[]
  onRemoveBlock: (blockId: string) => void
  summary?: {
    blockCount: number
    i2cDevices: string[]
    spiDevices: string[]
    gpioUsage: string[]
  } | null
}

export function SelectedBlocksBar({
  selectedBlocks,
  onRemoveBlock,
  summary,
}: SelectedBlocksBarProps) {
  if (selectedBlocks.length === 0) return null

  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-steel">Selected Blocks</h3>
        {summary && (
          <span className="text-xs text-steel-dim">
            {summary.blockCount} blocks • {summary.i2cDevices.length} I2C •{' '}
            {summary.spiDevices.length} SPI • {summary.gpioUsage.length} GPIO
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedBlocks.map((placed) => (
          <div
            key={placed.blockId}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border border-surface-600 rounded"
          >
            <span className="text-sm text-steel">{placed.blockSlug}</span>
            <span className="text-xs text-steel-dim font-mono">
              ({placed.gridX},{placed.gridY})
            </span>
            <button
              onClick={() => onRemoveBlock(placed.blockId)}
              className="text-red-400 hover:text-red-300"
              title="Remove block"
            >
              <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
