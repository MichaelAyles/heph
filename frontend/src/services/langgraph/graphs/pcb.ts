/**
 * PCB Stage Subgraph
 *
 * Handles the PCB design stage of the hardware design pipeline:
 * 1. Block Selection - Choose circuit blocks from database
 * 2. Placement Optimization - Position blocks on grid
 * 3. Bus Routing - Configure bus connections and tap states
 */

import { StateGraph, START, END, type GraphNode } from '@langchain/langgraph'
import { AIMessage } from '@langchain/core/messages'
import {
  PCBStateSchema,
  type PCBState,
  createPCBDebugStep,
  calculateBoardSize,
  isPCBDesignValid,
} from '../states/pcb'

// =============================================================================
// Node Implementations
// =============================================================================

/**
 * Block Selection Node
 *
 * Selects appropriate circuit blocks based on the specification.
 * Queries available blocks and recommends a set that fulfills requirements.
 */
const blockSelectionNode: GraphNode<typeof PCBStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Call LLM to select blocks based on spec
  // For now, use placeholder logic
  const selectedBlocks = [
    { blockId: 'mcu-1', blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0 as const },
    { blockId: 'sensor-1', blockSlug: 'sensor-bme280', gridX: 1, gridY: 0, rotation: 0 as const },
    { blockId: 'power-1', blockSlug: 'power-lipo', gridX: 0, gridY: 1, rotation: 0 as const },
  ]

  const justifications = [
    {
      blockSlug: 'mcu-esp32c6',
      blockName: 'ESP32-C6 MCU',
      reason: 'WiFi 6 and BLE 5.3 support for wireless connectivity',
    },
    {
      blockSlug: 'sensor-bme280',
      blockName: 'BME280 Sensor',
      reason: 'Temperature, humidity, and pressure sensing',
    },
    {
      blockSlug: 'power-lipo',
      blockName: 'LiPo Power',
      reason: 'Rechargeable battery support with charging circuit',
    },
  ]

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Selected ${selectedBlocks.length} blocks for your design:\n${justifications.map((j) => `• ${j.blockName}: ${j.reason}`).join('\n')}`,
  })

  const debugStep = createPCBDebugStep(
    'block_selection',
    { availableBlocks: state.availableBlocks.length },
    { selectedCount: selectedBlocks.length },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    placedBlocks: selectedBlocks,
    designJustifications: justifications,
    pcbRoute: 'optimize_placement',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Placement Optimization Node
 *
 * Optimizes block placement on the 12.7mm grid.
 * Considers signal routing, power distribution, and thermal management.
 */
const placementOptimizationNode: GraphNode<typeof PCBStateSchema> = async (state) => {
  const startTime = Date.now()

  // Build block size map for calculations
  const blockSizes = new Map<string, { width: number; height: number }>()
  for (const block of state.availableBlocks) {
    blockSizes.set(block.slug, { width: block.widthUnits, height: block.heightUnits })
  }

  // Calculate board dimensions
  const dimensions = calculateBoardSize(state.placedBlocks, blockSizes)

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Board layout optimized:\n• Grid size: ${dimensions.gridWidth} x ${dimensions.gridHeight} units\n• Physical size: ${dimensions.width.toFixed(1)} x ${dimensions.height.toFixed(1)} mm`,
  })

  const debugStep = createPCBDebugStep(
    'placement_optimization',
    { blockCount: state.placedBlocks.length },
    { dimensions },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    boardSize: { width: dimensions.width, height: dimensions.height, unit: 'mm' as const },
    gridWidth: dimensions.gridWidth,
    gridHeight: dimensions.gridHeight,
    pcbRoute: 'route_buses',
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Bus Routing Node
 *
 * Configures bus connections between blocks and determines
 * which resistor taps need to be populated or left empty.
 */
const busRoutingNode: GraphNode<typeof PCBStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Analyze block connections and determine tap states
  // For now, return placeholder tap states
  const tapStates = [
    {
      blockSlug: 'sensor-bme280',
      reference: 'R1',
      signal: 'I2C1_SDA',
      populated: true,
      reason: 'Required for I2C communication',
      isolates: { from: 'SDA_BUS', to: 'SENSOR_SDA' },
    },
    {
      blockSlug: 'sensor-bme280',
      reference: 'R2',
      signal: 'I2C1_SCL',
      populated: true,
      reason: 'Required for I2C communication',
      isolates: { from: 'SCL_BUS', to: 'SENSOR_SCL' },
    },
  ]

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `Bus routing configured:\n• ${tapStates.filter((t) => t.populated).length} resistors populated\n• ${tapStates.filter((t) => !t.populated).length} resistors no-fit`,
  })

  const debugStep = createPCBDebugStep(
    'bus_routing',
    { placedBlocks: state.placedBlocks.length },
    { tapStates: tapStates.length },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    resistorTapStates: tapStates,
    pcbRoute: 'complete',
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
 * Route after block selection
 */
function routeAfterBlockSelection(state: PCBState): string {
  if (state.placedBlocks.length === 0) {
    return END // No blocks selected
  }
  return 'placement_optimization'
}

/**
 * Route after placement optimization
 */
function routeAfterPlacement(state: PCBState): string {
  if (!state.boardSize) {
    return 'placement_optimization'
  }
  return 'bus_routing'
}

/**
 * Route after bus routing
 */
function routeAfterBusRouting(state: PCBState): string {
  if (isPCBDesignValid(state)) {
    return END
  }
  // Need more work
  return 'block_selection'
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Create the PCB stage subgraph
 */
export function createPCBGraph() {
  const graph = new StateGraph(PCBStateSchema)
    // Add nodes
    .addNode('block_selection', blockSelectionNode)
    .addNode('placement_optimization', placementOptimizationNode)
    .addNode('bus_routing', busRoutingNode)

    // Entry point
    .addEdge(START, 'block_selection')

    // Conditional routing
    .addConditionalEdges('block_selection', routeAfterBlockSelection, {
      placement_optimization: 'placement_optimization',
      [END]: END,
    })
    .addConditionalEdges('placement_optimization', routeAfterPlacement, {
      placement_optimization: 'placement_optimization',
      bus_routing: 'bus_routing',
    })
    .addConditionalEdges('bus_routing', routeAfterBusRouting, {
      block_selection: 'block_selection',
      [END]: END,
    })

  return graph
}

/**
 * Compile the PCB subgraph
 */
export function compilePCBGraph() {
  return createPCBGraph().compile()
}

// Export node names for visualization
export const PCB_NODES = ['block_selection', 'placement_optimization', 'bus_routing'] as const

export type PCBNodeName = (typeof PCB_NODES)[number]
