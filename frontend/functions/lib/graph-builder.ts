/**
 * Dynamic Graph Builder
 *
 * Builds the LangGraph workflow dynamically from database tables:
 * - orchestrator_prompts: Node definitions with system prompts
 * - orchestrator_edges: Workflow transitions between nodes
 *
 * This enables runtime modification of the graph structure through the admin UI.
 */

// =============================================================================
// Types
// =============================================================================

export interface OrchestratorPrompt {
  id: string
  node_name: string
  display_name: string
  description: string | null
  system_prompt: string
  category: 'agent' | 'generator' | 'reviewer'
  stage: 'spec' | 'pcb' | 'enclosure' | 'firmware' | null
  is_active: number
  token_estimate: number | null
  version: number
}

export interface OrchestratorEdge {
  id: string
  from_node: string
  to_node: string
  condition: string | null // JSON
  edge_type: 'flow' | 'conditional' | 'loop'
  priority: number
  description: string | null
  is_active: number
}

export interface GraphStructure {
  nodes: Array<{
    name: string
    type: 'start' | 'end' | 'node'
    category?: 'agent' | 'generator' | 'reviewer'
    displayName?: string
    description?: string
    stage?: string | null
    systemPrompt?: string
    tokenEstimate?: number
  }>
  edges: Array<{
    from: string
    to: string
    conditional: boolean
    label?: string
    condition?: unknown
    edgeType: string
  }>
}

// =============================================================================
// Graph Structure Builder
// =============================================================================

/**
 * Fetch graph structure from database
 */
export async function fetchGraphStructure(db: D1Database): Promise<GraphStructure> {
  // Fetch active prompts
  const promptsResult = await db
    .prepare(
      `SELECT * FROM orchestrator_prompts WHERE is_active = 1 ORDER BY node_name`
    )
    .all<OrchestratorPrompt>()

  // Fetch active edges
  const edgesResult = await db
    .prepare(
      `SELECT * FROM orchestrator_edges WHERE is_active = 1 ORDER BY priority DESC, from_node`
    )
    .all<OrchestratorEdge>()

  const prompts = promptsResult.results || []
  const edges = edgesResult.results || []

  // Build node set from prompts and edges
  const nodeSet = new Set<string>()
  nodeSet.add('__start__')
  nodeSet.add('__end__')

  // Add nodes from prompts
  for (const prompt of prompts) {
    nodeSet.add(prompt.node_name)
  }

  // Add nodes referenced in edges (may not have prompts)
  for (const edge of edges) {
    nodeSet.add(edge.from_node)
    nodeSet.add(edge.to_node)
  }

  // Map prompts by node name for lookup
  const promptMap = new Map<string, OrchestratorPrompt>()
  for (const prompt of prompts) {
    promptMap.set(prompt.node_name, prompt)
  }

  // Build nodes array
  const nodes: GraphStructure['nodes'] = []

  for (const nodeName of nodeSet) {
    const prompt = promptMap.get(nodeName)

    if (nodeName === '__start__' || nodeName === 'start') {
      nodes.push({
        name: nodeName === 'start' ? 'start' : '__start__',
        type: nodeName === '__start__' ? 'start' : 'node',
        category: prompt?.category,
        displayName: prompt?.display_name || 'Start',
        description: prompt?.description || undefined,
        stage: prompt?.stage,
        systemPrompt: prompt?.system_prompt,
        tokenEstimate: prompt?.token_estimate || undefined,
      })
    } else if (nodeName === '__end__' || nodeName === 'end') {
      nodes.push({
        name: nodeName === 'end' ? 'end' : '__end__',
        type: nodeName === '__end__' ? 'end' : 'node',
        displayName: 'End',
      })
    } else {
      nodes.push({
        name: nodeName,
        type: 'node',
        category: prompt?.category,
        displayName: prompt?.display_name || nodeName,
        description: prompt?.description || undefined,
        stage: prompt?.stage,
        systemPrompt: prompt?.system_prompt,
        tokenEstimate: prompt?.token_estimate || undefined,
      })
    }
  }

  // Build edges array
  const graphEdges: GraphStructure['edges'] = []

  for (const edge of edges) {
    let condition: unknown = undefined
    if (edge.condition) {
      try {
        condition = JSON.parse(edge.condition)
      } catch {
        condition = edge.condition
      }
    }

    graphEdges.push({
      from: edge.from_node,
      to: edge.to_node,
      conditional: edge.edge_type === 'conditional' || edge.edge_type === 'loop',
      label: edge.description || undefined,
      condition,
      edgeType: edge.edge_type,
    })
  }

  return { nodes, edges: graphEdges }
}

