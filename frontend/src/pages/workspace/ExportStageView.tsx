/**
 * Export Stage View - Download all project artifacts
 *
 * Exports: spec PDF, PCB gerbers, enclosure STL, firmware, and complete package.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  FileText,
  Cpu,
  Box,
  Code,
  Package,
  Table,
  MessageSquare,
  FileJson,
  Wrench,
} from 'lucide-react'
import { logger } from '../../lib/logger'
import JSZip from 'jszip'
import { useWorkspaceContext } from '../../components/workspace/WorkspaceLayout'
import { generateManufacturingBOM, bomToCSV } from '../../services/bom-generator'
import {
  generateDesignDocument,
  designDocumentToJSON,
  designDocumentToMarkdown,
} from '../../services/design-document'
import {
  calculatePanelLayout,
  generateVScoreGerber,
  needsPanelization,
  mergeIntoPanelGerbers,
} from '../../services/panel-merge'
import {
  mergeGerbers,
  calculateBoardOutlineFromContent,
  type GerberBlock,
  type MergedGerbers,
} from '../../services/gerber-merge'
import {
  ExportItemCard,
  GalleryPublishing,
  ManufacturingResources,
  NotReadyState,
  downloadBlob,
  groupConversationsByStage,
  formatConversationsAsMarkdown,
  type ExportItem,
  type VisibilitySettings,
  type Conversation,
} from '../../components/export'
import type { PcbBlock, RemoteBoard } from '../../db/schema'

// =============================================================================
// API Functions
// =============================================================================

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

// =============================================================================
// Main Component
// =============================================================================

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

  // =============================================================================
  // Download Functions
  // =============================================================================

  const downloadSpec = async () => {
    if (!project?.spec) return
    const content = generateSpecMarkdown()
    const blob = new Blob([content], { type: 'text/markdown' })
    downloadBlob(blob, `${getProjectSlug()}-spec.md`)
  }

  const downloadEnclosure = async () => {
    if (!project?.spec?.enclosure) return

    const zip = new JSZip()

    if (project.spec.enclosure.openScadCode) {
      zip.file('enclosure.scad', project.spec.enclosure.openScadCode)
    }

    if (project.spec.enclosure.iterations?.length > 0) {
      for (let i = 0; i < project.spec.enclosure.iterations.length; i++) {
        const iter = project.spec.enclosure.iterations[i]
        zip.file(`iterations/v${i + 1}_${iter.timestamp.slice(0, 10)}.scad`, iter.openScadCode)
        if (iter.feedback) {
          zip.file(`iterations/v${i + 1}_feedback.txt`, iter.feedback)
        }
      }
    }

    zip.file('README.md', getEnclosureReadme())

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${getProjectSlug()}-enclosure.zip`)
  }

  const downloadBOM = async () => {
    if (!project?.spec?.finalSpec?.estimatedBOM) return

    const bom = project.spec.finalSpec.estimatedBOM
    const csv = generateBOMCSV(bom)
    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(blob, `${getProjectSlug()}-bom.csv`)
  }

  const downloadManufacturingBOM = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const bom = generateManufacturingBOM(project.spec.pcb, blocks)
    const csv = bomToCSV(bom)
    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(blob, `${getProjectSlug()}-manufacturing-bom.csv`)
  }

  const downloadDesignDocument = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const zip = new JSZip()
    const doc = generateDesignDocument(project, project.spec.pcb, blocks)

    zip.file(`${getProjectSlug()}-design.json`, designDocumentToJSON(doc))
    zip.file(`${getProjectSlug()}-design.md`, designDocumentToMarkdown(doc))
    zip.file('README.md', getDesignDocReadme())

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${getProjectSlug()}-design-document.zip`)
  }

  const downloadGerbers = async () => {
    if (!project?.spec?.pcb || !hasPcbArtifacts) return

    const zip = new JSZip()
    const pcb = project.spec.pcb

    try {
      const gerberBlocks = await loadGerberBlocks(pcb.placedBlocks, blocks)
      if (gerberBlocks.length === 0) {
        logger.export('No gerber files available for any blocks')
        return
      }

      const merged = mergeGerbers(gerberBlocks)
      const outline = calculateBoardOutlineFromContent(merged.topCopper, 1.0)
      merged.edgeCuts = outline.gerber

      addGerberLayers(zip, merged, getProjectSlug())
      zip.file('README.md', getGerberReadme(outline.width, outline.height))

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${getProjectSlug()}-gerbers.zip`)
    } catch (error) {
      logger.export('Failed to generate merged gerbers', { error })
    }
  }

  const downloadPanelGerbers = async () => {
    if (!project?.spec?.pcb || !hasPanelization) return

    const zip = new JSZip()
    const pcb = project.spec.pcb

    try {
      const mainBoardBlocks = await loadGerberBlocks(pcb.placedBlocks, blocks)
      if (mainBoardBlocks.length === 0) {
        logger.export('No gerber files available for main board')
        return
      }

      const mainMerged = mergeGerbers(mainBoardBlocks)
      const mainOutline = calculateBoardOutlineFromContent(mainMerged.topCopper, 1.0)
      mainMerged.edgeCuts = mainOutline.gerber

      const remoteBoards = pcb.remoteBoards || []
      const remoteBoardGerbers: Array<{ board: RemoteBoard; gerbers: MergedGerbers }> = []

      for (const remoteBoard of remoteBoards) {
        const remoteBlocks = await loadGerberBlocks(remoteBoard.placedBlocks, blocks)
        if (remoteBlocks.length > 0) {
          const remoteMerged = mergeGerbers(remoteBlocks)
          const remoteOutline = calculateBoardOutlineFromContent(remoteMerged.topCopper, 1.0)
          remoteMerged.edgeCuts = remoteOutline.gerber

          const boardWithMargin: RemoteBoard = {
            ...remoteBoard,
            boardSize: { width: remoteOutline.width, height: remoteOutline.height, unit: 'mm' },
          }
          remoteBoardGerbers.push({ board: boardWithMargin, gerbers: remoteMerged })
        }
      }

      const mainBoardSize = { width: mainOutline.width, height: mainOutline.height }
      const remoteBoardsWithActualSizes = remoteBoardGerbers.map((rbg) => ({
        board: rbg.board,
        actualSize: { width: rbg.board.boardSize.width, height: rbg.board.boardSize.height },
      }))
      const panelConfig = calculatePanelLayout(mainBoardSize, remoteBoardsWithActualSizes)

      let panelGerbers: MergedGerbers & { vScore: string; routedEdges: string }

      if (remoteBoardGerbers.length > 0) {
        panelGerbers = await mergeIntoPanelGerbers(mainMerged, remoteBoardGerbers, panelConfig)
      } else {
        const vScoreGerber = generateVScoreGerber(panelConfig.vScoreLines)
        panelGerbers = { ...mainMerged, vScore: vScoreGerber, routedEdges: '' }
      }

      addGerberLayers(zip, panelGerbers, `${getProjectSlug()}-panel`)
      zip.file(`${getProjectSlug()}-panel-VScore.gbr`, panelGerbers.vScore)
      if (panelGerbers.routedEdges) {
        zip.file(`${getProjectSlug()}-panel-RoutedEdges.gbr`, panelGerbers.routedEdges)
      }
      zip.file(`${getProjectSlug()}-panel-config.json`, JSON.stringify(panelConfig, null, 2))
      zip.file('README.md', getPanelReadme(panelConfig, remoteBoards))

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${getProjectSlug()}-panel-gerbers.zip`)
    } catch (error) {
      logger.export('Failed to generate panel gerbers', { error })
    }
  }

  const downloadFirmware = async () => {
    if (!project?.spec?.firmware?.files) return

    const zip = new JSZip()

    for (const file of project.spec.firmware.files) {
      zip.file(file.path, file.content)
    }

    zip.file('README.md', getFirmwareReadme())

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${getProjectSlug()}-firmware.zip`)
  }

  const downloadConversations = async () => {
    if (!project?.id) return

    try {
      const res = await fetch(`/api/projects/${project.id}/conversations?limit=200`)
      if (!res.ok) {
        logger.export('Failed to fetch conversations - may require admin access')
        return
      }

      const { conversations } = (await res.json()) as { conversations: Conversation[] }

      if (conversations.length === 0) {
        const blob = new Blob(
          ['# Conversation History\n\nNo conversations recorded for this project.'],
          { type: 'text/markdown' }
        )
        downloadBlob(blob, `${getProjectSlug()}-conversations.md`)
        return
      }

      const grouped = groupConversationsByStage(conversations)
      const zip = new JSZip()

      for (const [stage, convos] of Object.entries(grouped)) {
        const content = formatConversationsAsMarkdown(stage, convos)
        zip.file(`${stage}-chat.md`, content)
      }

      const allContent = Object.entries(grouped)
        .map(([stage, convos]) => formatConversationsAsMarkdown(stage, convos))
        .join('\n\n---\n\n')

      zip.file('all-conversations.md', `# Complete Conversation History\n\n${allContent}`)
      zip.file('README.md', getConversationsReadme(Object.keys(grouped)))

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${getProjectSlug()}-conversations.zip`)
    } catch (error) {
      logger.export('Failed to export conversations', { error })
    }
  }

  const downloadComplete = async () => {
    if (!project?.spec) return

    const zip = new JSZip()

    zip.file(`${getProjectSlug()}-spec.md`, generateSpecMarkdown())
    zip.file(`${getProjectSlug()}-spec.json`, JSON.stringify(project.spec, null, 2))

    if (project.spec.finalSpec?.estimatedBOM?.length) {
      zip.file(`${getProjectSlug()}-bom.csv`, generateBOMCSV(project.spec.finalSpec.estimatedBOM))
    }

    if (project.spec.enclosure?.openScadCode) {
      zip.file('enclosure/enclosure.scad', project.spec.enclosure.openScadCode)
    }

    if (project.spec.firmware?.files) {
      for (const file of project.spec.firmware.files) {
        zip.file(`firmware/${file.path}`, file.content)
      }
    }

    zip.file('README.md', getCompleteReadme())

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${getProjectSlug()}-complete.zip`)
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  const getProjectSlug = () => project?.name?.toLowerCase().replace(/\s+/g, '-') || 'project'

  const loadBlockGerbers = async (block: PcbBlock): Promise<GerberBlock['layers']> => {
    const layers: GerberBlock['layers'] = {}
    if (!block.files?.gerbers) return layers

    try {
      const res = await fetch(`/api/blocks/${block.slug}/files/${block.files.gerbers}`)
      if (!res.ok) return layers

      const blob = await res.blob()
      const zip = await JSZip.loadAsync(blob)

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

  const loadGerberBlocks = async (
    placedBlocks: Array<{ blockSlug: string; gridX: number; gridY: number }>,
    blockDefs: PcbBlock[]
  ): Promise<GerberBlock[]> => {
    const gerberBlocks: GerberBlock[] = []

    for (const placed of placedBlocks) {
      const block = blockDefs.find((b) => b.slug === placed.blockSlug)
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

    return gerberBlocks
  }

  const addGerberLayers = (zip: JSZip, merged: MergedGerbers, prefix: string) => {
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
        zip.file(`${prefix}${ext}`, merged[key])
      }
    }
  }

  const generateBOMCSV = (bom: Array<{ item: string; quantity: number; unitCost: number }>) => {
    const headers = ['Item', 'Quantity', 'Unit Cost ($)', 'Total Cost ($)', 'Supplier', 'Part Number']
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

    return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')
  }

  const generateSpecMarkdown = (): string => {
    const spec = project?.spec
    if (!spec) return ''

    let md = `# ${project?.name || 'PHAESTUS Project'} Specification\n\n`
    md += `## Overview\n${project?.description || 'No description provided'}\n\n`

    if (spec.finalSpec) {
      md += `## Final Specification\n\n### ${spec.finalSpec.name}\n${spec.finalSpec.summary}\n\n`
      md += `### PCB Size\n- Width: ${spec.finalSpec.pcbSize.width}mm\n- Height: ${spec.finalSpec.pcbSize.height}mm\n\n`
      md += `### Inputs\n${spec.finalSpec.inputs.map((i) => `- ${i.type} x${i.count}${i.notes ? ` (${i.notes})` : ''}`).join('\n')}\n\n`
      md += `### Outputs\n${spec.finalSpec.outputs.map((o) => `- ${o.type} x${o.count}${o.notes ? ` (${o.notes})` : ''}`).join('\n')}\n\n`
      md += `### Power\n- Source: ${spec.finalSpec.power.source}\n- Voltage: ${spec.finalSpec.power.voltage}\n- Current: ${spec.finalSpec.power.current}\n`
      if (spec.finalSpec.power.batteryLife) md += `- Battery Life: ${spec.finalSpec.power.batteryLife}\n`
      md += `\n### Communication\n- Type: ${spec.finalSpec.communication.type}\n- Protocol: ${spec.finalSpec.communication.protocol}\n\n`
      md += `### Enclosure\n- Style: ${spec.finalSpec.enclosure.style}\n- Dimensions: ${spec.finalSpec.enclosure.width} x ${spec.finalSpec.enclosure.height} x ${spec.finalSpec.enclosure.depth}mm\n\n`
      md += `### Estimated BOM\n| Item | Qty | Unit Cost | Total |\n|------|-----|-----------|-------|\n`
      md += spec.finalSpec.estimatedBOM.map((b) => `| ${b.item} | ${b.quantity} | $${b.unitCost.toFixed(2)} | $${(b.quantity * b.unitCost).toFixed(2)} |`).join('\n')
      md += `\n| **Total** | | | **$${spec.finalSpec.estimatedBOM.reduce((sum, b) => sum + b.quantity * b.unitCost, 0).toFixed(2)}** |\n\n`
    } else {
      md += 'Final specification not yet generated\n\n'
    }

    md += `## Design Decisions\n${spec.decisions.length > 0 ? spec.decisions.map((d) => `### ${d.question}\n${d.answer}\n`).join('\n') : 'No decisions recorded'}\n\n`
    md += '---\n*Generated by PHAESTUS Hardware Design Platform*\n'

    return md
  }

  // README templates moved to separate functions for cleaner code
  const getEnclosureReadme = () => `# Enclosure Files\n\n## Files\n- \`enclosure.scad\` - OpenSCAD source file\n\n## How to Use\n1. Open \`enclosure.scad\` in OpenSCAD\n2. Press F5 to preview\n3. Press F6 to render\n4. Export as STL: File > Export > Export as STL\n\n## Printing\n- Material: PLA or PETG\n- Layer Height: 0.2mm\n- Infill: 15-20%\n`

  const getDesignDocReadme = () => `# Design Document\n\nThis archive contains the design documentation.\n\n## Files\n- \`*-design.json\` - Machine-readable\n- \`*-design.md\` - Human-readable\n\n## Contents\nBlock placements, cable pinouts, justifications, 0R tap config, net assignments.\n`

  const getGerberReadme = (width: number, height: number) => `# Gerber Files\n\n## Board: ${width.toFixed(2)}mm x ${height.toFixed(2)}mm\n\n## Manufacturing\n1. Upload to JLCPCB/PCBWay\n2. Select 4-layer board\n3. Verify layer mapping\n\n## Verify at https://tracespace.io/view/\n`

  const getPanelReadme = (config: { panelSize: { width: number; height: number }; vScoreLines: unknown[]; routedEdges?: unknown[] }, boards: RemoteBoard[]) =>
    `# Panelized Gerbers\n\n## Panel: ${config.panelSize.width.toFixed(1)}x${config.panelSize.height.toFixed(1)}mm\nBoards: ${1 + boards.length}\nV-Score: ${config.vScoreLines.length}\nRouted: ${config.routedEdges?.length ?? 0}\n`

  const getFirmwareReadme = () => `# Firmware\n\n## Build with PlatformIO\n\`\`\`bash\npio run\npio run -t upload\npio device monitor\n\`\`\`\n`

  const getConversationsReadme = (stages: string[]) => `# Conversation Export\n\n## Files\n${stages.map((s) => `- \`${s}-chat.md\``).join('\n')}\n- \`all-conversations.md\`\n`

  const getCompleteReadme = () => `# ${project?.name || 'PHAESTUS Project'}\n\n${project?.description || ''}\n\n## Contents\n- Spec (MD/JSON)\n- BOM (CSV)\n- Enclosure (OpenSCAD)\n- Firmware (PlatformIO)\n\nGenerated by PHAESTUS\n`

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

  // =============================================================================
  // Render
  // =============================================================================

  if (!firmwareComplete) {
    return <NotReadyState />
  }

  const exportItems: ExportItem[] = [
    { id: 'spec', icon: FileText, title: 'Specification', description: 'Complete project specification with requirements and BOM', filename: 'spec.md', ready: !!project?.spec?.finalSpec, onDownload: downloadSpec },
    { id: 'bom', icon: Table, title: 'Bill of Materials', description: 'Component list as CSV for sourcing', filename: 'bom.csv', ready: (project?.spec?.finalSpec?.estimatedBOM?.length ?? 0) > 0, onDownload: downloadBOM },
    { id: 'manufacturing-bom', icon: Wrench, title: 'Manufacturing BOM', description: 'Component list from PCB blocks with nofit marking', filename: 'manufacturing-bom.csv', ready: hasPcbArtifacts, onDownload: downloadManufacturingBOM },
    { id: 'design-document', icon: FileJson, title: 'Design Document', description: 'Connections, justifications, 0R tap status (JSON/MD)', filename: 'design-document.zip', ready: hasPcbArtifacts, onDownload: downloadDesignDocument },
    { id: 'gerbers', icon: Cpu, title: 'Gerber Files', description: 'Merged PCB manufacturing files for fabrication', filename: 'gerbers.zip', ready: hasPcbArtifacts, onDownload: downloadGerbers },
    { id: 'panel-gerbers', icon: Cpu, title: 'Panelized Gerbers', description: 'V-score lines and panel layout for multi-board manufacturing', filename: 'panel-gerbers.zip', ready: hasPanelization, onDownload: downloadPanelGerbers },
    { id: 'enclosure', icon: Box, title: 'Enclosure Files', description: 'OpenSCAD source for 3D printable enclosure', filename: 'enclosure.zip', ready: !!project?.spec?.enclosure?.openScadCode, onDownload: downloadEnclosure },
    { id: 'firmware', icon: Code, title: 'Firmware Source', description: 'ESP32-C6 PlatformIO project', filename: 'firmware.zip', ready: (project?.spec?.firmware?.files?.length ?? 0) > 0, onDownload: downloadFirmware },
    { id: 'conversations', icon: MessageSquare, title: 'Chat History', description: 'AI conversation logs organized by stage', filename: 'conversations.zip', ready: true, onDownload: downloadConversations },
    { id: 'complete', icon: Package, title: 'Complete Package', description: 'All files in a single download', filename: 'complete.zip', ready: true, onDownload: downloadComplete },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto p-6">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-xl font-semibold text-steel mb-1">Export & Manufacture</h2>
        <p className="text-steel-dim text-sm">Download design files to manufacture your hardware</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {exportItems.map((item) => (
          <ExportItemCard
            key={item.id}
            item={item}
            isDownloading={downloading === item.id}
            isDownloaded={downloaded.has(item.id)}
            onDownload={() => handleDownload(item.id, item.onDownload)}
          />
        ))}
      </div>

      {/* Gallery Publishing */}
      <div className="mt-8 max-w-2xl">
        <GalleryPublishing
          projectId={project?.id || ''}
          visibility={visibility}
          isLoading={visibilityLoading}
          isPending={visibilityMutation.isPending}
          onTogglePublic={() => visibilityMutation.mutate({ isPublic: !visibility?.isPublic })}
          onToggleShowAuthor={() => visibilityMutation.mutate({ showAuthor: !visibility?.showAuthor })}
        />
      </div>

      {/* External Resources */}
      <div className="mt-8 max-w-2xl">
        <ManufacturingResources />
      </div>
    </div>
  )
}
