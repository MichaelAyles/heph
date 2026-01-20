/**
 * Design Document Service
 *
 * Generates a comprehensive design JSON document that includes:
 * - Connection mappings between main and remote boards
 * - Design justifications for each block selection
 * - Resistor tap status (0R nofit decisions)
 * - Net assignments and GPIO mappings
 *
 * This document is useful for:
 * - Assembly reference during cable wiring
 * - Design review and auditing
 * - Reproducing the design process
 */

import type {
  PCBArtifacts,
  RemoteBoard,
  DesignJustification,
  ResistorTapState,
  NetAssignment,
  Project,
  PcbBlock,
} from '../db/schema'

// =============================================================================
// Design Document Schema
// =============================================================================

export interface DesignDocument {
  version: '1.0'
  generatedAt: string
  project: {
    id: string
    name: string
    description?: string
  }

  // Main board information
  mainBoard: {
    placedBlocks: Array<{
      slug: string
      name: string
      gridPosition: { x: number; y: number }
      rotation: number
    }>
    boardSize: { width: number; height: number; unit: 'mm' } | null
  }

  // Remote board connections
  connections: {
    mainToRemote: Array<{
      remoteBoardId: string
      remoteBoardName: string
      cableType: string
      pinout: Array<{
        pin: number
        mainSignal: string
        remoteSignal: string
      }>
    }>
  }

  // Design decisions
  designJustifications: Array<{
    blockSlug: string
    blockName: string
    reason: string
  }>

  // 0R resistor tap status
  resistorTaps: Array<{
    blockSlug: string
    blockName: string
    reference: string // "R3"
    signal: string // "I2C1_SDA"
    populated: boolean // false = no-fit
    reason: string
    isolates: {
      from: string
      to: string
    }
  }>

  // Net assignments
  netAssignments: Array<{
    net: string
    globalNet: string
    blocks: string[]
    gpio?: string
  }>

  // Remote boards
  remoteBoards: Array<{
    id: string
    name: string
    type: string
    boardSize: { width: number; height: number; unit: 'mm' }
    placedBlocks: Array<{
      slug: string
      name: string
      gridPosition: { x: number; y: number }
      rotation: number
    }>
  }>
}

// =============================================================================
// Document Generation
// =============================================================================

/**
 * Generate a design document from project and PCB artifacts
 */
export function generateDesignDocument(
  project: Project,
  pcbArtifacts: PCBArtifacts,
  blocks: PcbBlock[]
): DesignDocument {
  const blockLookup = new Map(blocks.map((b) => [b.slug, b]))

  // Build placed block info for main board
  const mainBoardBlocks = pcbArtifacts.placedBlocks.map((pb) => {
    const block = blockLookup.get(pb.blockSlug)
    return {
      slug: pb.blockSlug,
      name: block?.name || pb.blockSlug,
      gridPosition: { x: pb.gridX, y: pb.gridY },
      rotation: pb.rotation,
    }
  })

  // Build connections from remote boards
  const connections = buildConnectionMappings(pcbArtifacts.remoteBoards || [], blockLookup)

  // Build design justifications
  const justifications = buildDesignJustifications(
    pcbArtifacts.designJustifications || [],
    blockLookup
  )

  // Build resistor tap status
  const resistorTaps = buildResistorTapStatus(pcbArtifacts.resistorTapStates || [], blockLookup)

  // Build net assignments
  const netAssignments = buildNetAssignments(
    pcbArtifacts.netList || [],
    pcbArtifacts.placedBlocks,
    blockLookup
  )

  // Build remote board info
  const remoteBoards = (pcbArtifacts.remoteBoards || []).map((rb) => ({
    id: rb.id,
    name: rb.name,
    type: rb.type,
    boardSize: rb.boardSize,
    placedBlocks: rb.placedBlocks.map((pb) => {
      const block = blockLookup.get(pb.blockSlug)
      return {
        slug: pb.blockSlug,
        name: block?.name || pb.blockSlug,
        gridPosition: { x: pb.gridX, y: pb.gridY },
        rotation: pb.rotation,
      }
    }),
  }))

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      description: project.description || undefined,
    },
    mainBoard: {
      placedBlocks: mainBoardBlocks,
      boardSize: pcbArtifacts.boardSize || null,
    },
    connections,
    designJustifications: justifications,
    resistorTaps,
    netAssignments,
    remoteBoards,
  }
}

