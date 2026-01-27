/**
 * RemoteTypeBlocksPreview - Preview of remote-type blocks in the PCB grid view
 *
 * Shows blocks that have isRemote: true (connect via cable, not on main grid bus)
 */

import { useMemo } from 'react'
import { clsx } from 'clsx'
import { Cable, Cpu, Battery, Radio, Lightbulb, Wrench } from 'lucide-react'
import type { PlacedBlock } from '../../db/schema'
import type { BlockDefinition } from '../../schemas/block'

// =============================================================================
// Types
// =============================================================================

interface RemoteTypeBlocksPreviewProps {
  /** Placed blocks (will filter to only remote-type) */
  placedBlocks: PlacedBlock[]
  /** Block definitions keyed by slug */
  blockDefinitions: Map<string, BlockDefinition>
  /** Additional class names */
  className?: string
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mcu: Cpu,
  power: Battery,
  sensor: Radio,
  output: Lightbulb,
  connector: Cable,
  utility: Wrench,
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  mcu: { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400' },
  power: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', text: 'text-yellow-400' },
  sensor: { bg: 'bg-green-500/10', border: 'border-green-500/40', text: 'text-green-400' },
  output: { bg: 'bg-purple-500/10', border: 'border-purple-500/40', text: 'text-purple-400' },
  connector: { bg: 'bg-pink-500/10', border: 'border-pink-500/40', text: 'text-pink-400' },
  utility: { bg: 'bg-gray-500/10', border: 'border-gray-500/40', text: 'text-gray-400' },
}

// =============================================================================
// Component
// =============================================================================

export function RemoteTypeBlocksPreview({
  placedBlocks,
  blockDefinitions,
  className,
}: RemoteTypeBlocksPreviewProps) {
  // Filter to only remote-type blocks
  const remoteTypeBlocks = useMemo(() => {
    return placedBlocks
      .map((placement) => ({
        placement,
        block: blockDefinitions.get(placement.blockSlug),
      }))
      .filter(
        (item): item is { placement: PlacedBlock; block: BlockDefinition } =>
          item.block !== undefined && (item.block.isRemote === true || !item.block.gridSize)
      )
  }, [placedBlocks, blockDefinitions])

  if (remoteTypeBlocks.length === 0) {
    return null
  }

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Cable className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-medium text-steel">Cable-Connected Blocks</span>
        <span className="text-xs text-steel-dim">({remoteTypeBlocks.length})</span>
      </div>

      {/* Block cards */}
      <div className="flex flex-col gap-2">
        {remoteTypeBlocks.map(({ placement, block }) => {
          const colors = CATEGORY_COLORS[block.category] || CATEGORY_COLORS.utility
          const Icon = CATEGORY_ICONS[block.category] || Cable
          const remoteProps = block.remote

          return (
            <div
              key={placement.blockId}
              className={clsx('rounded-lg border p-3', 'border-dashed', colors.border, colors.bg)}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <Icon className={clsx('w-4 h-4', colors.text)} />
                <span className="text-sm font-medium text-steel truncate">{block.name}</span>
              </div>

              {/* Details */}
              <div className="space-y-1 text-[10px]">
                {remoteProps?.cable && (
                  <div className="flex items-center gap-1.5">
                    <Cable className="w-3 h-3 text-steel-dim" />
                    <span className="text-steel-dim">
                      {remoteProps.cable.connectorType} ({remoteProps.cable.pinCount}p)
                    </span>
                  </div>
                )}

                {remoteProps?.matingConnectorSlug && (
                  <div className="text-steel-dim">
                    Mates with: <span className="font-mono">{remoteProps.matingConnectorSlug}</span>
                  </div>
                )}

                {remoteProps?.boardDimensions && (
                  <div className="text-steel-dim">
                    {remoteProps.boardDimensions.width}x{remoteProps.boardDimensions.height}mm
                  </div>
                )}

                {/* Bus signals */}
                {(block.bus.i2c?.addresses || block.bus.gpio?.claims) && (
                  <div className="text-blue-400 font-mono">
                    {block.bus.i2c?.addresses && (
                      <span>
                        I2C: {block.bus.i2c.addresses.map((a) => `0x${a.toString(16)}`).join(', ')}
                      </span>
                    )}
                    {block.bus.gpio?.claims && (
                      <span className="ml-2">GPIO: {block.bus.gpio.claims.join(', ')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default RemoteTypeBlocksPreview
