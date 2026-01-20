/**
 * Remote Board Service
 *
 * Manages remote boards (off-grid boards like button panels, displays, USB connectors)
 * that are panelized with the main board for manufacturing.
 *
 * Features:
 * - Create/manage remote boards
 * - Connection mapping validation
 * - Auto-suggest connections based on signal names
 */

import type {
  RemoteBoard,
  RemoteBoardType,
  ConnectionMapping,
  PlacedBlock,
  PcbBlock,
} from '../db/schema'
import type { BlockDefinition, BusSignal } from '../schemas/block'

// =============================================================================
// Constants
// =============================================================================

export const CONNECTOR_TYPES = [
  { id: 'JST-PH-2', name: 'JST PH 2-pin', pins: 2 },
  { id: 'JST-PH-3', name: 'JST PH 3-pin', pins: 3 },
  { id: 'JST-PH-4', name: 'JST PH 4-pin', pins: 4 },
  { id: 'JST-PH-5', name: 'JST PH 5-pin', pins: 5 },
  { id: 'JST-PH-6', name: 'JST PH 6-pin', pins: 6 },
  { id: 'FFC-6', name: 'FFC 6-pin', pins: 6 },
  { id: 'FFC-10', name: 'FFC 10-pin', pins: 10 },
  { id: 'FFC-14', name: 'FFC 14-pin', pins: 14 },
  { id: 'IDC-6', name: 'IDC 6-pin', pins: 6 },
  { id: 'IDC-10', name: 'IDC 10-pin', pins: 10 },
  { id: 'DUPONT-4', name: 'Dupont 4-pin', pins: 4 },
] as const

export const REMOTE_BOARD_TEMPLATES: Array<{
  type: RemoteBoardType
  name: string
  description: string
  defaultConnector: string
  suggestedSignals: string[]
}> = [
  {
    type: 'button',
    name: 'Button Panel',
    description: 'Remote panel with buttons for user input',
    defaultConnector: 'JST-PH-4',
    suggestedSignals: ['GND', '3V3', 'GPIO_0', 'GPIO_1'],
  },
  {
    type: 'display',
    name: 'Display Module',
    description: 'Remote OLED or LCD display',
    defaultConnector: 'JST-PH-4',
    suggestedSignals: ['GND', '3V3', 'I2C1_SDA', 'I2C1_SCL'],
  },
  {
    type: 'connector',
    name: 'Connector Board',
    description: 'USB, power, or external connector breakout',
    defaultConnector: 'JST-PH-4',
    suggestedSignals: ['GND', '5V0', 'GPIO_2', 'GPIO_3'],
  },
  {
    type: 'custom',
    name: 'Custom Board',
    description: 'Custom remote board configuration',
    defaultConnector: 'JST-PH-4',
    suggestedSignals: [],
  },
]

// =============================================================================
// Remote Board Creation
// =============================================================================

/**
 * Create a new remote board with default values
 */
