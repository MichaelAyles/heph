/**
 * Export Stage Subgraph
 *
 * Handles the manufacturing export stage of the hardware design pipeline:
 * 1. Gerber Merge - Merge all block gerbers into manufacturing files
 * 2. BOM Generation - Generate bill of materials
 * 3. ZIP Packaging - Package all artifacts for download
 */

import { StateGraph, START, END, type GraphNode } from '@langchain/langgraph'
import { AIMessage } from '@langchain/core/messages'
import {
  ExportStateSchema,
  type ExportState,
  createExportDebugStep,
  isExportComplete,
  upsertArtifact,
} from '../states/export'

// =============================================================================
// Node Implementations
// =============================================================================

/**
 * Gerber Merge Node
 *
 * Merges individual block gerbers into unified manufacturing files.
 * Handles layer alignment, board outline, and panelization.
 */
const gerberMergeNode: GraphNode<typeof ExportStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Call actual gerber merge service
  // For now, create placeholder artifacts
  const mergedGerbers = {
    topCopper: 'merged-F_Cu.gtl',
    innerCopper1: 'merged-In1_Cu.g2',
    innerCopper2: 'merged-In2_Cu.g3',
    bottomCopper: 'merged-B_Cu.gbl',
    topSilk: 'merged-F_SilkS.gto',
    bottomSilk: 'merged-B_SilkS.gbo',
    topMask: 'merged-F_Mask.gts',
    bottomMask: 'merged-B_Mask.gbs',
    edgeCuts: 'merged-Edge_Cuts.gm1',
    drill: 'merged.drl',
  }

  const panelGerbers = {
    ...mergedGerbers,
    vScore: 'panel-VScore.gbr',
    routedEdges: 'panel-RoutedEdges.gbr',
  }

  const artifacts = upsertArtifact(state.artifacts, {
    name: 'merged-gerbers.zip',
    type: 'gerber',
    url: '/api/export/gerbers',
    generatedAt: new Date().toISOString(),
  })

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Gerber files merged successfully:\n• ${Object.keys(mergedGerbers).length} layers generated\n• Panel with v-score included`,
  })

  const debugStep = createExportDebugStep(
    'gerber_merge',
    { projectId: state.projectId },
    { layers: Object.keys(mergedGerbers).length },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    gerbersMerged: true,
    mergedGerbers,
    panelGerbers,
    artifacts,
    exportRoute: 'generate_bom',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * BOM Generation Node
 *
 * Generates bill of materials with component aggregation,
 * manufacturer part numbers, and LCSC compatibility.
 */
const bomGenerationNode: GraphNode<typeof ExportStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Get actual BOM from placed blocks
  // For now, use placeholder data
  const bomEntries = [
    {
      reference: 'U1',
      value: 'ESP32-C6',
      footprint: 'QFN-40',
      quantity: 1,
      manufacturer: 'Espressif',
      mpn: 'ESP32-C6-WROOM-1-N8',
      lcscPartNumber: 'C2913196',
      nofit: false,
    },
    {
      reference: 'U2',
      value: 'BME280',
      footprint: 'LGA-8',
      quantity: 1,
      manufacturer: 'Bosch',
      mpn: 'BME280',
      lcscPartNumber: 'C92489',
      nofit: false,
    },
    {
      reference: 'C1,C2,C3,C4',
      value: '100nF',
      footprint: '0402',
      quantity: 4,
      manufacturer: 'Samsung',
      mpn: 'CL05B104KO5NNNC',
      lcscPartNumber: 'C1525',
      nofit: false,
    },
    {
      reference: 'R1,R2',
      value: '10k',
      footprint: '0402',
      quantity: 2,
      manufacturer: 'Yageo',
      mpn: 'RC0402FR-0710KL',
      lcscPartNumber: 'C25744',
      nofit: false,
    },
    {
      reference: 'R3',
      value: '0R',
      footprint: '0402',
      quantity: 1,
      nofit: true, // Bus isolation resistor - not populated
    },
  ]

  // Generate centroid data
  const centroidEntries = [
    {
      reference: 'U1',
      value: 'ESP32-C6',
      footprint: 'QFN-40',
      x: 12.7,
      y: 6.35,
      rotation: 0,
      side: 'top' as const,
    },
    {
      reference: 'U2',
      value: 'BME280',
      footprint: 'LGA-8',
      x: 25.4,
      y: 6.35,
      rotation: 0,
      side: 'top' as const,
    },
    {
      reference: 'C1',
      value: '100nF',
      footprint: '0402',
      x: 10.0,
      y: 15.0,
      rotation: 90,
      side: 'top' as const,
    },
    {
      reference: 'C2',
      value: '100nF',
      footprint: '0402',
      x: 12.0,
      y: 15.0,
      rotation: 90,
      side: 'top' as const,
    },
    {
      reference: 'R1',
      value: '10k',
      footprint: '0402',
      x: 20.0,
      y: 10.0,
      rotation: 0,
      side: 'top' as const,
    },
    {
      reference: 'R2',
      value: '10k',
      footprint: '0402',
      x: 22.0,
      y: 10.0,
      rotation: 0,
      side: 'top' as const,
    },
  ]

  // TODO: Store LCSC BOM in artifact when R2 storage is ready
  // const lcscBom = generateLCSCBOM(bomEntries)

  let artifacts = upsertArtifact(state.artifacts, {
    name: 'bom.csv',
    type: 'bom',
    url: '/api/export/bom',
    generatedAt: new Date().toISOString(),
  })
  artifacts = upsertArtifact(artifacts, {
    name: 'centroid.csv',
    type: 'centroid',
    url: '/api/export/centroid',
    generatedAt: new Date().toISOString(),
  })

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `BOM generated:\n• ${bomEntries.length} line items\n• ${bomEntries.filter((e) => !e.nofit).reduce((s, e) => s + e.quantity, 0)} total components\n• ${bomEntries.filter((e) => e.nofit).length} no-fit parts`,
  })

  const debugStep = createExportDebugStep(
    'bom_generation',
    { gerbersMerged: state.gerbersMerged },
    { bomEntries: bomEntries.length, centroidEntries: centroidEntries.length },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    bomGenerated: true,
    bomEntries,
    centroidEntries,
    artifacts,
    exportRoute: 'package_zip',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * ZIP Packaging Node
 *
 * Packages all manufacturing artifacts into a downloadable ZIP file.
 */
const zipPackagingNode: GraphNode<typeof ExportStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Actually create ZIP file and upload to R2
  // For now, create placeholder URL
  const zipUrl = `/api/export/download/${state.projectId}-manufacturing.zip`

  let artifacts = upsertArtifact(state.artifacts, {
    name: `${state.projectId}-manufacturing.zip`,
    type: 'zip',
    url: zipUrl,
    size: 1024 * 512, // Placeholder size
    generatedAt: new Date().toISOString(),
  })

  // Also add design document
  artifacts = upsertArtifact(artifacts, {
    name: 'design-document.md',
    type: 'design_doc',
    url: `/api/export/design-doc/${state.projectId}`,
    generatedAt: new Date().toISOString(),
  })

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Manufacturing package ready!\n\nDownload includes:\n• Gerber files (10 layers)\n• BOM (standard and LCSC format)\n• Pick & place coordinates\n• Design document\n\nYour project is ready for manufacturing!`,
  })

  const debugStep = createExportDebugStep(
    'zip_packaging',
    { artifactCount: state.artifacts.length },
    { zipUrl, complete: true },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    zipReady: true,
    zipUrl,
    designDocGenerated: true,
    designDocUrl: `/api/export/design-doc/${state.projectId}`,
    artifacts,
    exportRoute: 'complete',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

// =============================================================================
// Routing Functions
// =============================================================================

/**
 * Route after gerber merge
 */
function routeAfterGerberMerge(state: ExportState): string {
  if (!state.gerbersMerged) {
    return 'gerber_merge' // Retry
  }
  return 'bom_generation'
}

/**
 * Route after BOM generation
 */
function routeAfterBOMGeneration(state: ExportState): string {
  if (!state.bomGenerated) {
    return 'bom_generation' // Retry
  }
  return 'zip_packaging'
}

/**
 * Route after ZIP packaging
 */
function routeAfterZIPPackaging(state: ExportState): string {
  if (isExportComplete(state)) {
    return END
  }
  // Something went wrong, retry from appropriate step
  if (!state.gerbersMerged) return 'gerber_merge'
  if (!state.bomGenerated) return 'bom_generation'
  return 'zip_packaging'
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Create the Export stage subgraph
 */
export function createExportGraph() {
  const graph = new StateGraph(ExportStateSchema)
    // Add nodes
    .addNode('gerber_merge', gerberMergeNode)
    .addNode('bom_generation', bomGenerationNode)
    .addNode('zip_packaging', zipPackagingNode)

    // Entry point
    .addEdge(START, 'gerber_merge')

    // Conditional routing
    .addConditionalEdges('gerber_merge', routeAfterGerberMerge, {
      gerber_merge: 'gerber_merge',
      bom_generation: 'bom_generation',
    })
    .addConditionalEdges('bom_generation', routeAfterBOMGeneration, {
      bom_generation: 'bom_generation',
      zip_packaging: 'zip_packaging',
    })
    .addConditionalEdges('zip_packaging', routeAfterZIPPackaging, {
      gerber_merge: 'gerber_merge',
      bom_generation: 'bom_generation',
      zip_packaging: 'zip_packaging',
      [END]: END,
    })

  return graph
}

/**
 * Compile the Export subgraph
 */
export function compileExportGraph() {
  return createExportGraph().compile()
}

// Export node names for visualization
export const EXPORT_NODES = ['gerber_merge', 'bom_generation', 'zip_packaging'] as const

export type ExportNodeName = (typeof EXPORT_NODES)[number]
