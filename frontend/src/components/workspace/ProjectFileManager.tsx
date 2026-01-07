/**
 * Project File Manager Component
 *
 * Virtual file tree showing all project artifacts with preview capabilities.
 * Organized like a git repository structure.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  FolderOpen,
  FileText,
  FileCode,
  Image,
  Box,
  ChevronRight,
  ChevronDown,
  Download,
  Eye,
  Copy,
  Check,
} from 'lucide-react'
import { clsx } from 'clsx'
import { KiCanvasViewer } from '@/components/pcb/KiCanvasViewer'
import { STLViewer } from '@/components/enclosure/STLViewer'
import type { ProjectSpec } from '@/db/schema'

/**
 * File node in the virtual file tree
 */
interface ProjectFileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  previewType?: 'kicanvas' | 'stl' | 'image' | 'code' | 'markdown' | 'json'
  content?: string
  r2Url?: string
  language?: string
  children?: ProjectFileNode[]
}

interface ProjectFileManagerProps {
  spec: ProjectSpec
  projectName: string
  className?: string
}

/**
 * Generate markdown from final spec
 */
function generateSpecMarkdown(spec: ProjectSpec): string {
  const { finalSpec, feasibility, decisions } = spec
  if (!finalSpec) return '# Specification\n\nNo final specification available.'

  let md = `# ${finalSpec.name}\n\n`
  md += `## Summary\n${finalSpec.summary}\n\n`

  md += `## PCB Size\n- Width: ${finalSpec.pcbSize.width}mm\n- Height: ${finalSpec.pcbSize.height}mm\n\n`

  if (finalSpec.inputs.length > 0) {
    md += `## Inputs\n`
    for (const input of finalSpec.inputs) {
      md += `- **${input.type}** (x${input.count}): ${input.notes}\n`
    }
    md += '\n'
  }

  if (finalSpec.outputs.length > 0) {
    md += `## Outputs\n`
    for (const output of finalSpec.outputs) {
      md += `- **${output.type}** (x${output.count}): ${output.notes}\n`
    }
    md += '\n'
  }

  md += `## Power\n`
  md += `- Source: ${finalSpec.power.source}\n`
  md += `- Voltage: ${finalSpec.power.voltage}\n`
  md += `- Current: ${finalSpec.power.current}\n`
  if (finalSpec.power.batteryLife) {
    md += `- Battery Life: ${finalSpec.power.batteryLife}\n`
  }
  md += '\n'

  md += `## Communication\n`
  md += `- Type: ${finalSpec.communication.type}\n`
  md += `- Protocol: ${finalSpec.communication.protocol}\n\n`

  md += `## Enclosure\n`
  md += `- Style: ${finalSpec.enclosure.style}\n`
  md += `- Dimensions: ${finalSpec.enclosure.width}mm x ${finalSpec.enclosure.height}mm x ${finalSpec.enclosure.depth}mm\n\n`

  if (finalSpec.estimatedBOM.length > 0) {
    md += `## Bill of Materials\n`
    md += `| Item | Qty | Unit Cost |\n`
    md += `|------|-----|----------|\n`
    for (const item of finalSpec.estimatedBOM) {
      md += `| ${item.item} | ${item.quantity} | $${item.unitCost.toFixed(2)} |\n`
    }
    md += '\n'
  }

  if (decisions.length > 0) {
    md += `## Design Decisions\n`
    for (const d of decisions) {
      md += `- **${d.question}**: ${d.answer}\n`
    }
    md += '\n'
  }

  if (feasibility) {
    md += `## Feasibility Analysis\n`
    md += `- Overall Score: ${feasibility.overallScore}/100\n`
    md += `- Manufacturable: ${feasibility.manufacturable ? 'Yes' : 'No'}\n`
    if (feasibility.rejectionReason) {
      md += `- Rejection Reason: ${feasibility.rejectionReason}\n`
    }
  }

  return md
}

/**
 * Build project file tree from spec
 */