/**
 * Build connection mappings from remote boards
 */
function buildConnectionMappings(
  remoteBoards: RemoteBoard[],
  _blockLookup: Map<string, PcbBlock>
): DesignDocument['connections'] {
  const mainToRemote = remoteBoards.map((rb) => {
    // Group connections by connector type
    const pinout = rb.connectionMapping.map((cm, index) => ({
      pin: index + 1,
      mainSignal: cm.mainSignal,
      remoteSignal: cm.remoteSignal,
    }))

    // Get the primary connector type
    const connectorTypes = [...new Set(rb.connectionMapping.map((cm) => cm.connectorType))]
    const cableType = connectorTypes.join(' + ') || 'Unknown'

    return {
      remoteBoardId: rb.id,
      remoteBoardName: rb.name,
      cableType,
      pinout,
    }
  })

  return { mainToRemote }
}

/**
 * Build design justifications with block names
 */
function buildDesignJustifications(
  justifications: DesignJustification[],
  blockLookup: Map<string, PcbBlock>
): DesignDocument['designJustifications'] {
  return justifications.map((j) => {
    const block = blockLookup.get(j.blockSlug)
    return {
      blockSlug: j.blockSlug,
      blockName: block?.name || j.blockName || j.blockSlug,
      reason: j.reason,
    }
  })
}

/**
 * Build resistor tap status with block names
 */
function buildResistorTapStatus(
  tapStates: ResistorTapState[],
  blockLookup: Map<string, PcbBlock>
): DesignDocument['resistorTaps'] {
  return tapStates.map((t) => {
    const block = blockLookup.get(t.blockSlug)
    return {
      blockSlug: t.blockSlug,
      blockName: block?.name || t.blockSlug,
      reference: t.reference,
      signal: t.signal,
      populated: t.populated,
      reason: t.reason,
      isolates: t.isolates,
    }
  })
}

/**
 * Build net assignments with block associations
 */
function buildNetAssignments(
  netList: NetAssignment[],
  placedBlocks: PCBArtifacts['placedBlocks'],
  blockLookup: Map<string, PcbBlock>
): DesignDocument['netAssignments'] {
  // For now, simple passthrough with block names
  // In a full implementation, this would trace nets through block definitions
  return netList.map((n) => ({
    net: n.net,
    globalNet: n.globalNet,
    blocks: placedBlocks.map((pb) => blockLookup.get(pb.blockSlug)?.name || pb.blockSlug),
    gpio: n.gpio,
  }))
}

// =============================================================================
// Export Helpers
// =============================================================================

/**
 * Convert design document to formatted JSON string
 */
export function designDocumentToJSON(doc: DesignDocument): string {
  return JSON.stringify(doc, null, 2)
}

/**
 * Generate a human-readable markdown summary of the design document
 */