/**
 * Generate Mermaid diagram from graph structure
 */
export function generateMermaidDiagram(structure: GraphStructure): string {
  const lines: string[] = ['%%{init: {"theme": "dark"}}%%', 'flowchart TD']

  // Add node definitions with styling
  for (const node of structure.nodes) {
    if (node.type === 'start') {
      lines.push(`    ${node.name}([${node.displayName || node.name}])`)
    } else if (node.type === 'end') {
      lines.push(`    ${node.name}([${node.displayName || node.name}])`)
    } else {
      lines.push(`    ${node.name}[${node.displayName || node.name}]`)
    }
  }

  lines.push('')

  // Add edges
  for (const edge of structure.edges) {
    if (edge.conditional) {
      lines.push(`    ${edge.from} -.-> ${edge.to}`)
    } else {
      lines.push(`    ${edge.from} --> ${edge.to}`)
    }
  }

  // Add styling
  lines.push('')
  lines.push('    classDef startEnd fill:#6366f1,stroke:#4f46e5,color:#fff')
  lines.push('    classDef agent fill:#3b82f6,stroke:#2563eb,color:#fff')
  lines.push('    classDef generator fill:#10b981,stroke:#059669,color:#fff')
  lines.push('    classDef reviewer fill:#f59e0b,stroke:#d97706,color:#fff')
  lines.push('    classDef node fill:#1e293b,stroke:#475569,color:#e2e8f0')

  // Apply classes
  const startEndNodes = structure.nodes
    .filter((n) => n.type === 'start' || n.type === 'end')
    .map((n) => n.name)
  const agentNodes = structure.nodes
    .filter((n) => n.category === 'agent')
    .map((n) => n.name)
  const generatorNodes = structure.nodes
    .filter((n) => n.category === 'generator')
    .map((n) => n.name)
  const reviewerNodes = structure.nodes
    .filter((n) => n.category === 'reviewer')
    .map((n) => n.name)
  const regularNodes = structure.nodes
    .filter((n) => n.type === 'node' && !n.category)
    .map((n) => n.name)

  if (startEndNodes.length > 0) {
    lines.push(`    class ${startEndNodes.join(',')} startEnd`)
  }
  if (agentNodes.length > 0) {
    lines.push(`    class ${agentNodes.join(',')} agent`)
  }
  if (generatorNodes.length > 0) {
    lines.push(`    class ${generatorNodes.join(',')} generator`)
  }
  if (reviewerNodes.length > 0) {
    lines.push(`    class ${reviewerNodes.join(',')} reviewer`)
  }
  if (regularNodes.length > 0) {
    lines.push(`    class ${regularNodes.join(',')} node`)
  }

  return lines.join('\n')
}

/**
 * Get simplified graph data for the API response
 */
export async function getGraphData(db: D1Database): Promise<{
  mermaid: string
  nodes: Array<{ name: string; type: 'start' | 'end' | 'node'; category?: string }>
  edges: Array<{ from: string; to: string; conditional: boolean; label?: string }>
}> {
  const structure = await fetchGraphStructure(db)
  const mermaid = generateMermaidDiagram(structure)

  return {
    mermaid,
    nodes: structure.nodes.map((n) => ({
      name: n.name,
      type: n.type,
      category: n.category,
    })),
    edges: structure.edges.map((e) => ({
      from: e.from,
      to: e.to,
      conditional: e.conditional,
      label: e.label,
    })),
  }
}
