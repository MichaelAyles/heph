/**
 * Remote Board Manager Component
 *
 * Manages remote boards (off-grid boards like button panels, displays)
 * that connect to the main board via cables.
 *
 * Features:
 * - Add/remove remote boards from templates
 * - Connection mapping editor
 * - Mini grid preview for each board
 */

import { useState } from 'react'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Link2,
  Settings2,
  Box,
  Monitor,
  Plug,
  Puzzle,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { RemoteBoard, RemoteBoardType, ConnectionMapping } from '../../db/schema'
import {
  createRemoteBoard,
  REMOTE_BOARD_TEMPLATES,
  CONNECTOR_TYPES,
  validateRemoteBoardConnections,
  updateConnectionMapping,
  addConnectionMapping,
  removeConnectionMapping,
} from '../../services/remote-board'

// =============================================================================
// Types
// =============================================================================

interface RemoteBoardManagerProps {
  remoteBoards: RemoteBoard[]
  mainBoardSignals: string[]
  onBoardsChange: (boards: RemoteBoard[]) => void
  disabled?: boolean
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function RemoteBoardManager({
  remoteBoards,
  mainBoardSignals,
  onBoardsChange,
  disabled = false,
  className,
}: RemoteBoardManagerProps) {
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set())
  const [showAddMenu, setShowAddMenu] = useState(false)

