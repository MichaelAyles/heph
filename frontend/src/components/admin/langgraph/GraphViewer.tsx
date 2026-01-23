/**
 * GraphViewer - Mermaid-based LangGraph visualization
 *
 * Renders the workflow graph using Mermaid diagrams.
 */

import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { logger } from '@/lib/logger'

interface GraphNode {
  name: string
  type: 'start' | 'end' | 'node'
}

interface GraphEdge {
  from: string
  to: string
  conditional: boolean
  label?: string
}

interface GraphViewerProps {
  mermaidCode: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  highlightNode?: string
  onNodeClick?: (nodeName: string) => void
  isLoading?: boolean
  error?: string | null
}

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#c9a45c',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#475569',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 20,
  },
})

export function GraphViewer({
  mermaidCode,
  highlightNode,
  onNodeClick,
  isLoading,
  error,
}: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [renderKey, setRenderKey] = useState(0)

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return

    const renderDiagram = async () => {
      try {
        setRenderError(null)

        // Add highlight styling if a node is selected
        let code = mermaidCode
        if (highlightNode) {
          code += `\n    style ${highlightNode} fill:#c9a45c,stroke:#a78b4a,color:#000`
        }

        // Generate unique ID for this render
        const id = `mermaid-${Date.now()}`

        // Clear previous content
        containerRef.current!.innerHTML = ''

        // Render the diagram
        const { svg } = await mermaid.render(id, code)

        // Insert the SVG
        containerRef.current!.innerHTML = svg

        // Add click handlers to nodes
        if (onNodeClick) {
          const svgElement = containerRef.current!.querySelector('svg')
          if (svgElement) {
            const nodes = svgElement.querySelectorAll('.node')
            nodes.forEach((node) => {
              const nodeId = node.id?.replace('flowchart-', '').split('-')[0]
              if (nodeId && nodeId !== '__start__' && nodeId !== '__end__') {
                ;(node as HTMLElement).style.cursor = 'pointer'
                node.addEventListener('click', () => onNodeClick(nodeId))
              }
            })
          }
        }
      } catch (err) {
        logger.error('ui', 'Mermaid render error', { error: err })
        setRenderError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    }

    renderDiagram()
  }, [mermaidCode, highlightNode, onNodeClick, renderKey])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-surface-800 rounded-lg">
        <RefreshCw className="w-6 h-6 text-steel-dim animate-spin" />
      </div>
    )
  }

  if (error || renderError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-surface-800 rounded-lg gap-2">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{error || renderError}</p>
        <button
          onClick={() => setRenderKey((k) => k + 1)}
          className="text-xs text-steel-dim hover:text-steel underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface-800 rounded-lg p-4 overflow-auto">
      <div ref={containerRef} className="flex justify-center min-h-[300px]" />
    </div>
  )
}
