/**
 * AdminLangGraphPage - LangGraph workflow visualization and management
 *
 * Provides:
 * - Mermaid-based graph visualization
 * - Node (orchestrator prompt) editing
 * - Edge management
 * - Thread viewer with checkpoint history
 * - Interactive test runner
 * - State inspector
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, Play, Database, Settings, Network, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import {
  GraphViewer,
  NodeEditor,
  EdgeEditor,
  ThreadViewer,
  TestRunner,
  StateInspector,
} from '@/components/admin/langgraph'

type Tab = 'graph' | 'nodes' | 'edges' | 'threads' | 'test'

interface GraphData {
  mermaid: string
  nodes: Array<{ name: string; type: 'start' | 'end' | 'node' }>
  edges: Array<{ from: string; to: string; conditional: boolean; label?: string }>
}

export function AdminLangGraphPage() {
  const [activeTab, setActiveTab] = useState<Tab>('graph')
  const [selectedNode, setSelectedNode] = useState<string | undefined>()
  const [highlightedNode, setHighlightedNode] = useState<string | undefined>()
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()

  // Fetch graph data
  const {
    data: graphData,
    isLoading: isLoadingGraph,
    error: graphError,
  } = useQuery({
    queryKey: ['admin-langgraph-graph'],
    queryFn: async () => {
      const res = await fetch('/api/admin/langgraph/graph')
      if (!res.ok) throw new Error('Failed to fetch graph')
      return res.json() as Promise<GraphData>
    },
  })

  const tabs = [
    { id: 'graph' as const, label: 'Graph', icon: Network },
    { id: 'nodes' as const, label: 'Nodes', icon: Settings },
    { id: 'edges' as const, label: 'Edges', icon: GitBranch },
    { id: 'threads' as const, label: 'Threads', icon: Database },
    { id: 'test' as const, label: 'Test', icon: Play },
  ]

  // Get available node names for edge editor
  const availableNodes =
    graphData?.nodes.filter((n) => n.type === 'node').map((n) => n.name) || []

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-700 bg-surface-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-copper" />
            <div>
              <h1 className="text-lg font-semibold text-steel">LangGraph</h1>
              <p className="text-xs text-steel-dim">Workflow visualization and management</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t transition-colors',
                  isActive
                    ? 'bg-surface-800 text-copper border-t border-x border-surface-700'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-800/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Panel */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'graph' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-medium text-steel mb-3">Workflow Graph</h2>
                <GraphViewer
                  mermaidCode={graphData?.mermaid || ''}
                  nodes={graphData?.nodes || []}
                  edges={graphData?.edges || []}
                  highlightNode={highlightedNode || selectedNode}
                  onNodeClick={(name) => {
                    setSelectedNode(name)
                    setActiveTab('nodes')
                  }}
                  isLoading={isLoadingGraph}
                  error={graphError?.message}
                />
              </div>

              {/* Graph Legend */}
              <div className="flex flex-wrap gap-4 text-xs text-steel-dim">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500" />
                  Start/End nodes
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-surface-700 border border-surface-600" />
                  Regular nodes
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-surface-600" />
                  Static edge
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 border-t border-dashed border-surface-600" />
                  Conditional edge
                </div>
              </div>
            </div>
          )}

          {activeTab === 'nodes' && (
            <div>
              <h2 className="text-sm font-medium text-steel mb-3">Orchestrator Nodes</h2>
              <p className="text-xs text-steel-dim mb-4">
                Edit system prompts for each orchestrator agent. Changes are saved to the database.
              </p>
              <NodeEditor selectedNode={selectedNode} onNodeSelect={setSelectedNode} />
            </div>
          )}

          {activeTab === 'edges' && (
            <div>
              <h2 className="text-sm font-medium text-steel mb-3">Workflow Edges</h2>
              <p className="text-xs text-steel-dim mb-4">
                Define transitions between nodes. Conditional edges require a condition expression.
              </p>
              <EdgeEditor availableNodes={availableNodes} />
            </div>
          )}

          {activeTab === 'threads' && (
            <div className="flex gap-6">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-steel mb-3">Checkpointed Threads</h2>
                <p className="text-xs text-steel-dim mb-4">
                  View and manage LangGraph threads. Each thread has a history of checkpoints.
                </p>
                <ThreadViewer
                  selectedThreadId={selectedThreadId}
                  onSelectThread={setSelectedThreadId}
                />
              </div>

              {/* State Inspector Panel */}
              <div className="w-96 border-l border-surface-700 pl-6">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4 text-steel-dim" />
                  <h3 className="text-sm font-medium text-steel">State Inspector</h3>
                </div>
                <StateInspector threadId={selectedThreadId || null} />
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="flex gap-6">
              {/* Test Runner */}
              <div className="flex-1">
                <h2 className="text-sm font-medium text-steel mb-3">Test Runner</h2>
                <p className="text-xs text-steel-dim mb-4">
                  Send test messages to the LangGraph and see the execution trace.
                </p>
                <TestRunner onHighlightNode={setHighlightedNode} />
              </div>

              {/* Live Graph View */}
              <div className="w-96 border-l border-surface-700 pl-6">
                <h3 className="text-sm font-medium text-steel mb-3">Live Graph</h3>
                <GraphViewer
                  mermaidCode={graphData?.mermaid || ''}
                  nodes={graphData?.nodes || []}
                  edges={graphData?.edges || []}
                  highlightNode={highlightedNode}
                  isLoading={isLoadingGraph}
                  error={graphError?.message}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
