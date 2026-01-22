/**
 * EdgeEditor - CRUD editor for orchestrator edges
 *
 * Manages workflow transitions between nodes.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Plus,
  Trash2,
  Save,
  GitBranch,
  RefreshCw,
  ArrowLeftRight,
} from 'lucide-react'
import { clsx } from 'clsx'

interface OrchestratorEdge {
  id: number
  fromNode: string
  toNode: string
  edgeType: 'flow' | 'conditional' | 'loop'
  condition: string | null
  priority: number
  description: string | null
  isActive: boolean
}

interface EdgeEditorProps {
  availableNodes: string[]
}

const EDGE_TYPE_ICONS = {
  flow: ArrowRight,
  conditional: GitBranch,
  loop: RefreshCw,
}

const EDGE_TYPE_COLORS = {
  flow: 'text-blue-400',
  conditional: 'text-amber-400',
  loop: 'text-purple-400',
}

export function EdgeEditor({ availableNodes }: EdgeEditorProps) {
  const queryClient = useQueryClient()
  const [isAddingEdge, setIsAddingEdge] = useState(false)
  const [newEdge, setNewEdge] = useState({
    fromNode: '',
    toNode: '',
    edgeType: 'flow' as 'flow' | 'conditional' | 'loop',
    condition: '',
    description: '',
  })

  // Fetch edges
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orchestrator-edges'],
    queryFn: async () => {
      const res = await fetch('/api/admin/orchestrator/edges')
      if (!res.ok) throw new Error('Failed to fetch edges')
      return res.json() as Promise<{ edges: OrchestratorEdge[] }>
    },
  })

  // Create edge mutation
  const createMutation = useMutation({
    mutationFn: async (edge: typeof newEdge) => {
      const res = await fetch('/api/admin/orchestrator/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_node: edge.fromNode,
          to_node: edge.toNode,
          edge_type: edge.edgeType,
          condition: edge.condition || null,
          description: edge.description || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create edge')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orchestrator-edges'] })
      setIsAddingEdge(false)
      setNewEdge({
        fromNode: '',
        toNode: '',
        edgeType: 'flow',
        condition: '',
        description: '',
      })
    },
  })

  // Delete edge mutation
  const deleteMutation = useMutation({
    mutationFn: async (edgeId: number) => {
      const res = await fetch(`/api/admin/orchestrator/edges/${edgeId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete edge')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orchestrator-edges'] })
    },
  })

  // Group edges by source node
  const groupedEdges =
    data?.edges.reduce(
      (acc, edge) => {
        if (!acc[edge.fromNode]) {
          acc[edge.fromNode] = []
        }
        acc[edge.fromNode].push(edge)
        return acc
      },
      {} as Record<string, OrchestratorEdge[]>
    ) || {}

  if (isLoading) {
    return <div className="text-steel-dim text-sm">Loading edges...</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm">Failed to load edges</div>
  }

  return (
    <div className="space-y-4">
      {/* Add Edge Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsAddingEdge(!isAddingEdge)}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors',
            isAddingEdge
              ? 'bg-surface-700 text-steel'
              : 'bg-copper text-surface-900 hover:bg-copper/90'
          )}
        >
          <Plus className="w-4 h-4" />
          {isAddingEdge ? 'Cancel' : 'Add Edge'}
        </button>
      </div>

      {/* Add Edge Form */}
      {isAddingEdge && (
        <div className="p-4 bg-surface-800 border border-surface-700 rounded-lg space-y-4">
          <h4 className="text-sm font-medium text-steel">New Edge</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-dim mb-1">From Node</label>
              <select
                value={newEdge.fromNode}
                onChange={(e) => setNewEdge({ ...newEdge, fromNode: e.target.value })}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
              >
                <option value="">Select node...</option>
                {availableNodes.map((node) => (
                  <option key={node} value={node}>
                    {node}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-steel-dim mb-1">To Node</label>
              <select
                value={newEdge.toNode}
                onChange={(e) => setNewEdge({ ...newEdge, toNode: e.target.value })}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
              >
                <option value="">Select node...</option>
                {availableNodes.map((node) => (
                  <option key={node} value={node}>
                    {node}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-dim mb-1">Edge Type</label>
              <select
                value={newEdge.edgeType}
                onChange={(e) =>
                  setNewEdge({
                    ...newEdge,
                    edgeType: e.target.value as 'flow' | 'conditional' | 'loop',
                  })
                }
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
              >
                <option value="flow">Flow (always)</option>
                <option value="conditional">Conditional</option>
                <option value="loop">Loop</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-steel-dim mb-1">
                Condition (for conditional edges)
              </label>
              <input
                type="text"
                value={newEdge.condition}
                onChange={(e) => setNewEdge({ ...newEdge, condition: e.target.value })}
                placeholder='e.g., {"field": "score", "operator": ">=", "value": 85}'
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
                disabled={newEdge.edgeType === 'flow'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-steel-dim mb-1">Description</label>
            <input
              type="text"
              value={newEdge.description}
              onChange={(e) => setNewEdge({ ...newEdge, description: e.target.value })}
              placeholder="Optional description..."
              className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => createMutation.mutate(newEdge)}
              disabled={!newEdge.fromNode || !newEdge.toNode || createMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-copper text-surface-900 hover:bg-copper/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {createMutation.isPending ? 'Creating...' : 'Create Edge'}
            </button>
          </div>
        </div>
      )}

      {/* Grouped Edges List */}
      <div className="space-y-4">
        {Object.entries(groupedEdges).map(([fromNode, edges]) => (
          <div key={fromNode} className="border border-surface-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-surface-800 border-b border-surface-700">
              <span className="font-mono text-sm text-steel">{fromNode}</span>
              <span className="text-steel-dim text-xs ml-2">({edges.length} edges)</span>
            </div>

            <div className="divide-y divide-surface-700">
              {edges.map((edge) => {
                const Icon = EDGE_TYPE_ICONS[edge.edgeType]
                return (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between px-4 py-2 hover:bg-surface-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={clsx('w-4 h-4', EDGE_TYPE_COLORS[edge.edgeType])} />
                      <ArrowLeftRight className="w-3 h-3 text-steel-dim" />
                      <span className="font-mono text-sm text-steel">{edge.toNode}</span>
                      {edge.condition && (
                        <span className="text-xs text-steel-dim bg-surface-700 px-2 py-0.5 rounded">
                          {edge.condition.substring(0, 30)}
                          {edge.condition.length > 30 ? '...' : ''}
                        </span>
                      )}
                      {edge.description && (
                        <span className="text-xs text-steel-dim">{edge.description}</span>
                      )}
                    </div>

                    <button
                      onClick={() => deleteMutation.mutate(edge.id)}
                      disabled={deleteMutation.isPending}
                      className="p-1 text-steel-dim hover:text-red-400 transition-colors"
                      title="Delete edge"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {Object.keys(groupedEdges).length === 0 && (
          <p className="text-sm text-steel-dim py-4 text-center">
            No edges defined. Add edges to create workflow transitions.
          </p>
        )}
      </div>
    </div>
  )
}