export function designDocumentToMarkdown(doc: DesignDocument): string {
  const lines: string[] = []

  lines.push(`# ${doc.project.name} - Design Document`)
  lines.push('')
  lines.push(`Generated: ${new Date(doc.generatedAt).toLocaleString()}`)
  if (doc.project.description) {
    lines.push('')
    lines.push(`> ${doc.project.description}`)
  }
  lines.push('')

  // Main Board
  lines.push('## Main Board')
  lines.push('')
  if (doc.mainBoard.boardSize) {
    lines.push(
      `**Size:** ${doc.mainBoard.boardSize.width} x ${doc.mainBoard.boardSize.height} ${doc.mainBoard.boardSize.unit}`
    )
    lines.push('')
  }

  lines.push('### Placed Blocks')
  lines.push('')
  lines.push('| Block | Position | Rotation |')
  lines.push('|-------|----------|----------|')
  for (const block of doc.mainBoard.placedBlocks) {
    lines.push(
      `| ${block.name} | (${block.gridPosition.x}, ${block.gridPosition.y}) | ${block.rotation}° |`
    )
  }
  lines.push('')

  // Design Justifications
  if (doc.designJustifications.length > 0) {
    lines.push('## Design Justifications')
    lines.push('')
    for (const j of doc.designJustifications) {
      lines.push(`### ${j.blockName}`)
      lines.push('')
      lines.push(j.reason)
      lines.push('')
    }
  }

  // Resistor Taps
  if (doc.resistorTaps.length > 0) {
    lines.push('## Resistor Tap Configuration')
    lines.push('')
    lines.push('| Block | Reference | Signal | Status | Reason |')
    lines.push('|-------|-----------|--------|--------|--------|')
    for (const tap of doc.resistorTaps) {
      const status = tap.populated ? '✓ Populated' : '✗ NoFit'
      lines.push(`| ${tap.blockName} | ${tap.reference} | ${tap.signal} | ${status} | ${tap.reason} |`)
    }
    lines.push('')
  }

  // Connections
  if (doc.connections.mainToRemote.length > 0) {
    lines.push('## Cable Connections')
    lines.push('')
    for (const conn of doc.connections.mainToRemote) {
      lines.push(`### ${conn.remoteBoardName}`)
      lines.push('')
      lines.push(`**Cable Type:** ${conn.cableType}`)
      lines.push('')
      lines.push('| Pin | Main Signal | Remote Signal |')
      lines.push('|-----|-------------|---------------|')
      for (const p of conn.pinout) {
        lines.push(`| ${p.pin} | ${p.mainSignal} | ${p.remoteSignal} |`)
      }
      lines.push('')
    }
  }

  // Remote Boards
  if (doc.remoteBoards.length > 0) {
    lines.push('## Remote Boards')
    lines.push('')
    for (const rb of doc.remoteBoards) {
      lines.push(`### ${rb.name}`)
      lines.push('')
      lines.push(`**Type:** ${rb.type}`)
      lines.push(`**Size:** ${rb.boardSize.width} x ${rb.boardSize.height} ${rb.boardSize.unit}`)
      lines.push('')
      if (rb.placedBlocks.length > 0) {
        lines.push('| Block | Position | Rotation |')
        lines.push('|-------|----------|----------|')
        for (const block of rb.placedBlocks) {
          lines.push(
            `| ${block.name} | (${block.gridPosition.x}, ${block.gridPosition.y}) | ${block.rotation}° |`
          )
        }
        lines.push('')
      }
    }
  }

  // Net Assignments
  if (doc.netAssignments.length > 0) {
    lines.push('## Net Assignments')
    lines.push('')
    lines.push('| Net | Global Net | GPIO |')
    lines.push('|-----|------------|------|')
    for (const n of doc.netAssignments) {
      lines.push(`| ${n.net} | ${n.globalNet} | ${n.gpio || '-'} |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('*Generated by PHAESTUS Hardware Design Platform*')

  return lines.join('\n')
}

/**
 * Extract just the connection information for assembly reference
 */
export function extractConnectionReference(doc: DesignDocument): string {
  const lines: string[] = []

  lines.push('# Cable Connection Reference')
  lines.push('')
  lines.push(`Project: ${doc.project.name}`)
  lines.push(`Generated: ${new Date(doc.generatedAt).toLocaleDateString()}`)
  lines.push('')

  if (doc.connections.mainToRemote.length === 0) {
    lines.push('No remote board connections.')
    return lines.join('\n')
  }

  for (const conn of doc.connections.mainToRemote) {
    lines.push(`## ${conn.remoteBoardName}`)
    lines.push('')
    lines.push(`Cable: ${conn.cableType}`)
    lines.push('')
    lines.push('```')
    for (const p of conn.pinout) {
      const padding = Math.max(0, 15 - p.mainSignal.length)
      lines.push(`Pin ${String(p.pin).padStart(2)}: ${p.mainSignal}${' '.repeat(padding)} <-> ${p.remoteSignal}`)
    }
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}
