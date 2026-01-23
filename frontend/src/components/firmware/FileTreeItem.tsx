/**
 * FileTreeItem - Recursive file tree node component
 */

import { clsx } from 'clsx'
import { FolderCode, FileCode, ChevronRight, ChevronDown } from 'lucide-react'
import type { FileNode } from './types'

interface FileTreeItemProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedFolders: Set<string>
  onSelect: (node: FileNode) => void
  onToggleFolder: (path: string) => void
}

export function FileTreeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  onSelect,
  onToggleFolder,
}: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className={clsx(
            'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-left hover:bg-surface-800 rounded transition-colors',
            'text-steel-dim hover:text-steel'
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderCode className="w-4 h-4 text-copper" strokeWidth={1.5} />
          <span>{node.name}</span>
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
        'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-left rounded transition-colors',
        isSelected
          ? 'bg-copper/20 text-copper'
          : 'text-steel-dim hover:text-steel hover:bg-surface-800'
      )}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <FileCode className="w-4 h-4" strokeWidth={1.5} />
      <span>{node.name}</span>
    </button>
  )
}
