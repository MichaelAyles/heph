/**
 * PCBViewerToolbar - View mode selection and action buttons
 */

import { clsx } from 'clsx'
import {
  LayoutGrid,
  Network,
  Layers,
  Box,
  FileText,
  LayoutPanelTop,
  Factory,
  Download,
  Wand2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { PanelConfiguration } from '../../db/schema'

export type ViewMode = 'grid' | 'bus' | 'gerbers' | '3d' | 'docs' | 'panel' | 'mfg'

interface PCBViewerToolbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onLoadGerbers: () => void
  selectedBlocksCount: number
  panelConfig: PanelConfiguration | null
  hasSchematicData: boolean
  boardSize: { widthMm: number; heightMm: number; width: number; height: number } | null
  validationResult: { valid: boolean; errors: string[] } | null
  documentOutput: { markdown: string } | null
  onDownloadDocs: () => void
  onGenerate: () => void
  isMerging: boolean
  hasExistingSchematic: boolean
}

export function PCBViewerToolbar({
  viewMode,
  onViewModeChange,
  onLoadGerbers,
  selectedBlocksCount,
  panelConfig,
  hasSchematicData,
  boardSize,
  validationResult,
  documentOutput,
  onDownloadDocs,
  onGenerate,
  isMerging,
  hasExistingSchematic,
}: PCBViewerToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 bg-surface-800 rounded p-0.5">
        <ViewModeButton
          mode="grid"
          currentMode={viewMode}
          onClick={() => onViewModeChange('grid')}
          icon={LayoutGrid}
          label="Grid"
        />
        <ViewModeButton
          mode="bus"
          currentMode={viewMode}
          onClick={() => onViewModeChange('bus')}
          icon={Network}
          label="Bus"
        />
        <ViewModeButton
          mode="gerbers"
          currentMode={viewMode}
          onClick={() => {
            onViewModeChange('gerbers')
            onLoadGerbers()
          }}
          icon={Layers}
          label="Gerbers"
          disabled={selectedBlocksCount === 0}
        />
        <ViewModeButton
          mode="3d"
          currentMode={viewMode}
          onClick={() => onViewModeChange('3d')}
          icon={Box}
          label="3D"
          disabled={selectedBlocksCount === 0}
        />
        <ViewModeButton
          mode="docs"
          currentMode={viewMode}
          onClick={() => onViewModeChange('docs')}
          icon={FileText}
          label="Docs"
          disabled={selectedBlocksCount === 0}
        />
        <ViewModeButton
          mode="panel"
          currentMode={viewMode}
          onClick={() => onViewModeChange('panel')}
          icon={LayoutPanelTop}
          label="Panel"
          disabled={!panelConfig}
        />
        <ViewModeButton
          mode="mfg"
          currentMode={viewMode}
          onClick={() => onViewModeChange('mfg')}
          icon={Factory}
          label="Mfg"
          disabled={selectedBlocksCount === 0 || !hasSchematicData}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Board size info */}
        {boardSize && boardSize.width > 0 && (
          <span className="text-xs text-steel-dim px-2 py-1 bg-surface-800 rounded font-mono">
            {boardSize.widthMm.toFixed(1)}×{boardSize.heightMm.toFixed(1)}mm (
            {boardSize.width}×{boardSize.height} units)
          </span>
        )}

        {/* Validation status */}
        {validationResult && (
          <div
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              validationResult.valid
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            )}
          >
            {validationResult.valid ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                Valid
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" />
                {validationResult.errors.length} error(s)
              </>
            )}
          </div>
        )}

        {/* Download button for docs view */}
        {documentOutput && viewMode === 'docs' && (
          <button
            onClick={onDownloadDocs}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-surface-700 hover:bg-surface-600 text-steel rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            Download MD
          </button>
        )}

        {/* Generate button */}
        {selectedBlocksCount > 0 && (
          <button
            onClick={onGenerate}
            disabled={isMerging || !validationResult?.valid}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
              isMerging
                ? 'bg-surface-700 text-steel-dim cursor-wait'
                : validationResult?.valid
                  ? 'bg-copper text-surface-900 hover:bg-copper-light'
                  : 'bg-surface-700 text-steel-dim cursor-not-allowed'
            )}
          >
            {isMerging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : hasExistingSchematic ? (
              <>
                <Wand2 className="w-4 h-4" />
                Regenerate
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

interface ViewModeButtonProps {
  mode: ViewMode
  currentMode: ViewMode
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
}

function ViewModeButton({
  mode,
  currentMode,
  onClick,
  icon: Icon,
  label,
  disabled,
}: ViewModeButtonProps) {
  const isActive = mode === currentMode

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors',
        isActive ? 'bg-copper text-surface-900' : 'text-steel-dim hover:text-steel',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      title={label}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}
