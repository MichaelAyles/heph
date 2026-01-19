/**
 * Bus Connection Diagram Component
 *
 * Visualizes the bus topology showing:
 * - Block connections in a vertical flow
 * - Power provides/requires for each block
 * - Signal usage (I2C, SPI, GPIO)
 * - Power budget summary
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
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockDefinition } from '../../schemas/block'
import type { PlacedBlock } from '../../db/schema'
import { calculatePowerBudget, type PowerBudget } from '../../services/pcb-grid'

// =============================================================================
// Types
// =============================================================================

interface BusConnectionDiagramProps {
  /** Placed blocks with positions */
  placedBlocks: PlacedBlock[]
  /** Block definitions keyed by slug */
  blockDefinitions: Map<string, BlockDefinition>
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
  variant = 'diagram',
  className,
}: BusConnectionDiagramProps) {
  // Get block definitions in placement order (sorted by row, then column)
  const sortedBlocks = useMemo(() => {
    const blocksWithDefs = placedBlocks
      .map((placement) => ({
        placement,
        block: blockDefinitions.get(placement.blockSlug),
      }))
      .filter((b): b is { placement: PlacedBlock; block: BlockDefinition } => b.block !== undefined)

    // Sort by gridY first (top to bottom), then by gridX (left to right)
    return blocksWithDefs.sort((a, b) => {
      if (a.placement.gridY !== b.placement.gridY) {
        return a.placement.gridY - b.placement.gridY
      }
      return a.placement.gridX - b.placement.gridX
    })
  }, [placedBlocks, blockDefinitions])

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
    return <BusConnectionTable blocks={sortedBlocks} powerBudget={powerBudget} className={className} />
  }

  return (
    <div className={clsx('flex flex-col gap-4', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-sm font-medium text-steel">Bus Topology</h3>
        <p className="text-xs text-steel-dim mt-0.5">North → South signal flow</p>
      </div>

      {/* Block chain */}
      <div className="flex flex-col items-center gap-1">
        {sortedBlocks.map((item, index) => (
          <div key={item.placement.blockId} className="flex flex-col items-center">
            <BlockCard
              block={item.block}
              placement={item.placement}
              isFirst={index === 0}
              isLast={index === sortedBlocks.length - 1}
            />
            {index < sortedBlocks.length - 1 && (
              <div className="flex flex-col items-center py-1">
                <div className="w-0.5 h-3 bg-surface-600" />
                <ArrowDown className="w-3 h-3 text-surface-500" />
                <div className="text-[8px] text-surface-500 mt-0.5">ALL signals</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Power budget summary */}
      <PowerBudgetSummary budget={powerBudget} />
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
}

function BlockCard({ block, placement, isFirst, isLast }: BlockCardProps) {
  const Icon = CATEGORY_ICONS[block.category] || Wrench
  const colorClass = CATEGORY_COLORS[block.category] || 'text-gray-400'

  // Collect what this block provides/uses
  const provides: string[] = []
  const requires: string[] = []
  const signals: string[] = []

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
    const addrs = block.bus.i2c.addresses.map((a) => `0x${a.toString(16).padStart(2, '0')}`).join(', ')
    signals.push(`I2C: ${addrs}`)
  }
  if (block.bus.spi?.csPin) {
    signals.push(`SPI: ${block.bus.spi.csPin}`)
  }
  if (block.bus.gpio?.claims) {
    signals.push(`GPIO: ${block.bus.gpio.claims.join(', ')}`)
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
        {provides.length === 0 && requires.length === 0 && signals.length === 0 && (
          <span className="text-steel-dim italic">Passthrough only</span>
        )}
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

  const railsWithData = rails.filter(
    (rail) => budget.provides[rail] || budget.requires[rail]
  )

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
          hasErrors ? 'bg-red-500/10 text-red-400' : hasWarnings ? 'bg-yellow-500/10 text-yellow-400' : 'bg-surface-700/50 text-steel'
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
              if (block.bus.spi?.csPin) {
                signals.push(`SPI:${block.bus.spi.csPin}`)
              }
              if (block.bus.gpio?.claims) {
                signals.push(...block.bus.gpio.claims.map((g) => `GPIO:${g}`))
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
                    {block.gridSize[0]}x{block.gridSize[1]}
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

export default BusConnectionDiagram
