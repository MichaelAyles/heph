/**
 * StructureViewer - Read-only view of the graph structure
 *
 * Displays the code-defined graph hierarchy as a tree view:
 * - Orchestrator (parent graph)
 *   - Spec Stage subgraph
 *   - PCB Stage subgraph
 *   - Enclosure Stage subgraph
 *   - Firmware Stage subgraph
 *   - Export Stage subgraph
 *
 * Shows nodes and edges for each graph.
 */

import { useState } from 'react'
import { clsx } from 'clsx'
import {
  ChevronDown,
  ChevronRight,
  Network,
  Layers,
  Circle,
  ArrowRight,
  GitBranch,
  Box,
} from 'lucide-react'
import type { SubgraphDefinition, CodeDefinedGraphData } from '../../../types/langgraph'

export interface StructureViewerProps {
  /** The graph data to display */
  graphData: CodeDefinedGraphData | null
  /** Whether the data is loading */
  isLoading?: boolean
  /** Error message if any */
  error?: string | null
}

interface GraphSectionProps {
  graph: SubgraphDefinition
  isOpen: boolean
  onToggle: () => void
  isOrchestrator?: boolean
}

function GraphSection({ graph, isOpen, onToggle, isOrchestrator = false }: GraphSectionProps) {
  return (
    <div className="border border-surface-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          isOrchestrator ? 'bg-copper/10 hover:bg-copper/15' : 'bg-surface-800 hover:bg-surface-700'
        )}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-steel-dim" />
        ) : (
          <ChevronRight className="w-4 h-4 text-steel-dim" />
        )}
        {isOrchestrator ? (
          <Network className="w-5 h-5 text-copper" />
        ) : (
          <Layers className="w-5 h-5 text-blue-400" />
        )}
        <div className="flex-1">
          <div className="text-sm font-medium text-steel">{graph.displayName}</div>
          <div className="text-xs text-steel-dim">
            {graph.nodes.length} nodes, {graph.edges.length} edges
          </div>
        </div>
        {graph.stage && (
          <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-steel-dim">
            {graph.stage}
          </span>
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-4 py-3 bg-surface-900 border-t border-surface-700 space-y-4">
          {/* Nodes */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-medium text-steel-dim mb-2">
              <Box className="w-3.5 h-3.5" />
              Nodes
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {graph.nodes.map((node) => (
                <div
                  key={node.name}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-sm',
                    node.type === 'start' && 'bg-indigo-500/10 text-indigo-400',
                    node.type === 'end' && 'bg-rose-500/10 text-rose-400',
                    node.type === 'node' && 'bg-surface-800 text-steel'
                  )}
                >
                  <Circle
                    className={clsx(
                      'w-2.5 h-2.5',
                      node.type === 'start' && 'fill-indigo-500 text-indigo-500',
                      node.type === 'end' && 'fill-rose-500 text-rose-500',
                      node.type === 'node' && 'fill-blue-500 text-blue-500'
                    )}
                  />
                  <span className="truncate">{node.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edges */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-medium text-steel-dim mb-2">
              <GitBranch className="w-3.5 h-3.5" />
              Edges
            </h4>
            <div className="space-y-1">
              {graph.edges.map((edge, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1 text-xs bg-surface-800 rounded"
                >
                  <span className="text-steel font-mono">
                    {edge.from === '__start__' ? 'START' : edge.from}
                  </span>
                  <ArrowRight
                    className={clsx(
                      'w-3 h-3',
                      edge.conditional ? 'text-amber-500' : 'text-steel-dim'
                    )}
                  />
                  <span className="text-steel font-mono">
                    {edge.to === '__end__' ? 'END' : edge.to}
                  </span>
                  {edge.label && (
                    <span className="ml-auto text-steel-dim italic truncate max-w-[150px]">
                      {edge.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function StructureViewer({ graphData, isLoading, error }: StructureViewerProps) {
  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['orchestrator']))

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-copper border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (!graphData) {
    return <div className="p-4 text-center text-steel-dim">No graph data available</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-steel">Graph Structure</h3>
          <p className="text-xs text-steel-dim mt-1">
            Code-defined orchestrator with {Object.keys(graphData.subgraphs).length} stage subgraphs
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-steel-dim">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-copper" />
            Orchestrator
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Subgraph
          </span>
        </div>
      </div>

      {/* Orchestrator (parent graph) */}
      <GraphSection
        graph={graphData.orchestrator}
        isOpen={expandedSections.has('orchestrator')}
        onToggle={() => toggleSection('orchestrator')}
        isOrchestrator
      />

      {/* Subgraphs */}
      <div className="ml-4 border-l-2 border-surface-700 pl-4 space-y-3">
        {Object.entries(graphData.subgraphs).map(([key, subgraph]) => (
          <GraphSection
            key={key}
            graph={subgraph}
            isOpen={expandedSections.has(key)}
            onToggle={() => toggleSection(key)}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-xs text-steel-dim pt-4 border-t border-surface-700">
        <div>
          <span className="font-medium text-steel">{graphData.allNodes.length}</span> total nodes
        </div>
        <div>
          <span className="font-medium text-steel">6</span> graphs
        </div>
        <div className="text-amber-500/70">Read-only structure from code</div>
      </div>
    </div>
  )
}
