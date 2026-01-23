/**
 * FileTreePanel - File tree sidebar showing project structure
 */

import { FileTreeItem } from './FileTreeItem'
import type { FileNode } from './types'

interface FileTreePanelProps {
  fileTree: FileNode[]
  selectedPath: string | null
  expandedFolders: Set<string>
  onSelectFile: (node: FileNode) => void
  onToggleFolder: (path: string) => void
}

export function FileTreePanel({
  fileTree,
  selectedPath,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
}: FileTreePanelProps) {
  return (
    <div className="w-56 flex-none border-r border-surface-700 bg-surface-900 flex flex-col">
      <div className="px-3 py-2 border-b border-surface-700">
        <h3 className="text-xs font-medium text-steel-dim uppercase tracking-wide">Files</h3>
      </div>
      <div className="flex-1 py-2 overflow-auto">
        {fileTree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            expandedFolders={expandedFolders}
            onSelect={onSelectFile}
            onToggleFolder={onToggleFolder}
          />
        ))}
      </div>
    </div>
  )
}
