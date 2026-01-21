/**
 * Tap Configuration Table Component
 *
 * Displays configured 0R resistor taps with fit/nofit status.
 * Shows block name, reference, signal, status, and reasoning.
 */

import { clsx } from 'clsx'
import { Check, X, AlertTriangle } from 'lucide-react'
import type { ResistorTapState } from '../../db/schema'
import type { TapConfigResponse } from '../../prompts/tap-configuration'

// =============================================================================
// Types
// =============================================================================

export interface TapConfigTableProps {
  tapStates: ResistorTapState[]
  conflicts?: TapConfigResponse['conflicts']
  onToggleTap?: (blockSlug: string, reference: string, newState: boolean) => void
  readonly?: boolean
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function TapConfigTable({
  tapStates,
  conflicts = [],
  onToggleTap,
  readonly = false,
  className,
}: TapConfigTableProps) {
  if (tapStates.length === 0) {
    return (
      <div className={clsx('text-center py-8 text-steel-dim', className)}>
        No tap configurations available
      </div>
    )
  }

  // Group taps by block
  const tapsByBlock = new Map<string, ResistorTapState[]>()
  for (const tap of tapStates) {
    const existing = tapsByBlock.get(tap.blockSlug) || []
    existing.push(tap)
    tapsByBlock.set(tap.blockSlug, existing)
  }

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium text-sm">Configuration Conflicts</span>
          </div>
          <ul className="space-y-1">
            {conflicts.map((conflict, i) => (
              <li key={i} className="text-xs text-amber-300">
                <span className="font-mono bg-amber-500/20 px-1 rounded">{conflict.type}</span>:{' '}
                {conflict.description}
                {conflict.resolution && (
                  <span className="text-amber-400/80"> - {conflict.resolution}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="text-left py-2 px-3 text-xs font-medium text-steel-dim uppercase tracking-wider">
                Block
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-steel-dim uppercase tracking-wider">
                Ref
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-steel-dim uppercase tracking-wider">
                Signal
              </th>
              <th className="text-center py-2 px-3 text-xs font-medium text-steel-dim uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-steel-dim uppercase tracking-wider">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from(tapsByBlock.entries()).map(([blockSlug, taps]) =>
              taps.map((tap, i) => (
                <tr
                  key={`${blockSlug}-${tap.reference}`}
                  className={clsx(
                    'border-b border-surface-800 hover:bg-surface-800/50 transition-colors',
                    i === 0 && 'border-t border-surface-700'
                  )}
                >
                  {/* Block name (only show on first row of block) */}
                  <td className="py-2 px-3">
                    {i === 0 && (
                      <span className="font-medium text-steel">{blockSlug}</span>
                    )}
                  </td>

                  {/* Reference */}
                  <td className="py-2 px-3">
                    <span className="font-mono text-copper">{tap.reference}</span>
                  </td>

                  {/* Signal */}
                  <td className="py-2 px-3">
                    <span className="font-mono text-steel-dim">{tap.signal}</span>
                  </td>

                  {/* Status */}
                  <td className="py-2 px-3">
                    <div className="flex justify-center">
                      {!readonly && onToggleTap ? (
                        <button
                          onClick={() => onToggleTap(tap.blockSlug, tap.reference, !tap.populated)}
                          className={clsx(
                            'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                            tap.populated
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          )}
                        >
                          {tap.populated ? (
                            <>
                              <Check className="w-3 h-3" />
                              Fit
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              NoFit
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          className={clsx(
                            'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                            tap.populated
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          )}
                        >
                          {tap.populated ? (
                            <>
                              <Check className="w-3 h-3" />
                              Fit
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              NoFit
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Reason */}
                  <td className="py-2 px-3">
                    <span className="text-steel-dim text-xs">{tap.reason}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-steel-dim border-t border-surface-700 pt-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>
            {tapStates.filter((t) => t.populated).length} Fit
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span>
            {tapStates.filter((t) => !t.populated).length} NoFit (DNP)
          </span>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Compact Variant
// =============================================================================

export interface TapConfigSummaryProps {
  tapStates: ResistorTapState[]
  hasConflicts?: boolean
  className?: string
}

export function TapConfigSummary({ tapStates, hasConflicts = false, className }: TapConfigSummaryProps) {
  const fitCount = tapStates.filter((t) => t.populated).length
  const nofitCount = tapStates.filter((t) => !t.populated).length

  return (
    <div
      className={clsx(
        'flex items-center gap-3 text-xs',
        hasConflicts && 'text-amber-400',
        !hasConflicts && 'text-steel-dim',
        className
      )}
    >
      {hasConflicts && <AlertTriangle className="w-3 h-3" />}
      <span>
        {tapStates.length} taps: {fitCount} fit, {nofitCount} nofit
      </span>
    </div>
  )
}

export default TapConfigTable
