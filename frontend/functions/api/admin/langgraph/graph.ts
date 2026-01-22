/**
 * GET /api/admin/langgraph/graph
 *
 * Returns the Mermaid diagram and metadata for the LangGraph workflow.
 * Note: This runs on the edge, so we can't directly import compiledGraph.
 * Instead, we return a static structure derived from the graph definition.
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'

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

interface GraphResponse {
  mermaid: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Define the current graph structure
  // This matches the structure in src/services/langgraph/graph.ts
  const nodes: GraphNode[] = [
    { name: '__start__', type: 'start' },
    { name: 'start', type: 'node' },
    { name: 'new_project', type: 'node' },
    { name: 'load_project', type: 'node' },
    { name: 'question', type: 'node' },
    { name: '__end__', type: 'end' },
  ]

  const edges: GraphEdge[] = [
    { from: '__start__', to: 'start', conditional: false },
    { from: 'start', to: 'new_project', conditional: true, label: 'intent: new_project' },
    { from: 'start', to: 'load_project', conditional: true, label: 'intent: load_project' },
    { from: 'start', to: 'question', conditional: true, label: 'intent: question' },
    { from: 'new_project', to: '__end__', conditional: false },
    { from: 'load_project', to: '__end__', conditional: false },
    { from: 'question', to: '__end__', conditional: false },
  ]

  // Generate Mermaid diagram
  const mermaid = generateMermaid(nodes, edges)

  const response: GraphResponse = {
    mermaid,
    nodes,
    edges,
  }

  return Response.json(response)
}

function generateMermaid(nodes: GraphNode[], edges: GraphEdge[]): string {
  const lines: string[] = ['%%{init: {"theme": "dark"}}%%', 'flowchart TD']

  // Add node definitions with styling
  for (const node of nodes) {
    if (node.type === 'start') {
      lines.push(`    ${node.name}([${node.name}])`)
    } else if (node.type === 'end') {
      lines.push(`    ${node.name}([${node.name}])`)
    } else {
      lines.push(`    ${node.name}[${node.name}]`)
    }
  }

  lines.push('')

  // Add edges
  for (const edge of edges) {
    if (edge.conditional) {
      lines.push(`    ${edge.from} -.-> ${edge.to}`)
    } else {
      lines.push(`    ${edge.from} --> ${edge.to}`)
    }
  }

  // Add styling
  lines.push('')
  lines.push('    classDef startEnd fill:#6366f1,stroke:#4f46e5,color:#fff')
  lines.push('    classDef node fill:#1e293b,stroke:#475569,color:#e2e8f0')
  lines.push('    class __start__,__end__ startEnd')
  lines.push('    class start,new_project,load_project,question node')

  return lines.join('\n')
}
