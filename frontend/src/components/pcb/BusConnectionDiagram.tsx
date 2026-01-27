/**
 * Bus Connection Diagram Component
 *
 * Visualizes the bus topology showing:
 * - Block connections in a vertical flow
 * - Power provides/requires for each block
 * - Signal usage (I2C, SPI, GPIO)
 * - Power budget summary
 * - Multi-column blocks spanning their actual width
 * - Remote boards shown separately (not on bus)
 */

import { useMemo } from 'react'
import {
  ArrowDown,
  Zap,
  Battery,
  Cpu,
  Radio,
  Lightbulb,
  Cable,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Monitor,
  ToggleLeft,
  Usb,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockDefinition } from '../../schemas/block'
import type { PlacedBlock, RemoteBoard } from '../../db/schema'
import { calculatePowerBudget, getEffectiveSize, type PowerBudget } from '../../services/pcb-grid'

// =============================================================================
// Types
// =============================================================================

interface BusConnectionDiagramProps {
  /** Placed blocks with positions (main board) */
  placedBlocks: PlacedBlock[]
  /** Block definitions keyed by slug */
  blockDefinitions: Map<string, BlockDefinition>
  /** Remote boards (off-grid boards with their own placed blocks) */
  remoteBoards?: RemoteBoard[]
  /** Show as condensed table instead of visual diagram */
  variant?: 'diagram' | 'table'
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

const CATEGORY_COLORS: Record<string, string> = {
  mcu: 'text-blue-400',
  power: 'text-yellow-400',
  sensor: 'text-green-400',
  output: 'text-purple-400',
  connector: 'text-pink-400',
  utility: 'text-gray-400',
}

// =============================================================================
// Component
// =============================================================================

export function BusConnectionDiagram({
  placedBlocks,
  blockDefinitions,
  remoteBoards = [],
  variant = 'diagram',
  className,
}: BusConnectionDiagramProps) {
  // Separate main grid blocks from remote-type blocks (blocks with isRemote: true)
  const { gridBlocks, remoteTypeBlocks } = useMemo(() => {
    const grid: Array<{ placement: PlacedBlock; block: BlockDefinition }> = []
    const remote: Array<{ placement: PlacedBlock; block: BlockDefinition }> = []

    for (const placement of placedBlocks) {
      const block = blockDefinitions.get(placement.blockSlug)
      if (!block) continue

      // Remote-type blocks have isRemote: true and no gridSize
      if (block.isRemote || !block.gridSize) {
        remote.push({ placement, block })
      } else {
        grid.push({ placement, block })
      }
    }

    // Sort grid blocks by gridY first (top to bottom), then by gridX (left to right)
    grid.sort((a, b) => {
      if (a.placement.gridY !== b.placement.gridY) {
        return a.placement.gridY - b.placement.gridY
      }
      return a.placement.gridX - b.placement.gridX
    })

    return { gridBlocks: grid, remoteTypeBlocks: remote }
  }, [placedBlocks, blockDefinitions])

  // Alias for compatibility
  const sortedBlocks = gridBlocks

  // Group blocks by column for the diagram view, accounting for block width
  // A 2-wide block at column 0 should appear in BOTH column 0 and column 1
  const blocksByColumn = useMemo(() => {
    // First, determine the total number of columns needed
    let maxColumn = 0
    for (const item of sortedBlocks) {
      const [width] = getEffectiveSize(item.block, item.placement.rotation)
      maxColumn = Math.max(maxColumn, item.placement.gridX + width - 1)
    }

    // Create column arrays
    const columns = new Map<
      number,
      Array<{
        placement: PlacedBlock
        block: BlockDefinition
        isSpan: boolean
        spanStart: number
        spanWidth: number
      }>
    >()

    for (const item of sortedBlocks) {
      const [width] = getEffectiveSize(item.block, item.placement.rotation)
      const startCol = item.placement.gridX

      // Add this block to each column it spans
      for (let col = startCol; col < startCol + width; col++) {
        if (!columns.has(col)) {
          columns.set(col, [])
        }
        columns.get(col)!.push({
          ...item,
          isSpan: col !== startCol, // True if this is not the leftmost column of the block
          spanStart: startCol,
          spanWidth: width,
        })
      }
    }

    // Sort each column by gridY (top to bottom)
    for (const blocks of columns.values()) {
      blocks.sort((a, b) => a.placement.gridY - b.placement.gridY)
    }

    // Return sorted by column number
    return Array.from(columns.entries()).sort((a, b) => a[0] - b[0])
  }, [sortedBlocks])

  // Calculate power budget
  const powerBudget = useMemo(() => {
    const blocks = sortedBlocks.map((b) => b.block)
    return calculatePowerBudget(blocks)
  }, [sortedBlocks])

  if (sortedBlocks.length === 0) {
    return (
      <div className={clsx('text-center text-steel-dim py-8', className)}>
        <p className="text-sm">No blocks placed</p>
        <p className="text-xs mt-1">Add blocks to see bus connections</p>
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <BusConnectionTable blocks={sortedBlocks} powerBudget={powerBudget} className={className} />
    )
  }

  return (
    <div className={clsx('flex flex-col gap-6', className)}>
      {/* Main Board Bus Topology */}
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-sm font-medium text-steel">Main Board Bus Topology</h3>
          <p className="text-xs text-steel-dim mt-0.5">North → South signal flow per column</p>
        </div>

        {/* Columns side by side */}
        <div className="flex gap-4 justify-center flex-wrap">
          {blocksByColumn.map(([colNum, colBlocks]) => (
            <div key={colNum} className="flex flex-col items-center">
              {/* Column header */}
              <div className="text-xs font-medium text-steel-dim mb-2 px-2 py-0.5 bg-surface-800 rounded">
                Column {colNum}
              </div>

              {/* Block chain for this column */}
              <div className="flex flex-col items-center gap-1">
                {colBlocks.map((item, index) => (
                  <div
                    key={`${item.placement.blockId}-${colNum}`}
                    className="flex flex-col items-center"
                  >
                    {item.isSpan ? (
                      // This is a span column - show a connector indicating the block spans here
                      <SpanIndicator
                        block={item.block}
                        spanStart={item.spanStart}
                        spanWidth={item.spanWidth}
                        currentCol={colNum}
                        isFirst={index === 0}
                        isLast={index === colBlocks.length - 1}
                      />
                    ) : (
                      // This is the main column for this block
                      <BlockCard
                        block={item.block}
                        placement={item.placement}
                        isFirst={index === 0}
                        isLast={index === colBlocks.length - 1}
                        spanWidth={item.spanWidth}
                      />
                    )}
                    {index < colBlocks.length - 1 && (
                      <div className="flex flex-col items-center py-1">
                        <div className="w-0.5 h-3 bg-surface-600" />
                        <ArrowDown className="w-3 h-3 text-surface-500" />
                        <div className="text-[8px] text-surface-500 mt-0.5">ALL signals</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Power budget summary */}
        <PowerBudgetSummary budget={powerBudget} />
      </div>

      {/* Remote-Type Blocks Section (blocks with isRemote: true, not on main bus) */}
      {remoteTypeBlocks.length > 0 && (
        <RemoteTypeBlocksSection remoteTypeBlocks={remoteTypeBlocks} />
      )}

      {/* Remote Boards Section (separate board entities) */}
      {remoteBoards.length > 0 && (
        <RemoteBoardsSection remoteBoards={remoteBoards} blockDefinitions={blockDefinitions} />
      )}
    </div>
  )
}

// =============================================================================
// Span Indicator Component (for multi-column blocks)
// =============================================================================

interface SpanIndicatorProps {
  block: BlockDefinition
  spanStart: number
  spanWidth: number
  currentCol: number
  isFirst: boolean
  isLast: boolean
}

function SpanIndicator({
  block,
  spanStart,
  spanWidth,
  currentCol,
  isFirst,
  isLast,
}: SpanIndicatorProps) {
  const colorClass = CATEGORY_COLORS[block.category] || 'text-gray-400'
  const colPosition = currentCol - spanStart + 1 // 1-indexed position in span

  return (
    <div
      className={clsx(
        'w-48 border rounded-lg bg-surface-800/50 overflow-hidden',
        'border-dashed border-surface-500'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/30 border-b border-surface-600/50">
        <span className={clsx('text-xs font-medium truncate', colorClass)}>← {block.name}</span>
        <span className="text-[9px] text-steel-dim ml-auto">
          col {colPosition}/{spanWidth}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 text-xs text-steel-dim italic">Spans from column {spanStart}</div>

      {/* Edge indicators */}
      <div className="flex justify-between px-3 py-1 bg-surface-900/50 text-[8px] text-surface-500">
        <span>{isFirst ? '↑ North edge' : '↑ Bus in'}</span>
        <span>{isLast ? 'South edge ↓' : 'Bus out ↓'}</span>
      </div>
    </div>
  )
}

// =============================================================================
// Block Card Component
// =============================================================================

interface BlockCardProps {
  block: BlockDefinition
  placement: PlacedBlock
  isFirst: boolean
  isLast: boolean
  spanWidth?: number
}

function BlockCard({ block, placement, isFirst, isLast, spanWidth = 1 }: BlockCardProps) {
  const Icon = CATEGORY_ICONS[block.category] || Wrench
  const colorClass = CATEGORY_COLORS[block.category] || 'text-gray-400'

  // Collect what this block provides/uses
  const provides: string[] = []
  const requires: string[] = []
  const signals: string[] = []
  const taps: string[] = []

  // Power
  if (block.bus.power?.provides) {
    for (const p of block.bus.power.provides) {
      provides.push(`${p.rail} (${p.maxMa}mA)`)
    }
  }
  if (block.bus.power?.requires) {
    for (const r of block.bus.power.requires) {
      requires.push(`${r.rail} (${r.maxMa}mA max)`)
    }
  }

  // Interfaces
  if (block.bus.i2c?.addresses) {
    const addrs = block.bus.i2c.addresses
      .map((a) => `0x${a.toString(16).padStart(2, '0')}`)
      .join(', ')
    signals.push(`I2C: ${addrs}`)
  }
  // SPI - only show if it's a device (not master)
  if (block.bus.spi?.csPin && !block.bus.spi?.master) {
    signals.push(`SPI: ${block.bus.spi.csPin}`)
  }
  if (block.bus.gpio?.claims) {
    signals.push(`GPIO: ${block.bus.gpio.claims.join(', ')}`)
  }

  // 0R isolation resistors (taps)
  if (block.bus.taps && block.bus.taps.length > 0) {
    for (const tap of block.bus.taps) {
      taps.push(`${tap.reference}: ${tap.signal}`)
    }
  }

  return (
    <div
      className={clsx(
        'w-64 border rounded-lg bg-surface-800 overflow-hidden',
        'border-surface-600'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/50 border-b border-surface-600">
        <Icon className={clsx('w-4 h-4', colorClass)} />
        <span className="text-sm font-medium text-steel flex-1 truncate">{block.name}</span>
        {spanWidth > 1 && (
          <span className="text-[9px] bg-copper/20 text-copper px-1 rounded">{spanWidth}w</span>
        )}
        <span className="text-[10px] text-steel-dim font-mono">
          ({placement.gridX},{placement.gridY})
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1.5 text-xs">
        {provides.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-green-400 font-medium w-16 flex-shrink-0">Provides:</span>
            <span className="text-steel-dim">{provides.join(', ')}</span>
          </div>
        )}
        {requires.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 font-medium w-16 flex-shrink-0">Requires:</span>
            <span className="text-steel-dim">{requires.join(', ')}</span>
          </div>
        )}
        {signals.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-blue-400 font-medium w-16 flex-shrink-0">Signals:</span>
            <span className="text-steel-dim">{signals.join('; ')}</span>
          </div>
        )}
        {taps.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-medium w-16 flex-shrink-0">0R Taps:</span>
            <span className="text-steel-dim font-mono text-[10px]">{taps.join(', ')}</span>
          </div>
        )}
        {provides.length === 0 &&
          requires.length === 0 &&
          signals.length === 0 &&
          taps.length === 0 && <span className="text-steel-dim italic">Passthrough only</span>}
      </div>

      {/* Edge indicators */}
      <div className="flex justify-between px-3 py-1 bg-surface-900/50 text-[8px] text-surface-500">
        <span>{isFirst ? '↑ North edge' : '↑ Bus in'}</span>
        <span>{isLast ? 'South edge ↓' : 'Bus out ↓'}</span>
      </div>
    </div>
  )
}

// =============================================================================
// Power Budget Summary Component
// =============================================================================

interface PowerBudgetSummaryProps {
  budget: PowerBudget
}

function PowerBudgetSummary({ budget }: PowerBudgetSummaryProps) {
  const rails = ['3V3', '5V0', 'V3V3', 'VBUS', 'VBAT'] as const

  const railsWithData = rails.filter((rail) => budget.provides[rail] || budget.requires[rail])

  if (railsWithData.length === 0) {
    return null
  }

  const hasErrors = budget.errors.length > 0
  const hasWarnings = budget.warnings.length > 0

  return (
    <div className="border border-surface-600 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 text-sm font-medium',
          hasErrors
            ? 'bg-red-500/10 text-red-400'
            : hasWarnings
              ? 'bg-yellow-500/10 text-yellow-400'
              : 'bg-surface-700/50 text-steel'
        )}
      >
        <Zap className="w-4 h-4" />
        <span>Power Budget</span>
        {hasErrors && <AlertTriangle className="w-4 h-4 ml-auto" />}
        {!hasErrors && !hasWarnings && <CheckCircle2 className="w-4 h-4 ml-auto text-green-400" />}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-800/50 text-steel-dim">
              <th className="px-3 py-1.5 text-left font-medium">Rail</th>
              <th className="px-3 py-1.5 text-right font-medium">Provided</th>
              <th className="px-3 py-1.5 text-right font-medium">Required (max)</th>
              <th className="px-3 py-1.5 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {railsWithData.map((rail) => {
              const provided = budget.provides[rail] || 0
              const required = budget.requires[rail]?.max || 0
              const margin = budget.marginPercent[rail]
              const isOverBudget = margin !== undefined && margin < 0
              const isNearCapacity = margin !== undefined && margin < 20 && margin >= 0

              return (
                <tr key={rail} className="text-steel">
                  <td className="px-3 py-1.5 font-mono">{rail}</td>
                  <td className="px-3 py-1.5 text-right text-green-400">
                    {provided > 0 ? `${provided}mA` : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-yellow-400">
                    {required > 0 ? `${required}mA` : '-'}
                  </td>
                  <td
                    className={clsx(
                      'px-3 py-1.5 text-right font-medium',
                      isOverBudget && 'text-red-400',
                      isNearCapacity && 'text-yellow-400',
                      !isOverBudget && !isNearCapacity && 'text-green-400'
                    )}
                  >
                    {margin !== undefined ? `${Math.round(margin)}%` : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Errors/Warnings */}
      {(hasErrors || hasWarnings) && (
        <div className="px-3 py-2 border-t border-surface-600 space-y-1">
          {budget.errors.map((error, i) => (
            <p key={`error-${i}`} className="text-xs text-red-400">
              • {error}
            </p>
          ))}
          {budget.warnings.map((warning, i) => (
            <p key={`warning-${i}`} className="text-xs text-yellow-400">
              • {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Table Variant Component
// =============================================================================

interface BusConnectionTableProps {
  blocks: Array<{ placement: PlacedBlock; block: BlockDefinition }>
  powerBudget: PowerBudget
  className?: string
}

function BusConnectionTable({ blocks, powerBudget, className }: BusConnectionTableProps) {
  return (
    <div className={clsx('space-y-4', className)}>
      {/* Block table */}
      <div className="border border-surface-600 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-700/50 text-steel-dim">
              <th className="px-3 py-2 text-left font-medium">Block</th>
              <th className="px-3 py-2 text-left font-medium">Position</th>
              <th className="px-3 py-2 text-left font-medium">Size</th>
              <th className="px-3 py-2 text-left font-medium">Provides</th>
              <th className="px-3 py-2 text-left font-medium">Requires</th>
              <th className="px-3 py-2 text-left font-medium">Bus Signals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {blocks.map(({ placement, block }) => {
              const provides: string[] = []
              const requires: string[] = []
              const signals: string[] = []

              if (block.bus.power?.provides) {
                provides.push(...block.bus.power.provides.map((p) => `${p.rail}@${p.maxMa}mA`))
              }
              if (block.bus.power?.requires) {
                requires.push(...block.bus.power.requires.map((r) => `${r.rail}@${r.maxMa}mA`))
              }
              if (block.bus.i2c?.addresses) {
                signals.push(...block.bus.i2c.addresses.map((a) => `I2C:0x${a.toString(16)}`))
              }
              // SPI - only show if it's a device (not master)
              if (block.bus.spi?.csPin && !block.bus.spi?.master) {
                signals.push(`SPI:${block.bus.spi.csPin}`)
              }
              if (block.bus.gpio?.claims) {
                signals.push(...block.bus.gpio.claims.map((g) => `GPIO:${g}`))
              }
              // 0R taps
              if (block.bus.taps && block.bus.taps.length > 0) {
                signals.push(...block.bus.taps.map((t) => `${t.reference}:${t.signal}`))
              }

              return (
                <tr key={placement.blockId} className="text-steel">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{block.name}</div>
                    <div className="text-steel-dim font-mono text-[10px]">{block.slug}</div>
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    ({placement.gridX},{placement.gridY})
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {block.gridSize
                      ? `${block.gridSize[0]}x${block.gridSize[1]}`
                      : block.isRemote
                        ? 'Remote'
                        : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-green-400">
                    {provides.length > 0 ? provides.join(', ') : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-yellow-400">
                    {requires.length > 0 ? requires.join(', ') : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-blue-400 font-mono text-[10px]">
                    {signals.length > 0 ? signals.join(', ') : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Power summary */}
      <PowerBudgetSummary budget={powerBudget} />
    </div>
  )
}

// =============================================================================
// Remote-Type Blocks Section Component (blocks with isRemote: true)
// =============================================================================

interface RemoteTypeBlocksSectionProps {
  remoteTypeBlocks: Array<{ placement: PlacedBlock; block: BlockDefinition }>
}

function RemoteTypeBlocksSection({ remoteTypeBlocks }: RemoteTypeBlocksSectionProps) {
  return (
    <div className="border-t border-surface-600 pt-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-medium text-steel flex items-center justify-center gap-2">
          <Cable className="w-4 h-4 text-pink-400" />
          Remote-Type Blocks
        </h3>
        <p className="text-xs text-steel-dim mt-0.5">
          Blocks that connect via cable (not on main bus grid)
        </p>
      </div>

      {/* Blocks list */}
      <div className="flex gap-4 justify-center flex-wrap">
        {remoteTypeBlocks.map(({ placement, block }) => {
          const Icon = CATEGORY_ICONS[block.category] || Cable
          const colorClass = CATEGORY_COLORS[block.category] || 'text-pink-400'

          // Collect signals from the block
          const signals: string[] = []
          if (block.bus.i2c?.addresses) {
            signals.push(
              `I2C: ${block.bus.i2c.addresses.map((a) => `0x${a.toString(16)}`).join(', ')}`
            )
          }
          if (block.bus.gpio?.claims) {
            signals.push(`GPIO: ${block.bus.gpio.claims.join(', ')}`)
          }
          if (block.bus.spi?.csPin) {
            signals.push(`SPI: ${block.bus.spi.csPin}`)
          }

          // Get remote block properties
          const remoteProps = block.remote

          return (
            <div
              key={placement.blockId}
              className="w-64 border border-dashed border-pink-500/40 rounded-lg bg-pink-500/5 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/30 border-b border-surface-600/50">
                <Icon className={clsx('w-4 h-4', colorClass)} />
                <span className="text-sm font-medium text-steel flex-1 truncate">{block.name}</span>
                <Cable className="w-3 h-3 text-pink-400" />
              </div>

              {/* Content */}
              <div className="px-3 py-2 space-y-1.5 text-xs">
                {/* Cable connector type */}
                {remoteProps?.cable && (
                  <div className="flex items-start gap-2">
                    <span className="text-steel-dim font-medium w-16 flex-shrink-0">Cable:</span>
                    <span className="text-steel font-mono">
                      {remoteProps.cable.connectorType} ({remoteProps.cable.pinCount}p)
                    </span>
                  </div>
                )}

                {/* Mating connector */}
                {remoteProps?.matingConnectorSlug && (
                  <div className="flex items-start gap-2">
                    <span className="text-steel-dim font-medium w-16 flex-shrink-0">Mates:</span>
                    <span className="text-steel font-mono text-[10px]">
                      {remoteProps.matingConnectorSlug}
                    </span>
                  </div>
                )}

                {/* Bus signals */}
                {signals.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 font-medium w-16 flex-shrink-0">Signals:</span>
                    <span className="text-steel-dim">{signals.join('; ')}</span>
                  </div>
                )}

                {/* Physical size if available */}
                {remoteProps?.boardDimensions && (
                  <div className="flex items-start gap-2">
                    <span className="text-steel-dim font-medium w-16 flex-shrink-0">Size:</span>
                    <span className="text-steel font-mono">
                      {remoteProps.boardDimensions.width}x{remoteProps.boardDimensions.height}mm
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 py-1 bg-surface-900/50 text-[8px] text-surface-500 text-center">
                Connects via cable • Not on main bus
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Remote Boards Section Component (separate board entities)
// =============================================================================

const REMOTE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  button: ToggleLeft,
  display: Monitor,
  connector: Usb,
  custom: Cpu,
}

const REMOTE_TYPE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  button: { border: 'border-amber-500/50', bg: 'bg-amber-500/5', text: 'text-amber-400' },
  display: { border: 'border-cyan-500/50', bg: 'bg-cyan-500/5', text: 'text-cyan-400' },
  connector: { border: 'border-pink-500/50', bg: 'bg-pink-500/5', text: 'text-pink-400' },
  custom: { border: 'border-purple-500/50', bg: 'bg-purple-500/5', text: 'text-purple-400' },
}

interface RemoteBoardsSectionProps {
  remoteBoards: RemoteBoard[]
  blockDefinitions: Map<string, BlockDefinition>
}

function RemoteBoardsSection({ remoteBoards, blockDefinitions }: RemoteBoardsSectionProps) {
  return (
    <div className="border-t border-surface-600 pt-6">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-medium text-steel flex items-center justify-center gap-2">
          <Cable className="w-4 h-4 text-copper" />
          Remote Boards
        </h3>
        <p className="text-xs text-steel-dim mt-0.5">
          Off-grid boards connected via cable (not on main bus)
        </p>
      </div>

      {/* Remote boards list */}
      <div className="flex gap-6 justify-center flex-wrap">
        {remoteBoards.map((board) => {
          const typeColors = REMOTE_TYPE_COLORS[board.type] || REMOTE_TYPE_COLORS.custom
          const TypeIcon = REMOTE_TYPE_ICONS[board.type] || Cpu

          // Get block names on this remote board
          const blockNames = board.placedBlocks
            .map((p) => blockDefinitions.get(p.blockSlug)?.name || p.blockSlug)
            .filter(Boolean)

          return (
            <div
              key={board.id}
              className={clsx(
                'w-64 rounded-lg border overflow-hidden',
                typeColors.border,
                typeColors.bg
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/30 border-b border-surface-600/50">
                <TypeIcon className={clsx('w-4 h-4', typeColors.text)} />
                <span className="text-sm font-medium text-steel flex-1 truncate">{board.name}</span>
                <span className="text-[10px] text-steel-dim font-mono">
                  {board.boardSize.width}x{board.boardSize.height}mm
                </span>
              </div>

              {/* Content */}
              <div className="px-3 py-2 space-y-2 text-xs">
                {/* Blocks on this board */}
                {blockNames.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-steel-dim font-medium w-14 flex-shrink-0">Blocks:</span>
                    <span className="text-steel">{blockNames.join(', ')}</span>
                  </div>
                )}

                {/* Grid size */}
                <div className="flex items-start gap-2">
                  <span className="text-steel-dim font-medium w-14 flex-shrink-0">Grid:</span>
                  <span className="text-steel font-mono">
                    {board.gridWidth}x{board.gridHeight}
                  </span>
                </div>

                {/* Connection mappings */}
                {board.connectionMapping.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 font-medium w-14 flex-shrink-0">Signals:</span>
                    <div className="flex flex-col gap-0.5">
                      {board.connectionMapping.slice(0, 3).map((conn, i) => (
                        <span key={i} className="text-steel-dim font-mono text-[10px]">
                          {conn.remoteSignal} → {conn.mainSignal}
                        </span>
                      ))}
                      {board.connectionMapping.length > 3 && (
                        <span className="text-steel-dim text-[10px]">
                          +{board.connectionMapping.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {blockNames.length === 0 && board.connectionMapping.length === 0 && (
                  <span className="text-steel-dim italic">Empty board</span>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 py-1 bg-surface-900/50 text-[8px] text-surface-500 text-center flex items-center justify-center gap-1">
                <Cable className="w-2.5 h-2.5" />
                <span>Connected via {board.connectionMapping[0]?.connectorType || 'cable'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BusConnectionDiagram