  const toggleExpanded = (boardId: string) => {
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      if (next.has(boardId)) {
        next.delete(boardId)
      } else {
        next.add(boardId)
      }
      return next
    })
  }

  const handleAddBoard = (type: RemoteBoardType) => {
    const newBoard = createRemoteBoard(type)
    onBoardsChange([...remoteBoards, newBoard])
    setExpandedBoards((prev) => new Set(prev).add(newBoard.id))
    setShowAddMenu(false)
  }

  const handleRemoveBoard = (boardId: string) => {
    onBoardsChange(remoteBoards.filter((b) => b.id !== boardId))
    setExpandedBoards((prev) => {
      const next = new Set(prev)
      next.delete(boardId)
      return next
    })
  }

  const handleUpdateBoard = (boardId: string, updates: Partial<RemoteBoard>) => {
    onBoardsChange(
      remoteBoards.map((b) => (b.id === boardId ? { ...b, ...updates } : b))
    )
  }

  const handleUpdateMapping = (
    boardId: string,
    index: number,
    updates: Partial<ConnectionMapping>
  ) => {
    const board = remoteBoards.find((b) => b.id === boardId)
    if (!board) return
    const updated = updateConnectionMapping(board, index, updates)
    handleUpdateBoard(boardId, { connectionMapping: updated.connectionMapping })
  }

  const handleAddMapping = (boardId: string) => {
    const board = remoteBoards.find((b) => b.id === boardId)
    if (!board) return
    const updated = addConnectionMapping(board, {
      remoteSignal: 'GND',
      mainSignal: 'GND',
      connectorType: board.connectionMapping[0]?.connectorType || 'JST-PH-4',
    })
    handleUpdateBoard(boardId, { connectionMapping: updated.connectionMapping })
  }

  const handleRemoveMapping = (boardId: string, index: number) => {
    const board = remoteBoards.find((b) => b.id === boardId)
    if (!board) return
    const updated = removeConnectionMapping(board, index)
    handleUpdateBoard(boardId, { connectionMapping: updated.connectionMapping })
  }

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700 bg-surface-800/50">
        <span className="text-xs font-medium text-steel-dim uppercase tracking-wider">
          Remote Boards
        </span>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            disabled={disabled}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
              disabled
                ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                : 'bg-copper/20 text-copper hover:bg-copper/30'
            )}
          >
            <Plus className="w-3 h-3" />
            Add
          </button>

          {/* Add board menu */}
          {showAddMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-surface-800 border border-surface-600 rounded-lg shadow-lg z-10">
              {REMOTE_BOARD_TEMPLATES.map((template) => (
                <button
                  key={template.type}
                  onClick={() => handleAddBoard(template.type)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-steel hover:bg-surface-700 first:rounded-t-lg last:rounded-b-lg"
                >
                  <BoardTypeIcon type={template.type} className="w-4 h-4 text-steel-dim" />
                  <div className="text-left">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-steel-dim">{template.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remote board list */}
      <div className="flex-1 overflow-y-auto">
        {remoteBoards.length === 0 ? (
          <div className="px-3 py-6 text-center text-steel-dim text-sm">
            <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No remote boards</p>
            <p className="text-xs text-surface-500 mt-1">
              Add button panels, displays, or connectors
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {remoteBoards.map((board) => {
              const isExpanded = expandedBoards.has(board.id)
              const validation = validateRemoteBoardConnections(board, mainBoardSignals)

              return (
                <div
                  key={board.id}
                  className="bg-surface-800 border border-surface-700 rounded-lg"
                >
                  {/* Board header */}
                  <button
                    onClick={() => toggleExpanded(board.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-steel-dim" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-steel-dim" />
                    )}
                    <BoardTypeIcon type={board.type} className="w-4 h-4 text-copper" />
                    <span className="flex-1 text-left font-medium text-steel">
                      {board.name}
                    </span>
                    {!validation.valid && (
                      <span className="text-xs text-red-400">
                        {validation.errors.length} issue(s)
                      </span>
                    )}
                    <span className="text-xs text-steel-dim">
                      {board.connectionMapping.length} pins
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-surface-700 p-3 space-y-3">
                      {/* Board name editor */}
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-steel-dim" />
                        <input
                          type="text"
                          value={board.name}
                          onChange={(e) =>
                            handleUpdateBoard(board.id, {
                              name: e.target.value,
                              slug: e.target.value
                                .toLowerCase()
                                .replace(/\s+/g, '-')
                                .replace(/[^a-z0-9-]/g, ''),
                            })
                          }
                          disabled={disabled}
                          className="flex-1 px-2 py-1 text-sm bg-surface-900 border border-surface-600 rounded text-steel"
                        />
                        <button
                          onClick={() => handleRemoveBoard(board.id)}
                          disabled={disabled}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                          title="Remove board"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Connection mappings */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1 text-xs text-steel-dim">
                            <Link2 className="w-3 h-3" />
                            Connection Mappings
                          </div>
                          <button
                            onClick={() => handleAddMapping(board.id)}
                            disabled={disabled}
                            className="text-xs text-copper hover:text-copper-light"
                          >
                            + Add Pin
                          </button>
                        </div>

                        <div className="space-y-1">
                          {board.connectionMapping.map((mapping, index) => (
                            <ConnectionMappingRow
                              key={index}
                              mapping={mapping}
                              mainBoardSignals={mainBoardSignals}
                              disabled={disabled}
                              onUpdate={(updates) =>
                                handleUpdateMapping(board.id, index, updates)
                              }
                              onRemove={() => handleRemoveMapping(board.id, index)}
                            />
                          ))}

                          {board.connectionMapping.length === 0 && (
                            <div className="text-xs text-surface-500 text-center py-2">
                              No connections defined
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Validation errors */}
                      {!validation.valid && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                          <div className="text-xs text-red-400 font-medium mb-1">
                            Validation Issues:
                          </div>
                          <ul className="text-xs text-red-300 space-y-0.5">
                            {validation.errors.map((error, i) => (
                              <li key={i}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

interface ConnectionMappingRowProps {
  mapping: ConnectionMapping
  mainBoardSignals: string[]
  disabled: boolean
  onUpdate: (updates: Partial<ConnectionMapping>) => void
  onRemove: () => void
}

function ConnectionMappingRow({
  mapping,
  mainBoardSignals,
  disabled,
  onUpdate,
  onRemove,
}: ConnectionMappingRowProps) {
  return (
    <div className="flex items-center gap-2 bg-surface-900 rounded px-2 py-1">
      {/* Remote signal */}
      <input
        type="text"
        value={mapping.remoteSignal}
        onChange={(e) => onUpdate({ remoteSignal: e.target.value })}
        disabled={disabled}
        placeholder="Remote"
        className="w-24 px-1.5 py-0.5 text-xs bg-surface-800 border border-surface-600 rounded text-steel"
      />

      <span className="text-steel-dim">→</span>

      {/* Main board signal */}
      <select
        value={mapping.mainSignal}
        onChange={(e) => onUpdate({ mainSignal: e.target.value })}
        disabled={disabled}
        className="flex-1 px-1.5 py-0.5 text-xs bg-surface-800 border border-surface-600 rounded text-steel"
      >
        {mainBoardSignals.map((signal) => (
          <option key={signal} value={signal}>
            {signal}
          </option>
        ))}
      </select>

      {/* Connector type */}
      <select
        value={mapping.connectorType}
        onChange={(e) => onUpdate({ connectorType: e.target.value })}
        disabled={disabled}
        className="w-24 px-1.5 py-0.5 text-xs bg-surface-800 border border-surface-600 rounded text-steel"
      >
        {CONNECTOR_TYPES.map((connector) => (
          <option key={connector.id} value={connector.id}>
            {connector.id}
          </option>
        ))}
      </select>

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="p-0.5 text-red-400 hover:text-red-300"
        title="Remove mapping"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

interface BoardTypeIconProps {
  type: RemoteBoardType
  className?: string
}

function BoardTypeIcon({ type, className }: BoardTypeIconProps) {
  switch (type) {
    case 'button':
      return <Box className={className} />
    case 'display':
      return <Monitor className={className} />
    case 'connector':
      return <Plug className={className} />
    case 'custom':
    default:
      return <Puzzle className={className} />
  }
}

export default RemoteBoardManager