export function createRemoteBoard(
  type: RemoteBoardType,
  name?: string,
  gridWidth: number = 2,
  gridHeight: number = 2
): RemoteBoard {
  const template = REMOTE_BOARD_TEMPLATES.find((t) => t.type === type)
  const connector = CONNECTOR_TYPES.find((c) => c.id === template?.defaultConnector)

  return {
    id: `remote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name || template?.name || 'Remote Board',
    slug: (name || template?.name || 'remote-board')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, ''),
    type,
    placedBlocks: [],
    boardSize: {
      width: gridWidth * 12.7,
      height: gridHeight * 12.7,
      unit: 'mm',
    },
    connectionMapping: template?.suggestedSignals.map((signal) => ({
      remoteSignal: signal,
      mainSignal: signal,
      connectorType: connector?.id || 'JST-PH-4',
    })) || [],
    gridWidth,
    gridHeight,
  }
}

/**
 * Create remote board from template
 */
export function createFromTemplate(
  templateType: RemoteBoardType,
  customName?: string
): RemoteBoard {
  return createRemoteBoard(templateType, customName)
}

// =============================================================================
// Connection Mapping
// =============================================================================

/**
 * Validate connection mappings against main board signals
 */
export function validateRemoteBoardConnections(
  remoteBoard: RemoteBoard,
  mainBoardSignals: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const mapping of remoteBoard.connectionMapping) {
    // Check if main signal exists on main board
    if (!mainBoardSignals.includes(mapping.mainSignal)) {
      errors.push(`Signal "${mapping.mainSignal}" not available on main board`)
    }

    // Check for duplicate remote signals
    const duplicates = remoteBoard.connectionMapping.filter(
      (m) => m.remoteSignal === mapping.remoteSignal
    )
    if (duplicates.length > 1) {
      errors.push(`Duplicate remote signal: ${mapping.remoteSignal}`)
    }
  }

  // Check for power (GND is required)
  const hasGnd = remoteBoard.connectionMapping.some(
    (m) => m.mainSignal === 'GND' || m.remoteSignal === 'GND'
  )
  if (!hasGnd) {
    errors.push('Connection mapping should include GND')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get available signals from main board based on placed blocks
 */
export function getMainBoardSignals(
  placedBlocks: PlacedBlock[],
  blockDefinitions: Map<string, BlockDefinition>
): string[] {
  const signals = new Set<string>()

  // Always include standard bus signals
  const standardSignals: BusSignal[] = [
    'GND', '3V3', '5V0',
    'I2C1_SDA', 'I2C1_SCL',
    'GPIO_0', 'GPIO_1', 'GPIO_2', 'GPIO_3',
    'SPI_MOSI', 'SPI_MISO', 'SPI_SCK', 'SPI_CS0',
    'AUX_0', 'AUX_1', 'AUX_2', 'AUX_3', 'AUX_4', 'AUX_5', 'AUX_6',
  ]

  for (const signal of standardSignals) {
    signals.add(signal)
  }

  // Add signals from block definitions
  for (const placed of placedBlocks) {
    const def = blockDefinitions.get(placed.blockSlug)
    if (!def) continue

    // Add tap signals
    for (const tap of def.bus.taps || []) {
      signals.add(tap.signal)
    }

    // Add permanent connection signals
    for (const perm of def.bus.permanent || []) {
      signals.add(perm.signal)
    }
  }

  return Array.from(signals).sort()
}

/**
 * Auto-suggest connection mappings based on signal name similarity
 */
export function suggestConnectionMapping(
  remoteSignal: string,
  availableMainSignals: string[]
): string | null {
  // Exact match
  if (availableMainSignals.includes(remoteSignal)) {
    return remoteSignal
  }

  // Normalize for comparison
  const normalizedRemote = remoteSignal.toLowerCase().replace(/[_-]/g, '')

  // Find best match
  for (const mainSignal of availableMainSignals) {
    const normalizedMain = mainSignal.toLowerCase().replace(/[_-]/g, '')
    if (normalizedMain === normalizedRemote) {
      return mainSignal
    }
  }

  // Partial match (e.g., "SDA" matches "I2C1_SDA")
  for (const mainSignal of availableMainSignals) {
    if (
      mainSignal.toLowerCase().includes(normalizedRemote) ||
      normalizedRemote.includes(mainSignal.toLowerCase().replace(/[_-]/g, ''))
    ) {
      return mainSignal
    }
  }

  return null
}

/**
 * Add a connection mapping to remote board
 */
export function addConnectionMapping(
  remoteBoard: RemoteBoard,
  mapping: ConnectionMapping
): RemoteBoard {
  return {
    ...remoteBoard,
    connectionMapping: [...remoteBoard.connectionMapping, mapping],
  }
}

/**
 * Remove a connection mapping from remote board
 */
export function removeConnectionMapping(
  remoteBoard: RemoteBoard,
  index: number
): RemoteBoard {
  return {
    ...remoteBoard,
    connectionMapping: remoteBoard.connectionMapping.filter((_, i) => i !== index),
  }
}

/**
 * Update a connection mapping
 */
export function updateConnectionMapping(
  remoteBoard: RemoteBoard,
  index: number,
  updates: Partial<ConnectionMapping>
): RemoteBoard {
  return {
    ...remoteBoard,
    connectionMapping: remoteBoard.connectionMapping.map((m, i) =>
      i === index ? { ...m, ...updates } : m
    ),
  }
}

// =============================================================================
// Block Placement on Remote Board
// =============================================================================

/**
 * Add a block to a remote board
 */
export function addBlockToRemoteBoard(
  remoteBoard: RemoteBoard,
  block: PcbBlock,
  gridX: number = 0,
  gridY: number = 0
): RemoteBoard {
  const newBlock: PlacedBlock = {
    blockId: `${block.id}-${Date.now()}`,
    blockSlug: block.slug,
    gridX,
    gridY,
    rotation: 0,
  }

  return {
    ...remoteBoard,
    placedBlocks: [...remoteBoard.placedBlocks, newBlock],
  }
}

/**
 * Remove a block from a remote board
 */
export function removeBlockFromRemoteBoard(
  remoteBoard: RemoteBoard,
  blockId: string
): RemoteBoard {
  return {
    ...remoteBoard,
    placedBlocks: remoteBoard.placedBlocks.filter((b) => b.blockId !== blockId),
  }
}

/**
 * Update remote board size based on placed blocks
 */
export function recalculateBoardSize(
  remoteBoard: RemoteBoard,
  blockDefinitions: Map<string, BlockDefinition>
): RemoteBoard {
  let maxX = remoteBoard.gridWidth
  let maxY = remoteBoard.gridHeight

  for (const placed of remoteBoard.placedBlocks) {
    const def = blockDefinitions.get(placed.blockSlug)
    if (!def || !def.gridSize) continue

    const [blockWidth, blockHeight] = def.gridSize
    const endX = placed.gridX + blockWidth
    const endY = placed.gridY + blockHeight

    if (endX > maxX) maxX = endX
    if (endY > maxY) maxY = endY
  }

  return {
    ...remoteBoard,
    gridWidth: maxX,
    gridHeight: maxY,
    boardSize: {
      width: maxX * 12.7,
      height: maxY * 12.7,
      unit: 'mm',
    },
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique slug for a remote board
 */
export function generateRemoteBoardSlug(name: string, existingSlugs: string[]): string {
  let slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  // Ensure uniqueness
  let counter = 1
  let uniqueSlug = slug
  while (existingSlugs.includes(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`
    counter++
  }

  return uniqueSlug
}

/**
 * Get connector pin count
 */
export function getConnectorPinCount(connectorType: string): number {
  const connector = CONNECTOR_TYPES.find((c) => c.id === connectorType)
  return connector?.pins || 4
}

/**
 * Check if a remote board has valid placements
 */
export function hasValidPlacements(remoteBoard: RemoteBoard): boolean {
  return remoteBoard.placedBlocks.length > 0 || remoteBoard.connectionMapping.length > 0
}
