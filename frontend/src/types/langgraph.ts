/**
 * LangGraph Visualization Types
 *
 * Shared types for graph structure visualization.
 * These types are used by both frontend components and the API.
 */

/**
 * Subgraph node and edge definitions derived from code
 */
export interface SubgraphDefinition {
  name: string
  displayName: string
  stage: string | null
  nodes: Array<{
    name: string
    displayName: string
    type: 'start' | 'end' | 'node'
  }>
  edges: Array<{
    from: string
    to: string
    conditional: boolean
    label?: string
  }>
}

export interface CodeDefinedGraphData {
  /** The parent orchestrator graph */
  orchestrator: SubgraphDefinition
  /** Stage subgraphs */
  subgraphs: {
    spec: SubgraphDefinition
    pcb: SubgraphDefinition
    enclosure: SubgraphDefinition
    firmware: SubgraphDefinition
    export: SubgraphDefinition
  }
  /** Flat list of all node names for easy lookup */
  allNodes: string[]
}

// =============================================================================
// Subgraph Selector Types
// =============================================================================

export type SubgraphId = 'orchestrator' | 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

export interface SubgraphOption {
  id: SubgraphId
  label: string
  description: string
  nodeCount: number
}

/**
 * Default options for the subgraph selector based on code-defined structure
 */
export function getDefaultSubgraphOptions(): SubgraphOption[] {
  return [
    {
      id: 'orchestrator',
      label: 'Orchestrator',
      description: 'Parent graph coordinating all stages',
      nodeCount: 8, // __start__, router, 5 stages, __end__
    },
    {
      id: 'spec',
      label: 'Spec Stage',
      description: 'Feasibility, refinement, blueprints, finalization',
      nodeCount: 6, // __start__, 4 nodes, __end__
    },
    {
      id: 'pcb',
      label: 'PCB Stage',
      description: 'Block selection, placement, bus routing',
      nodeCount: 5, // __start__, 3 nodes, __end__
    },
    {
      id: 'enclosure',
      label: 'Enclosure Stage',
      description: 'Dimension analysis, OpenSCAD, review',
      nodeCount: 5, // __start__, 3 nodes, __end__
    },
    {
      id: 'firmware',
      label: 'Firmware Stage',
      description: 'Component analysis, code generation, review',
      nodeCount: 5, // __start__, 3 nodes, __end__
    },
    {
      id: 'export',
      label: 'Export Stage',
      description: 'Gerber merge, BOM generation, ZIP packaging',
      nodeCount: 5, // __start__, 3 nodes, __end__
    },
  ]
}
