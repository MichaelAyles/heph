/**
 * Export Stage View
 *
 * Download all project artifacts: spec PDF, PCB gerbers, enclosure STL, firmware, and complete package.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  FileText,
  Cpu,
  Box,
  Code,
  Package,
  ArrowRight,
  Loader2,
  Check,
  ExternalLink,
  Table,
  MessageSquare,
  Globe,
  User,
  ChevronRight,
  FileJson,
  Wrench,
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { clsx } from 'clsx'
import JSZip from 'jszip'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { generateManufacturingBOM, bomToCSV } from '@/services/bom-generator'
import {
  generateDesignDocument,
  designDocumentToJSON,
  designDocumentToMarkdown,
} from '@/services/design-document'
import {
  calculatePanelLayout,
  generateVScoreGerber,
  needsPanelization,
  mergeIntoPanelGerbers,
} from '@/services/panel-merge'
import {
  mergeGerbers,
  calculateBoardOutlineFromContent,
  type GerberBlock,
  type MergedGerbers,
} from '@/services/gerber-merge'
import type { PcbBlock, RemoteBoard } from '@/db/schema'

interface ConversationMessage {
  role: string
  content: string | Array<{ type: string; text?: string }>
}

interface Conversation {
  id: string
  messagesIn: ConversationMessage[]
  messageOut: string | null
  model: string | null
  createdAt: string
  promptTokens: number | null
  completionTokens: number | null
}

interface ExportItem {
  id: string
  icon: typeof Download
  title: string
  description: string
  filename: string
  ready: boolean
  onDownload: () => Promise<void>
}

interface VisibilitySettings {
  isPublic: boolean
  showAuthor: boolean
}

async function fetchVisibility(projectId: string): Promise<VisibilitySettings> {
  const res = await fetch(`/api/projects/${projectId}/visibility`)
  if (!res.ok) throw new Error('Failed to fetch visibility')
  return res.json()
}

async function updateVisibility(
  projectId: string,
  settings: Partial<VisibilitySettings>
): Promise<VisibilitySettings> {
  const res = await fetch(`/api/projects/${projectId}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Failed to update visibility')
  return res.json()
}

export function ExportStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()

  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())

  // Visibility settings for gallery publishing
  const { data: visibility, isLoading: visibilityLoading } = useQuery({
    queryKey: ['visibility', project?.id],
    queryFn: () => fetchVisibility(project!.id),
    enabled: !!project?.id && project?.status === 'complete',
  })

  const visibilityMutation = useMutation({
    mutationFn: (settings: Partial<VisibilitySettings>) => updateVisibility(project!.id, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visibility', project?.id] })
    },
  })

  // Fetch PCB blocks for BOM generation
  const { data: blocks = [] } = useQuery<PcbBlock[]>({
    queryKey: ['blocks'],
    queryFn: async () => {
      const res = await fetch('/api/blocks')
      if (!res.ok) throw new Error('Failed to fetch blocks')
      const data = await res.json()
      return data.blocks
    },
  })

  const firmwareComplete = project?.spec?.stages?.firmware?.status === 'complete'
  const hasPcbArtifacts = (project?.spec?.pcb?.placedBlocks?.length ?? 0) > 0
  const hasPanelization = project?.spec?.pcb ? needsPanelization(project.spec.pcb) : false

  // Generate spec as JSON/text
  const downloadSpec = async () => {
    if (!project?.spec) return

    const spec = project.spec
    const content = `# ${project.name || 'PHAESTUS Project'} Specification

## Overview
${project.description || 'No description provided'}

## Final Specification
${
  spec.finalSpec
    ? `
### ${spec.finalSpec.name}
${spec.finalSpec.summary}

### PCB Size
- Width: ${spec.finalSpec.pcbSize.width}mm
- Height: ${spec.finalSpec.pcbSize.height}mm

### Inputs
${spec.finalSpec.inputs.map((i) => `- ${i.type} x${i.count}${i.notes ? ` (${i.notes})` : ''}`).join('\n')}

### Outputs
${spec.finalSpec.outputs.map((o) => `- ${o.type} x${o.count}${o.notes ? ` (${o.notes})` : ''}`).join('\n')}

### Power
- Source: ${spec.finalSpec.power.source}
- Voltage: ${spec.finalSpec.power.voltage}
- Current: ${spec.finalSpec.power.current}
${spec.finalSpec.power.batteryLife ? `- Battery Life: ${spec.finalSpec.power.batteryLife}` : ''}

### Communication
- Type: ${spec.finalSpec.communication.type}
- Protocol: ${spec.finalSpec.communication.protocol}

### Enclosure
- Style: ${spec.finalSpec.enclosure.style}
- Dimensions: ${spec.finalSpec.enclosure.width} x ${spec.finalSpec.enclosure.height} x ${spec.finalSpec.enclosure.depth}mm

### Estimated BOM
| Item | Quantity | Unit Cost |
|------|----------|-----------|
${spec.finalSpec.estimatedBOM.map((b) => `| ${b.item} | ${b.quantity} | $${b.unitCost.toFixed(2)} |`).join('\n')}

**Total Estimated Cost:** $${spec.finalSpec.estimatedBOM.reduce((sum, b) => sum + b.quantity * b.unitCost, 0).toFixed(2)}
`
    : 'Final specification not yet generated'
}

## Decisions Made
${spec.decisions.map((d) => `- **${d.question}**: ${d.answer}`).join('\n') || 'No decisions recorded'}

---
Generated by PHAESTUS Hardware Design Platform
`

    const blob = new Blob([content], { type: 'text/markdown' })
    downloadBlob(blob, `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-spec.md`)
  }

  // Download enclosure OpenSCAD/STL
  const downloadEnclosure = async () => {
    if (!project?.spec?.enclosure) return

    const zip = new JSZip()

    // Add OpenSCAD source if available
    if (project.spec.enclosure.openScadCode) {
      zip.file('enclosure.scad', project.spec.enclosure.openScadCode)
    }

    // Add iterations history
    if (project.spec.enclosure.iterations?.length > 0) {
      for (let i = 0; i < project.spec.enclosure.iterations.length; i++) {
        const iter = project.spec.enclosure.iterations[i]
        zip.file(`iterations/v${i + 1}_${iter.timestamp.slice(0, 10)}.scad`, iter.openScadCode)
        if (iter.feedback) {
          zip.file(`iterations/v${i + 1}_feedback.txt`, iter.feedback)
        }
      }
    }

    // Add README
    zip.file(
      'README.md',
      `# Enclosure Files

## Files
- \`enclosure.scad\` - OpenSCAD source file

## How to Use
1. Open \`enclosure.scad\` in OpenSCAD
2. Press F5 to preview
3. Press F6 to render (may take a few minutes)
4. Export as STL: File > Export > Export as STL

## Printing Recommendations
- Material: PLA or PETG
- Layer Height: 0.2mm
- Infill: 15-20%
- Supports: Usually not needed (designed for supportless printing)

## Customization
Edit the parameters at the top of the .scad file to adjust:
- Wall thickness
- Corner radius
- PCB clearance
- Component cutout sizes
`
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(
      blob,
      `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-enclosure.zip`
    )
  }

  // Download BOM as CSV
  const downloadBOM = async () => {
    if (!project?.spec?.finalSpec?.estimatedBOM) return

    const bom = project.spec.finalSpec.estimatedBOM
    const headers = [
      'Item',
      'Quantity',
      'Unit Cost ($)',
      'Total Cost ($)',
      'Supplier',
      'Part Number',
    ]

    const rows = bom.map((b) => [
      b.item,
      b.quantity.toString(),
      b.unitCost.toFixed(2),
      (b.quantity * b.unitCost).toFixed(2),
      '', // Supplier - placeholder for user to fill
      '', // Part number - placeholder for user to fill
    ])

    // Add total row
    const totalCost = bom.reduce((sum, b) => sum + b.quantity * b.unitCost, 0)
    rows.push(['', '', 'TOTAL', totalCost.toFixed(2), '', ''])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(blob, `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-bom.csv`)
  }

  // Download Manufacturing BOM (from PCB blocks)
  const downloadManufacturingBOM = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const bom = generateManufacturingBOM(project.spec.pcb, blocks)
    const csv = bomToCSV(bom)

    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(
      blob,
      `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-manufacturing-bom.csv`
    )
  }

  // Download Design Document (JSON + Markdown)
  const downloadDesignDocument = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const zip = new JSZip()
    const projectSlug = project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'

    // Generate design document
    const doc = generateDesignDocument(project, project.spec.pcb, blocks)

    // Add JSON version
    zip.file(`${projectSlug}-design.json`, designDocumentToJSON(doc))

    // Add Markdown version
    zip.file(`${projectSlug}-design.md`, designDocumentToMarkdown(doc))

    // Add README
    zip.file(
      'README.md',
      `# Design Document

This archive contains the design documentation for ${project.name || 'your PHAESTUS project'}.

## Files

- \`${projectSlug}-design.json\` - Machine-readable design document
- \`${projectSlug}-design.md\` - Human-readable design document

## Contents

The design document includes:
- Block placements and positions
- Cable connection pinouts (main to remote boards)
- Design justifications for component selection
- Resistor tap (0R) configuration and isolation decisions
- Net assignments and GPIO mappings

## Usage

Use the JSON file for automated tools and the Markdown file for reference during assembly.
`
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${projectSlug}-design-document.zip`)
  }

  // Load gerber files for a block from R2
  const loadBlockGerbers = async (block: PcbBlock): Promise<GerberBlock['layers']> => {
    const layers: GerberBlock['layers'] = {}
    if (!block.files?.gerbers) return layers

    try {
      const res = await fetch(`/api/blocks/${block.slug}/files/${block.files.gerbers}`)
      if (!res.ok) return layers

      const blob = await res.blob()
      const zip = await JSZip.loadAsync(blob)

      // Map KiCad gerber extensions to layer names
      const layerMappings: Array<{ patterns: string[]; layer: keyof GerberBlock['layers'] }> = [
        { patterns: ['-F_Cu.gtl', '-f_cu'], layer: 'topCopper' },
        { patterns: ['-B_Cu.gbl', '-b_cu'], layer: 'bottomCopper' },
        { patterns: ['-In1_Cu.g1', '-in1_cu'], layer: 'innerCopper1' },
        { patterns: ['-In2_Cu.g2', '-in2_cu'], layer: 'innerCopper2' },
        { patterns: ['-F_Silkscreen.gto', '-f_silkscreen', '-F_SilkS'], layer: 'topSilk' },
        { patterns: ['-B_Silkscreen.gbo', '-b_silkscreen', '-B_SilkS'], layer: 'bottomSilk' },
        { patterns: ['-F_Mask.gts', '-f_mask'], layer: 'topMask' },
        { patterns: ['-B_Mask.gbs', '-b_mask'], layer: 'bottomMask' },
        { patterns: ['-Edge_Cuts.gm1', '-edge_cuts'], layer: 'edgeCuts' },
        { patterns: ['.drl'], layer: 'drill' },
      ]

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue
        const lowerFilename = filename.toLowerCase()

        for (const mapping of layerMappings) {
          if (mapping.patterns.some((p) => lowerFilename.includes(p.toLowerCase()))) {
            const content = await zipEntry.async('string')
            layers[mapping.layer] = content
            break
          }
        }
      }
    } catch (error) {
      logger.export('Failed to load block gerbers', { block: block.slug, error })
    }

    return layers
  }

  // Download merged Gerber files
  const downloadGerbers = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const zip = new JSZip()
    const projectSlug = project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'
    const pcb = project.spec.pcb

    try {
      // Load gerbers for each placed block
      const gerberBlocks: GerberBlock[] = []

      for (const placed of pcb.placedBlocks) {
        const block = blocks.find((b) => b.slug === placed.blockSlug)
        if (!block) continue

        const layers = await loadBlockGerbers(block)
        if (Object.keys(layers).filter((k) => layers[k as keyof typeof layers]).length === 0) {
          continue
        }

        gerberBlocks.push({
          name: placed.blockSlug,
          gridX: placed.gridX,
          gridY: placed.gridY,
          layers,
        })
      }

      if (gerberBlocks.length === 0) {
        logger.export('No gerber files available for any blocks')
        return
      }

      // Merge gerbers
      const merged = mergeGerbers(gerberBlocks)

      // Calculate board outline with 1mm margin
      const outline = calculateBoardOutlineFromContent(merged.topCopper, 1.0)
      merged.edgeCuts = outline.gerber

      // Add all layers to ZIP
      const layerFiles: Array<{ key: keyof MergedGerbers; ext: string }> = [
        { key: 'topCopper', ext: '-F_Cu.gtl' },
        { key: 'innerCopper1', ext: '-In1_Cu.g1' },
        { key: 'innerCopper2', ext: '-In2_Cu.g2' },
        { key: 'bottomCopper', ext: '-B_Cu.gbl' },
        { key: 'topSilk', ext: '-F_Silkscreen.gto' },
        { key: 'bottomSilk', ext: '-B_Silkscreen.gbo' },
        { key: 'topMask', ext: '-F_Mask.gts' },
        { key: 'bottomMask', ext: '-B_Mask.gbs' },
        { key: 'edgeCuts', ext: '-Edge_Cuts.gm1' },
        { key: 'drill', ext: '.drl' },
      ]

      for (const { key, ext } of layerFiles) {
        if (merged[key]) {
          zip.file(`${projectSlug}${ext}`, merged[key])
        }
      }

      // Add README
      zip.file(
        'README.md',
        `# ${project.name || 'PHAESTUS'} Gerber Files

Generated by PHAESTUS Hardware Design Platform

## Board Dimensions
- Width: ${outline.width.toFixed(2)}mm
- Height: ${outline.height.toFixed(2)}mm

## Files
- \`${projectSlug}-F_Cu.gtl\` - Top copper layer
- \`${projectSlug}-In1_Cu.g1\` - Inner copper layer 1
- \`${projectSlug}-In2_Cu.g2\` - Inner copper layer 2
- \`${projectSlug}-B_Cu.gbl\` - Bottom copper layer
- \`${projectSlug}-F_Silkscreen.gto\` - Top silkscreen
- \`${projectSlug}-B_Silkscreen.gbo\` - Bottom silkscreen
- \`${projectSlug}-F_Mask.gts\` - Top solder mask
- \`${projectSlug}-B_Mask.gbs\` - Bottom solder mask
- \`${projectSlug}-Edge_Cuts.gm1\` - Board outline
- \`${projectSlug}.drl\` - Drill file (Excellon)

## Manufacturing
1. Upload these files to your PCB manufacturer (JLCPCB, PCBWay, etc.)
2. Select 4-layer board
3. Verify layer mapping matches manufacturer's naming convention

## Verification
Open files in a Gerber viewer like https://tracespace.io/view/
`
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectSlug}-gerbers.zip`)
    } catch (error) {
      logger.export('Failed to generate merged gerbers', { error })
    }
  }

  // Download panelized Gerbers with v-score lines
  const downloadPanelGerbers = async () => {
    if (!project?.spec?.pcb || !hasPanelization) return

    const zip = new JSZip()
    const projectSlug = project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'
    const pcb = project.spec.pcb

    try {
      // Load and merge main board gerbers
      const mainBoardBlocks: GerberBlock[] = []

      for (const placed of pcb.placedBlocks) {
        const block = blocks.find((b) => b.slug === placed.blockSlug)
        if (!block) continue

        const layers = await loadBlockGerbers(block)
        if (Object.keys(layers).filter((k) => layers[k as keyof typeof layers]).length === 0) {
          continue
        }

        mainBoardBlocks.push({
          name: placed.blockSlug,
          gridX: placed.gridX,
          gridY: placed.gridY,
          layers,
        })
      }

      if (mainBoardBlocks.length === 0) {
        logger.export('No gerber files available for main board')
        return
      }

      // Merge main board gerbers
      const mainMerged = mergeGerbers(mainBoardBlocks)
      const mainOutline = calculateBoardOutlineFromContent(mainMerged.topCopper, 1.0)
      mainMerged.edgeCuts = mainOutline.gerber

      // Load remote board gerbers if any (with 1mm margins)
      const remoteBoards = pcb.remoteBoards || []
      const remoteBoardGerbers: Array<{ board: RemoteBoard; gerbers: MergedGerbers }> = []

      for (const remoteBoard of remoteBoards) {
        const remoteBlocks: GerberBlock[] = []

        for (const placed of remoteBoard.placedBlocks) {
          const block = blocks.find((b) => b.slug === placed.blockSlug)
          if (!block) continue

          const layers = await loadBlockGerbers(block)
          if (Object.keys(layers).filter((k) => layers[k as keyof typeof layers]).length === 0) {
            continue
          }

          remoteBlocks.push({
            name: placed.blockSlug,
            gridX: placed.gridX,
            gridY: placed.gridY,
            layers,
          })
        }

        if (remoteBlocks.length > 0) {
          const remoteMerged = mergeGerbers(remoteBlocks)
          // Calculate remote board outline with 1mm margin
          const remoteOutline = calculateBoardOutlineFromContent(remoteMerged.topCopper, 1.0)
          remoteMerged.edgeCuts = remoteOutline.gerber
          // Update the board size with actual dimensions including margin
          const boardWithMargin: RemoteBoard = {
            ...remoteBoard,
            boardSize: {
              width: remoteOutline.width,
              height: remoteOutline.height,
              unit: 'mm',
            },
          }
          remoteBoardGerbers.push({ board: boardWithMargin, gerbers: remoteMerged })
        }
      }

      // Calculate panel layout using actual board sizes with margins
      const mainBoardSize = { width: mainOutline.width, height: mainOutline.height }
      const remoteBoardsWithMargins = remoteBoardGerbers.map((rbg) => rbg.board)
      const panelConfig = calculatePanelLayout(mainBoardSize, remoteBoardsWithMargins)

      // Merge into panel if we have remote boards, otherwise just use main board
      let panelGerbers: MergedGerbers & { vScore: string; routedEdges: string }

      if (remoteBoardGerbers.length > 0) {
        panelGerbers = await mergeIntoPanelGerbers(mainMerged, remoteBoardGerbers, panelConfig)
      } else {
        // Just main board with v-score (no routed edges needed for single board)
        const vScoreGerber = generateVScoreGerber(panelConfig.vScoreLines)
        panelGerbers = { ...mainMerged, vScore: vScoreGerber, routedEdges: '' }
      }

      // Add all layers to ZIP
      const layerFiles: Array<{ key: keyof MergedGerbers; ext: string }> = [
        { key: 'topCopper', ext: '-F_Cu.gtl' },
        { key: 'innerCopper1', ext: '-In1_Cu.g1' },
        { key: 'innerCopper2', ext: '-In2_Cu.g2' },
        { key: 'bottomCopper', ext: '-B_Cu.gbl' },
        { key: 'topSilk', ext: '-F_Silkscreen.gto' },
        { key: 'bottomSilk', ext: '-B_Silkscreen.gbo' },
        { key: 'topMask', ext: '-F_Mask.gts' },
        { key: 'bottomMask', ext: '-B_Mask.gbs' },
        { key: 'edgeCuts', ext: '-Edge_Cuts.gm1' },
        { key: 'drill', ext: '.drl' },
      ]

      for (const { key, ext } of layerFiles) {
        if (panelGerbers[key]) {
          zip.file(`${projectSlug}-panel${ext}`, panelGerbers[key])
        }
      }

      // Add v-score layer
      zip.file(`${projectSlug}-panel-VScore.gbr`, panelGerbers.vScore)

      // Add routed edges layer (for boards with different heights)
      if (panelGerbers.routedEdges) {
        zip.file(`${projectSlug}-panel-RoutedEdges.gbr`, panelGerbers.routedEdges)
      }

      // Add panel configuration JSON
      zip.file(`${projectSlug}-panel-config.json`, JSON.stringify(panelConfig, null, 2))

      // Add README
      zip.file(
        'README.md',
        `# ${project.name || 'PHAESTUS'} Panelized Gerbers

Generated by PHAESTUS Hardware Design Platform

## Panel Configuration
- Panel Size: ${panelConfig.panelSize.width.toFixed(1)} x ${panelConfig.panelSize.height.toFixed(1)} mm
- Boards: ${1 + remoteBoards.length} (1 main + ${remoteBoards.length} remote)
- V-Score Lines: ${panelConfig.vScoreLines.length}
- Routed Edges: ${panelConfig.routedEdges?.length ?? 0}

## Files
### Gerber Layers
- \`${projectSlug}-panel-F_Cu.gtl\` - Top copper
- \`${projectSlug}-panel-In1_Cu.g1\` - Inner 1
- \`${projectSlug}-panel-In2_Cu.g2\` - Inner 2
- \`${projectSlug}-panel-B_Cu.gbl\` - Bottom copper
- \`${projectSlug}-panel-F_Silkscreen.gto\` - Top silk
- \`${projectSlug}-panel-B_Silkscreen.gbo\` - Bottom silk
- \`${projectSlug}-panel-F_Mask.gts\` - Top mask
- \`${projectSlug}-panel-B_Mask.gbs\` - Bottom mask
- \`${projectSlug}-panel-Edge_Cuts.gm1\` - Panel outline
- \`${projectSlug}-panel.drl\` - Drill file

### Panel-Specific
- \`${projectSlug}-panel-VScore.gbr\` - V-score lines for board separation
- \`${projectSlug}-panel-RoutedEdges.gbr\` - Routed edges for boards with different heights (if any)
- \`${projectSlug}-panel-config.json\` - Panel layout configuration

## Manufacturing Notes
1. V-score lines indicate where to separate boards after assembly
2. V-scoring is typically 1/3 board thickness from each side
3. Routed edges are milled cuts for board edges that cannot be v-scored (different heights)
4. Order panel with breakaway tabs if v-scoring is not available

## Board Positions
- Main Board: (${panelConfig.mainBoardPosition.x}, ${panelConfig.mainBoardPosition.y}) mm
${remoteBoards.map((rb, i) => {
  const pos = panelConfig.remoteBoards[i]
  return `- ${rb.name}: (${pos.position.x}, ${pos.position.y}) mm`
}).join('\n')}

## Verification
Open files in a Gerber viewer like https://tracespace.io/view/
`
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${projectSlug}-panel-gerbers.zip`)
    } catch (error) {
      logger.export('Failed to generate panel gerbers', { error })
    }
  }

  // Download firmware source
  const downloadFirmware = async () => {
    if (!project?.spec?.firmware?.files) return

    const zip = new JSZip()

    for (const file of project.spec.firmware.files) {
      // Map 'json' language back to .ini for platformio.ini
      const actualPath = file.path === 'platformio.ini' ? file.path : file.path
      zip.file(actualPath, file.content)
    }

    // Add README
    zip.file(
      'README.md',
      `# ${project.name || 'PHAESTUS'} Firmware

Generated by PHAESTUS Hardware Design Platform

## Building with PlatformIO

### Option 1: VS Code
1. Install [PlatformIO IDE extension](https://platformio.org/install/ide?install=vscode)
2. Open this folder in VS Code
3. Click "Build" in the PlatformIO toolbar
4. Click "Upload" to flash to your ESP32-C6

### Option 2: Command Line
\`\`\`bash
# Install PlatformIO CLI
pip install platformio

# Build
pio run

# Upload to device
pio run -t upload

# Monitor serial output
pio device monitor
\`\`\`

## Binary Output
After building, find the binary at:
\`.pio/build/esp32c6/firmware.bin\`
`
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(
      blob,
      `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-firmware.zip`
    )
  }

  // Download conversations as markdown
  const downloadConversations = async () => {
    if (!project?.id) return

    try {
      // Fetch all conversations for this project
      const res = await fetch(`/api/projects/${project.id}/conversations?limit=200`)
      if (!res.ok) {
        logger.export('Failed to fetch conversations - may require admin access')
        return
      }

      const { conversations } = (await res.json()) as { conversations: Conversation[] }

      if (conversations.length === 0) {
        // No conversations to export
        const blob = new Blob(
          ['# Conversation History\n\nNo conversations recorded for this project.'],
          { type: 'text/markdown' }
        )
        downloadBlob(
          blob,
          `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-conversations.md`
        )
        return
      }

      // Group conversations by stage (inferred from message content)
      const grouped = groupConversationsByStage(conversations)

      // Create ZIP with separate files per stage
      const zip = new JSZip()

      for (const [stage, convos] of Object.entries(grouped)) {
        const content = formatConversationsAsMarkdown(stage, convos)
        zip.file(`${stage}-chat.md`, content)
      }

      // Add combined file
      const allContent = Object.entries(grouped)
        .map(([stage, convos]) => formatConversationsAsMarkdown(stage, convos))
        .join('\n\n---\n\n')

      zip.file('all-conversations.md', `# Complete Conversation History\n\n${allContent}`)

      // Add README
      zip.file(
        'README.md',
        `# Conversation Export

This archive contains the AI conversation history for your project, organized by stage.

## Files
${Object.keys(grouped)
  .map(
    (stage) =>
      `- \`${stage}-chat.md\` - ${stage.charAt(0).toUpperCase() + stage.slice(1)} stage conversations`
  )
  .join('\n')}
- \`all-conversations.md\` - Combined view of all conversations

## Usage
These conversations document the design process and can be used for:
- Understanding design decisions
- Reproducing the design process
- Debugging issues
- Training documentation
`
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(
        blob,
        `${project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'}-conversations.zip`
      )
    } catch (error) {
      logger.export('Failed to export conversations', { error })
    }
  }

  // Helper: Group conversations by inferred stage
  function groupConversationsByStage(
    conversations: Conversation[]
  ): Record<string, Conversation[]> {
    const grouped: Record<string, Conversation[]> = {
      spec: [],
      pcb: [],
      enclosure: [],
      firmware: [],
      other: [],
    }

    for (const conv of conversations) {
      // Infer stage from message content
      const stage = inferStageFromConversation(conv)
      grouped[stage].push(conv)
    }

    // Remove empty stages
    return Object.fromEntries(Object.entries(grouped).filter(([, convos]) => convos.length > 0))
  }

  // Helper: Infer which stage a conversation belongs to
  function inferStageFromConversation(conv: Conversation): string {
    const allText = [
      ...conv.messagesIn.map((m) =>
        typeof m.content === 'string' ? m.content : m.content.map((c) => c.text || '').join(' ')
      ),
      conv.messageOut || '',
    ]
      .join(' ')
      .toLowerCase()

    // Match keywords to stages
    if (
      allText.includes('feasibility') ||
      allText.includes('refinement') ||
      allText.includes('blueprint')
    ) {
      return 'spec'
    }
    if (allText.includes('pcb') || allText.includes('schematic') || allText.includes('circuit')) {
      return 'pcb'
    }
    if (allText.includes('enclosure') || allText.includes('openscad') || allText.includes('stl')) {
      return 'enclosure'
    }
    if (
      allText.includes('firmware') ||
      allText.includes('platformio') ||
      allText.includes('esp32')
    ) {
      return 'firmware'
    }

    return 'other'
  }

  // Helper: Format conversations as markdown
  function formatConversationsAsMarkdown(stage: string, conversations: Conversation[]): string {
    const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1)

    let md = `# ${stageLabel} Stage Conversations\n\n`
    md += `*${conversations.length} conversation${conversations.length !== 1 ? 's' : ''} recorded*\n\n`

    // Sort by date (oldest first for readability)
    const sorted = [...conversations].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    for (const conv of sorted) {
      const date = new Date(conv.createdAt).toLocaleString()
      md += `---\n\n## ${date}\n\n`

      if (conv.model) {
        md += `*Model: ${conv.model}*\n\n`
      }

      // Format messages
      for (const msg of conv.messagesIn) {
        const roleLabel =
          msg.role === 'system' ? '**System**' : msg.role === 'user' ? '**User**' : '**Assistant**'
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content.map((c) => c.text || '').join('\n')

        md += `${roleLabel}:\n\n${content}\n\n`
      }

      // Add response
      if (conv.messageOut) {
        md += `**Assistant**:\n\n${conv.messageOut}\n\n`
      }

      // Add token stats if available
      if (conv.promptTokens || conv.completionTokens) {
        md += `*Tokens: ${conv.promptTokens || 0} in, ${conv.completionTokens || 0} out*\n\n`
      }
    }

    return md
  }

  // Download complete package
  const downloadComplete = async () => {
    if (!project?.spec) return

    const zip = new JSZip()
    const projectSlug = project.name?.toLowerCase().replace(/\s+/g, '-') || 'project'

    // Add spec markdown
    const specContent = generateSpecMarkdown()
    zip.file(`${projectSlug}-spec.md`, specContent)

    // Add spec as JSON
    zip.file(`${projectSlug}-spec.json`, JSON.stringify(project.spec, null, 2))

    // Add BOM as CSV if available
    if (project.spec.finalSpec?.estimatedBOM?.length) {
      const bom = project.spec.finalSpec.estimatedBOM
      const headers = [
        'Item',
        'Quantity',
        'Unit Cost ($)',
        'Total Cost ($)',
        'Supplier',
        'Part Number',
      ]
      const rows = bom.map((b) => [
        b.item,
        b.quantity.toString(),
        b.unitCost.toFixed(2),
        (b.quantity * b.unitCost).toFixed(2),
        '',
        '',
      ])
      const totalCost = bom.reduce((sum, b) => sum + b.quantity * b.unitCost, 0)
      rows.push(['', '', 'TOTAL', totalCost.toFixed(2), '', ''])
      const csv = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n')
      zip.file(`${projectSlug}-bom.csv`, csv)
    }

    // Add enclosure if available
    if (project.spec.enclosure?.openScadCode) {
      zip.file('enclosure/enclosure.scad', project.spec.enclosure.openScadCode)
    }

    // Add firmware if available
    if (project.spec.firmware?.files) {
      for (const file of project.spec.firmware.files) {
        zip.file(`firmware/${file.path}`, file.content)
      }
    }

    // Add master README
    zip.file(
      'README.md',
      `# ${project.name || 'PHAESTUS Project'}

${project.description || ''}

## Contents
- \`${projectSlug}-spec.md\` - Human-readable specification
- \`${projectSlug}-spec.json\` - Machine-readable specification
- \`${projectSlug}-bom.csv\` - Bill of materials for sourcing
- \`enclosure/\` - OpenSCAD enclosure files
- \`firmware/\` - ESP32-C6 firmware source

## Quick Start

### Enclosure
1. Open \`enclosure/enclosure.scad\` in OpenSCAD
2. Render (F6) and export as STL
3. 3D print with PLA/PETG

### Firmware
1. Open \`firmware/\` in PlatformIO
2. Build and upload to ESP32-C6
3. Monitor serial output for debugging

## Generated By
PHAESTUS Hardware Design Platform
https://phaestus.app
`
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${projectSlug}-complete.zip`)
  }

  function generateSpecMarkdown(): string {
    const spec = project?.spec
    if (!spec) return ''

    return `# ${project?.name || 'PHAESTUS Project'} Specification

## Overview
${project?.description || 'No description provided'}

${
  spec.finalSpec
    ? `
## Final Specification

### ${spec.finalSpec.name}
${spec.finalSpec.summary}

### Hardware

#### PCB
- Size: ${spec.finalSpec.pcbSize.width}mm x ${spec.finalSpec.pcbSize.height}mm

#### Inputs
${spec.finalSpec.inputs.map((i) => `- ${i.type} x${i.count}${i.notes ? ` - ${i.notes}` : ''}`).join('\n')}

#### Outputs
${spec.finalSpec.outputs.map((o) => `- ${o.type} x${o.count}${o.notes ? ` - ${o.notes}` : ''}`).join('\n')}

#### Power
- Source: ${spec.finalSpec.power.source}
- Voltage: ${spec.finalSpec.power.voltage}
- Current: ${spec.finalSpec.power.current}
${spec.finalSpec.power.batteryLife ? `- Estimated Battery Life: ${spec.finalSpec.power.batteryLife}` : ''}

#### Communication
- Type: ${spec.finalSpec.communication.type}
- Protocol: ${spec.finalSpec.communication.protocol}

### Enclosure
- Style: ${spec.finalSpec.enclosure.style}
- Dimensions: ${spec.finalSpec.enclosure.width}mm x ${spec.finalSpec.enclosure.height}mm x ${spec.finalSpec.enclosure.depth}mm

### Bill of Materials
| Item | Qty | Unit Cost | Total |
|------|-----|-----------|-------|
${spec.finalSpec.estimatedBOM.map((b) => `| ${b.item} | ${b.quantity} | $${b.unitCost.toFixed(2)} | $${(b.quantity * b.unitCost).toFixed(2)} |`).join('\n')}
| **Total** | | | **$${spec.finalSpec.estimatedBOM.reduce((sum, b) => sum + b.quantity * b.unitCost, 0).toFixed(2)}** |
`
    : 'Final specification not yet generated'
}

## Design Decisions
${spec.decisions.length > 0 ? spec.decisions.map((d) => `### ${d.question}\n${d.answer}\n`).join('\n') : 'No decisions recorded'}

---
*Generated by PHAESTUS Hardware Design Platform*
`
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownload = async (id: string, downloadFn: () => Promise<void>) => {
    setDownloading(id)
    try {
      await downloadFn()
      setDownloaded((prev) => new Set(prev).add(id))
    } catch (error) {
      logger.export(`Download failed for ${id}`, { error })
    } finally {
      setDownloading(null)
    }
  }

  if (!firmwareComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Download className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Export & Manufacture</h2>
          <p className="text-steel-dim mb-4">
            Complete all stages to export your design files. You'll be able to download Gerbers, STL
            files, firmware binaries, and BOM.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Complete All Stages</span>
            <ArrowRight className="w-4 h-4" />
            <span>Export Files</span>
          </div>
        </div>
      </div>
    )
  }

  const exportItems: ExportItem[] = [
    {
      id: 'spec',
      icon: FileText,
      title: 'Specification',
      description: 'Complete project specification with requirements and BOM',
      filename: 'spec.md',
      ready: !!project?.spec?.finalSpec,
      onDownload: downloadSpec,
    },
    {
      id: 'bom',
      icon: Table,
      title: 'Bill of Materials',
      description: 'Component list as CSV for sourcing',
      filename: 'bom.csv',
      ready: (project?.spec?.finalSpec?.estimatedBOM?.length ?? 0) > 0,
      onDownload: downloadBOM,
    },
    {
      id: 'manufacturing-bom',
      icon: Wrench,
      title: 'Manufacturing BOM',
      description: 'Component list from PCB blocks with nofit marking',
      filename: 'manufacturing-bom.csv',
      ready: hasPcbArtifacts,
      onDownload: downloadManufacturingBOM,
    },
    {
      id: 'design-document',
      icon: FileJson,
      title: 'Design Document',
      description: 'Connections, justifications, 0R tap status (JSON/MD)',
      filename: 'design-document.zip',
      ready: hasPcbArtifacts,
      onDownload: downloadDesignDocument,
    },
    {
      id: 'gerbers',
      icon: Cpu,
      title: 'Gerber Files',
      description: 'Merged PCB manufacturing files for fabrication',
      filename: 'gerbers.zip',
      ready: hasPcbArtifacts,
      onDownload: downloadGerbers,
    },
    {
      id: 'panel-gerbers',
      icon: Cpu,
      title: 'Panelized Gerbers',
      description: 'V-score lines and panel layout for multi-board manufacturing',
      filename: 'panel-gerbers.zip',
      ready: hasPanelization,
      onDownload: downloadPanelGerbers,
    },
    {
      id: 'enclosure',
      icon: Box,
      title: 'Enclosure Files',
      description: 'OpenSCAD source for 3D printable enclosure',
      filename: 'enclosure.zip',
      ready: !!project?.spec?.enclosure?.openScadCode,
      onDownload: downloadEnclosure,
    },
    {
      id: 'firmware',
      icon: Code,
      title: 'Firmware Source',
      description: 'ESP32-C6 PlatformIO project',
      filename: 'firmware.zip',
      ready: (project?.spec?.firmware?.files?.length ?? 0) > 0,
      onDownload: downloadFirmware,
    },
    {
      id: 'conversations',
      icon: MessageSquare,
      title: 'Chat History',
      description: 'AI conversation logs organized by stage',
      filename: 'conversations.zip',
      ready: true, // Admin only, but always show option
      onDownload: downloadConversations,
    },
    {
      id: 'complete',
      icon: Package,
      title: 'Complete Package',
      description: 'All files in a single download',
      filename: 'complete.zip',
      ready: true,
      onDownload: downloadComplete,
    },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto p-6">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-xl font-semibold text-steel mb-1">Export & Manufacture</h2>
        <p className="text-steel-dim text-sm">Download design files to manufacture your hardware</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {exportItems.map((item) => {
          const isDownloading = downloading === item.id
          const isDownloaded = downloaded.has(item.id)

          return (
            <div key={item.id} className="bg-surface-900 rounded-lg border border-surface-700 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-steel mb-0.5">{item.title}</h3>
                  <p className="text-xs text-steel-dim mb-3">{item.description}</p>
                  {item.ready ? (
                    <button
                      onClick={() => handleDownload(item.id, item.onDownload)}
                      disabled={isDownloading}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                        isDownloaded
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-ash bg-copper hover:bg-copper-light'
                      )}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Preparing...
                        </>
                      ) : isDownloaded ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Downloaded
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          {item.filename}
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-surface-500">Not yet available</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Gallery Publishing */}
      <div className="mt-8 max-w-2xl">
        <div className="bg-surface-900 rounded-lg border border-surface-700 p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5 text-copper" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-steel mb-1">Share to Gallery</h3>
              <p className="text-xs text-steel-dim mb-4">
                Make your project visible to the public. Others can view your specifications and
                design concepts.
              </p>

              {visibilityLoading ? (
                <div className="flex items-center gap-2 text-xs text-steel-dim">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Publish toggle */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
                      <span className="text-sm text-steel">Publish to Gallery</span>
                    </div>
                    <button
                      onClick={() => visibilityMutation.mutate({ isPublic: !visibility?.isPublic })}
                      disabled={visibilityMutation.isPending}
                      className={clsx(
                        'relative w-10 h-5 rounded-full transition-colors',
                        visibility?.isPublic ? 'bg-copper' : 'bg-surface-600'
                      )}
                    >
                      <span
                        className={clsx(
                          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                          visibility?.isPublic && 'translate-x-5'
                        )}
                      />
                    </button>
                  </label>

                  {/* Author toggle (only shown when published) */}
                  {visibility?.isPublic && (
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
                        <span className="text-sm text-steel">Show my username</span>
                      </div>
                      <button
                        onClick={() =>
                          visibilityMutation.mutate({ showAuthor: !visibility?.showAuthor })
                        }
                        disabled={visibilityMutation.isPending}
                        className={clsx(
                          'relative w-10 h-5 rounded-full transition-colors',
                          visibility?.showAuthor ? 'bg-copper' : 'bg-surface-600'
                        )}
                      >
                        <span
                          className={clsx(
                            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                            visibility?.showAuthor && 'translate-x-5'
                          )}
                        />
                      </button>
                    </label>
                  )}

                  {/* Link to gallery */}
                  {visibility?.isPublic && project?.id && (
                    <Link
                      to={`/gallery/${project.id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-copper hover:text-copper-light transition-colors mt-2"
                    >
                      View in Gallery
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* External Resources */}
      <div className="mt-8 max-w-2xl">
        <h3 className="text-sm font-medium text-steel mb-3">Manufacturing Resources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <a
            href="https://jlcpcb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-surface-900 border border-surface-700 rounded-lg hover:border-surface-600 transition-colors"
          >
            <Cpu className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
            <div className="flex-1">
              <span className="text-sm text-steel">JLCPCB</span>
              <p className="text-xs text-steel-dim">PCB manufacturing</p>
            </div>
            <ExternalLink className="w-4 h-4 text-surface-500" strokeWidth={1.5} />
          </a>
          <a
            href="https://www.pcbway.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-surface-900 border border-surface-700 rounded-lg hover:border-surface-600 transition-colors"
          >
            <Cpu className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
            <div className="flex-1">
              <span className="text-sm text-steel">PCBWay</span>
              <p className="text-xs text-steel-dim">PCB manufacturing</p>
            </div>
            <ExternalLink className="w-4 h-4 text-surface-500" strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </div>
  )
}
