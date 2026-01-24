/**
 * SubgraphSelector - Dropdown for selecting which graph to visualize
 *
 * Allows switching between the orchestrator (parent) graph and
 * the 5 stage subgraphs: spec, pcb, enclosure, firmware, export.
 */

import { clsx } from 'clsx'
import { ChevronDown, Network, Layers } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { SubgraphId, SubgraphOption } from '../../../types/langgraph'

export interface SubgraphSelectorProps {
  /** Currently selected graph */
  selectedGraph: SubgraphId
  /** Callback when selection changes */
  onSelect: (graphId: SubgraphId) => void
  /** Available subgraph options with metadata */
  options: SubgraphOption[]
  /** Optional className */
  className?: string
}

const SUBGRAPH_ICONS: Record<SubgraphId, string> = {
  orchestrator: 'Parent',
  spec: 'Spec',
  pcb: 'PCB',
  enclosure: 'Encl',
  firmware: 'Firm',
  export: 'Exp',
}

export function SubgraphSelector({
  selectedGraph,
  onSelect,
  options,
  className,
}: SubgraphSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((o) => o.id === selectedGraph)

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {/* Selected value button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
          'bg-surface-800 border border-surface-600 hover:border-surface-500',
          'text-steel text-sm font-medium min-w-[200px]'
        )}
      >
        {selectedGraph === 'orchestrator' ? (
          <Network className="w-4 h-4 text-copper" />
        ) : (
          <Layers className="w-4 h-4 text-blue-400" />
        )}
        <span className="flex-1 text-left">{selectedOption?.label || 'Select Graph'}</span>
        <span className="text-xs text-steel-dim">{selectedOption?.nodeCount} nodes</span>
        <ChevronDown
          className={clsx('w-4 h-4 text-steel-dim transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            'absolute top-full left-0 mt-1 w-full z-50',
            'bg-surface-800 border border-surface-600 rounded-lg shadow-xl',
            'py-1 max-h-80 overflow-auto'
          )}
        >
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                onSelect(option.id)
                setIsOpen(false)
              }}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                option.id === selectedGraph
                  ? 'bg-copper/10 text-copper'
                  : 'text-steel hover:bg-surface-700'
              )}
            >
              {/* Icon badge */}
              <span
                className={clsx(
                  'flex items-center justify-center w-8 h-5 rounded text-[10px] font-bold',
                  option.id === 'orchestrator'
                    ? 'bg-copper/20 text-copper'
                    : 'bg-blue-500/20 text-blue-400'
                )}
              >
                {SUBGRAPH_ICONS[option.id]}
              </span>

              {/* Label and description */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{option.label}</div>
                <div className="text-xs text-steel-dim truncate">{option.description}</div>
              </div>

              {/* Node count */}
              <span className="text-xs text-steel-dim">{option.nodeCount}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
