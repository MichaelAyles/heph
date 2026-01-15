/**
 * Orchestrator Graph API
 *
 * GET /api/admin/orchestrator/graph - Get full graph structure (nodes + edges)
 * Requires admin authentication.
 */

import type { Env, AuthenticatedRequest } from '../../../types'

interface OrchestratorPrompt {
  id: string
  node_name: string
  display_name: string
  stage: string
  description: string | null
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  is_active: number
}

interface OrchestratorEdge {
  id: string
  from_node: string
  to_node: string
  condition_name: string | null
  condition_label: string | null
  edge_type: string
}

interface GraphNode {
  id: string
  name: string
  displayName: string
  stage: string
  description: string | null
  hasPrompt: boolean
  isActive: boolean
  temperature?: number
  maxTokens?: number
}

interface GraphEdge {
  id: string
  source: string
  target: string
  condition?: string
  label?: string
  type: string
}

// Nodes that don't have LLM prompts (control flow only)
const CONTROL_NODES = [
  'START',
  'END',
  'selectBlueprint',
  'selectName',
  'validatePcb',
  'markSpecComplete',
  'markPcbComplete',
  'decideEnclosure',
  'acceptEnclosure',
  'markEnclosureComplete',
  'decideFirmware',
  'acceptFirmware',
  'markFirmwareComplete',
  'markExportComplete',
  'requestUserInput',
]

// Stage colors for visualization
const STAGE_COLORS: Record<string, string> = {
  spec: '#10B981', // emerald
  pcb: '#3B82F6', // blue
  enclosure: '#8B5CF6', // purple
  firmware: '#F59E0B', // amber
  export: '#EF4444', // red
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const request = context.request as AuthenticatedRequest
  const { env } = context

  // Check admin access
  if (!request.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Fetch prompts and edges in parallel
    const [promptsResult, edgesResult] = await Promise.all([
      env.DB.prepare('SELECT * FROM orchestrator_prompts ORDER BY stage, display_name').all<OrchestratorPrompt>(),
      env.DB.prepare('SELECT * FROM orchestrator_edges').all<OrchestratorEdge>(),
    ])

    const prompts = promptsResult.results
    const edges = edgesResult.results

    // Build node map from prompts
    const nodeMap = new Map<string, GraphNode>()

    for (const prompt of prompts) {
      nodeMap.set(prompt.node_name, {
        id: prompt.node_name,
        name: prompt.node_name,
        displayName: prompt.display_name,
        stage: prompt.stage,
        description: prompt.description,
        hasPrompt: true,
        isActive: prompt.is_active === 1,
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
      })
    }

    // Add control nodes (no prompts)
    for (const nodeName of CONTROL_NODES) {
      if (!nodeMap.has(nodeName)) {
        // Infer stage from name
        let stage = 'spec'
        if (nodeName.toLowerCase().includes('pcb') || nodeName.toLowerCase().includes('block')) {
          stage = 'pcb'
        } else if (nodeName.toLowerCase().includes('enclosure')) {
          stage = 'enclosure'
        } else if (nodeName.toLowerCase().includes('firmware')) {
          stage = 'firmware'
        } else if (nodeName.toLowerCase().includes('export') || nodeName === 'END') {
          stage = 'export'
        }

        nodeMap.set(nodeName, {
          id: nodeName,
          name: nodeName,
          displayName: formatNodeName(nodeName),
          stage,
          description: null,
          hasPrompt: false,
          isActive: true,
        })
      }
    }

    // Convert edges to React Flow format
    const graphEdges: GraphEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.from_node,
      target: edge.to_node,
      condition: edge.condition_name || undefined,
      label: edge.condition_label || undefined,
      type: edge.edge_type,
    }))

    // Convert nodes to array
    const graphNodes = Array.from(nodeMap.values())

    return new Response(
      JSON.stringify({
        nodes: graphNodes,
        edges: graphEdges,
        stageColors: STAGE_COLORS,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Format camelCase node name to display name
 */
function formatNodeName(name: string): string {
  if (name === 'START') return 'Start'
  if (name === 'END') return 'End'

  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}