function buildProjectTree(spec: ProjectSpec, projectName: string): ProjectFileNode[] {
  const tree: ProjectFileNode[] = []

  // Spec folder
  const specFolder: ProjectFileNode = {
    name: 'spec',
    path: 'spec',
    type: 'folder',
    children: [],
  }

  // Spec markdown
  specFolder.children!.push({
    name: 'spec.md',
    path: 'spec/spec.md',
    type: 'file',
    previewType: 'markdown',
    content: generateSpecMarkdown(spec),
  })

  // Feasibility JSON
  if (spec.feasibility) {
    specFolder.children!.push({
      name: 'feasibility.json',
      path: 'spec/feasibility.json',
      type: 'file',
      previewType: 'json',
      language: 'json',
      content: JSON.stringify(spec.feasibility, null, 2),
    })
  }

  // Blueprint
  if (spec.selectedBlueprint !== null && spec.blueprints[spec.selectedBlueprint]) {
    specFolder.children!.push({
      name: 'blueprint.png',
      path: 'spec/blueprint.png',
      type: 'file',
      previewType: 'image',
      r2Url: spec.blueprints[spec.selectedBlueprint].url,
    })
  }

  // Decisions
  if (spec.decisions.length > 0) {
    specFolder.children!.push({
      name: 'decisions.json',
      path: 'spec/decisions.json',
      type: 'file',
      previewType: 'json',
      language: 'json',
      content: JSON.stringify(spec.decisions, null, 2),
    })
  }

  tree.push(specFolder)

  // PCB folder
  if (spec.pcb) {
    const pcbFolder: ProjectFileNode = {
      name: 'pcb',
      path: 'pcb',
      type: 'folder',
      children: [],
    }

    if (spec.pcb.schematicData) {
      pcbFolder.children!.push({
        name: `${projectName.toLowerCase().replace(/\s+/g, '-')}.kicad_sch`,
        path: 'pcb/schematic.kicad_sch',
        type: 'file',
        previewType: 'kicanvas',
        content: spec.pcb.schematicData,
      })
    }

    if (spec.pcb.placedBlocks && spec.pcb.placedBlocks.length > 0) {
      pcbFolder.children!.push({
        name: 'blocks.json',
        path: 'pcb/blocks.json',
        type: 'file',
        previewType: 'json',
        language: 'json',
        content: JSON.stringify(spec.pcb.placedBlocks, null, 2),
      })
    }

    if (spec.pcb.netList && spec.pcb.netList.length > 0) {
      pcbFolder.children!.push({
        name: 'netlist.json',
        path: 'pcb/netlist.json',
        type: 'file',
        previewType: 'json',
        language: 'json',
        content: JSON.stringify(spec.pcb.netList, null, 2),
      })
    }

    if (spec.pcb.boardSize) {
      pcbFolder.children!.push({
        name: 'board-info.json',
        path: 'pcb/board-info.json',
        type: 'file',
        previewType: 'json',
        language: 'json',
        content: JSON.stringify(
          {
            ...spec.pcb.boardSize,
            mergedAt: spec.pcb.mergedAt,
          },
          null,
          2
        ),
      })
    }

    if (pcbFolder.children!.length > 0) {
      tree.push(pcbFolder)
    }
  }

  // Enclosure folder
  if (spec.enclosure) {
    const enclosureFolder: ProjectFileNode = {
      name: 'enclosure',
      path: 'enclosure',
      type: 'folder',
      children: [],
    }

    if (spec.enclosure.openScadCode) {
      enclosureFolder.children!.push({
        name: `${projectName.toLowerCase().replace(/\s+/g, '-')}.scad`,
        path: 'enclosure/enclosure.scad',
        type: 'file',
        previewType: 'code',
        language: 'plaintext',
        content: spec.enclosure.openScadCode,
      })
    }

    if (spec.enclosure.stlUrl) {
      enclosureFolder.children!.push({
        name: `${projectName.toLowerCase().replace(/\s+/g, '-')}.stl`,
        path: 'enclosure/enclosure.stl',
        type: 'file',
        previewType: 'stl',
        r2Url: spec.enclosure.stlUrl,
      })
    }

    if (spec.enclosure.iterations && spec.enclosure.iterations.length > 0) {
      enclosureFolder.children!.push({
        name: 'iterations.json',
        path: 'enclosure/iterations.json',
        type: 'file',
        previewType: 'json',
        language: 'json',
        content: JSON.stringify(spec.enclosure.iterations, null, 2),
      })
    }

    if (enclosureFolder.children!.length > 0) {
      tree.push(enclosureFolder)
    }
  }

  // Firmware folder
  if (spec.firmware && spec.firmware.files && spec.firmware.files.length > 0) {
    const firmwareFolder: ProjectFileNode = {
      name: 'firmware',
      path: 'firmware',
      type: 'folder',
      children: [],
    }

    for (const file of spec.firmware.files) {
      // Organize into subfolders based on path
      const pathParts = file.path.split('/')
      let currentFolder = firmwareFolder

      // Create nested folders
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i]
        let existingFolder = currentFolder.children?.find(
          (c) => c.name === folderName && c.type === 'folder'
        )

        if (!existingFolder) {
          existingFolder = {
            name: folderName,
            path: pathParts.slice(0, i + 1).join('/'),
            type: 'folder',
            children: [],
          }
          currentFolder.children!.push(existingFolder)
        }

        currentFolder = existingFolder
      }

      // Add file
      const fileName = pathParts[pathParts.length - 1]
      currentFolder.children!.push({
        name: fileName,
        path: `firmware/${file.path}`,
        type: 'file',
        previewType: 'code',
        language: file.language === 'cpp' || file.language === 'c' ? 'cpp' : file.language,
        content: file.content,
      })
    }

    tree.push(firmwareFolder)
  }

  return tree
}

/**
 * Get icon for file type
 */
function getFileIcon(node: ProjectFileNode) {
  if (node.type === 'folder') return FolderOpen

  switch (node.previewType) {
    case 'image':
      return Image
    case 'stl':
    case 'kicanvas':
      return Box
    case 'markdown':
      return FileText
    default:
      return FileCode
  }
}

interface FileTreeItemProps {
  node: ProjectFileNode
  depth: number
  selectedPath: string | null
  expandedFolders: Set<string>
  onSelect: (node: ProjectFileNode) => void
  onToggleFolder: (path: string) => void
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  onSelect,
  onToggleFolder,
}: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path
  const Icon = getFileIcon(node)

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className={clsx(
            'w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-left hover:bg-surface-800 rounded transition-colors',
            'text-steel-dim hover:text-steel'
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )}
          <Icon className="w-4 h-4 text-copper shrink-0" strokeWidth={1.5} />
          <span className="truncate">{node.name}</span>
          {node.children && (
            <span className="text-xs text-surface-500 ml-auto">
              {node.children.length}
            </span>
          )}
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                onSelect={onSelect}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className={clsx(
        'w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-left rounded transition-colors',
        isSelected
          ? 'bg-copper/20 text-copper'
          : 'text-steel-dim hover:text-steel hover:bg-surface-800'
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span className="w-3.5" /> {/* Spacer for alignment */}
      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

/**
 * File preview component
 */
function FilePreview({ node }: { node: ProjectFileNode }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (node.content) {
      navigator.clipboard.writeText(node.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [node.content])

  const handleDownload = useCallback(() => {
    const content = node.content || ''
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = node.name
    a.click()
    URL.revokeObjectURL(url)
  }, [node.content, node.name])

  // Image preview
  if (node.previewType === 'image' && node.r2Url) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-900 p-4">
        <img
          src={node.r2Url}
          alt={node.name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        />
      </div>
    )
  }

  // STL preview
  if (node.previewType === 'stl' && node.r2Url) {
    return (
      <div className="flex-1 bg-surface-900">
        <STLViewer src={node.r2Url} className="w-full h-full" />
      </div>
    )
  }

  // KiCanvas preview
  if (node.previewType === 'kicanvas' && node.content) {
    return (
      <div className="flex-1 bg-surface-900">
        <KiCanvasViewer
          src={`data:text/plain;base64,${btoa(node.content)}`}
          type="schematic"
          controls="basic"
          className="w-full h-full"
        />
      </div>
    )
  }

  // Code/Text preview
  if (node.content) {
    return (
      <div className="flex-1 flex flex-col bg-surface-900">
        <div className="px-4 py-2 border-b border-surface-700 flex items-center justify-between">
          <span className="text-sm text-steel">{node.name}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs text-steel-dim hover:text-steel flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="text-xs text-steel-dim hover:text-steel flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-sm text-steel font-mono">
          <code>{node.content}</code>
        </pre>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-surface-900">
      <div className="text-center text-steel-dim">
        <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No preview available</p>
      </div>
    </div>
  )
}

/**
 * Project File Manager Component
 */
export function ProjectFileManager({ spec, projectName, className }: ProjectFileManagerProps) {
  const [selectedFile, setSelectedFile] = useState<ProjectFileNode | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['spec', 'pcb', 'enclosure', 'firmware'])
  )

  const fileTree = useMemo(() => buildProjectTree(spec, projectName), [spec, projectName])

  const handleSelectFile = useCallback((node: ProjectFileNode) => {
    setSelectedFile(node)
  }, [])

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Count total files
  const countFiles = (nodes: ProjectFileNode[]): number => {
    return nodes.reduce((acc, node) => {
      if (node.type === 'folder' && node.children) {
        return acc + countFiles(node.children)
      }
      return acc + 1
    }, 0)
  }

  const totalFiles = useMemo(() => countFiles(fileTree), [fileTree])

  return (
    <div className={clsx('flex-1 flex min-h-0', className)}>
      {/* File tree sidebar */}
      <aside className="w-72 border-r border-surface-700 flex flex-col min-h-0 bg-surface-900">
        <div className="px-4 py-3 border-b border-surface-700">
          <h3 className="text-sm font-medium text-steel">Project Files</h3>
          <p className="text-xs text-steel-dim mt-1">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} in project
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {fileTree.map((node) => (
            <FileTreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedFile?.path ?? null}
              expandedFolders={expandedFolders}
              onSelect={handleSelectFile}
              onToggleFolder={handleToggleFolder}
            />
          ))}
        </div>
      </aside>

      {/* Preview panel */}
      <main className="flex-1 flex flex-col min-h-0">
        {selectedFile ? (
          <FilePreview node={selectedFile} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-surface-900">
            <div className="text-center text-steel-dim">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-50" strokeWidth={1} />
              <p className="text-sm mb-2">Select a file to preview</p>
              <p className="text-xs">
                Browse the project structure in the sidebar
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default ProjectFileManager
