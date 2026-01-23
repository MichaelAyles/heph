/**
 * ManufacturingExportPanel - Manufacturing export configuration UI
 *
 * Handles:
 * - 0R resistor tap configuration via LLM
 * - Panel layout preview
 * - Manufacturing file export (Gerbers, BOM, Centroid)
 */

import { useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { Loader2, Settings2, Package } from 'lucide-react'
import { PanelPreview } from './PanelPreview'
import { TapConfigTable, TapConfigSummary } from './TapConfigTable'
import {
  buildTapConfigMessages,
  parseTapConfigResponse,
  toResistorTapStates,
  hasConflicts,
  type TapConfigResponse,
} from '../../prompts/tap-configuration'
import { generateManufacturingPackage } from '../../services/manufacturing-export'
import { logger } from '../../lib/logger'
import type {
  PlacedBlock,
  RemoteBoard,
  ResistorTapState,
  PcbBlock,
  PCBArtifacts,
  PanelConfiguration,
  ProjectSpec,
} from '../../db/schema'
import type { BlockDefinition } from '../../schemas/block'

interface ManufacturingExportPanelProps {
  project: { id: string; name: string; description?: string | null }
  spec?: ProjectSpec | null
  selectedBlocks: PlacedBlock[]
  blockDefinitions: Map<string, BlockDefinition>
  blocks: PcbBlock[]
  pcbArtifacts?: PCBArtifacts | null
  remoteBoards: RemoteBoard[]
  panelConfig: PanelConfiguration | null
  boardSize: { widthMm: number; heightMm: number } | null
  initialTapStates: ResistorTapState[]
  onTapStatesChange: (states: ResistorTapState[]) => void
}

export function ManufacturingExportPanel({
  project,
  spec,
  selectedBlocks,
  blockDefinitions,
  blocks,
  pcbArtifacts,
  remoteBoards,
  panelConfig,
  boardSize,
  initialTapStates,
  onTapStatesChange,
}: ManufacturingExportPanelProps) {
  const [isTapConfiguring, setIsTapConfiguring] = useState(false)
  const [tapConfigError, setTapConfigError] = useState<string | null>(null)
  const [tapConfigResponse, setTapConfigResponse] = useState<TapConfigResponse | null>(null)
  const [configuredTapStates, setConfiguredTapStates] = useState<ResistorTapState[]>(initialTapStates)
  const [isExportingMfg, setIsExportingMfg] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Handle tap configuration via LLM
  const handleConfigureTaps = useCallback(async () => {
    if (selectedBlocks.length === 0) return

    setIsTapConfiguring(true)
    setTapConfigError(null)

    try {
      const messages = buildTapConfigMessages({
        projectName: project.name,
        projectDescription: project.description || undefined,
        finalSpec: spec?.finalSpec,
        placedBlocks: selectedBlocks,
        blockDefinitions,
      })

      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          temperature: 0.3,
          projectId: project.id,
        }),
      })

      if (!res.ok) throw new Error('Failed to configure taps')

      const data = await res.json()
      const response = parseTapConfigResponse(data.content)

      if (!response) {
        throw new Error('Failed to parse tap configuration response')
      }

      setTapConfigResponse(response)

      const tapStates = toResistorTapStates(response, blockDefinitions)
      setConfiguredTapStates(tapStates)
      onTapStatesChange(tapStates)

      logger.info('pcb', 'Tap configuration complete', {
        taps: tapStates.length,
        conflicts: response.conflicts.length,
      })
    } catch (error) {
      logger.error('pcb', 'Tap configuration failed', { error })
      setTapConfigError(error instanceof Error ? error.message : 'Tap configuration failed')
    } finally {
      setIsTapConfiguring(false)
    }
  }, [selectedBlocks, project, spec?.finalSpec, blockDefinitions, onTapStatesChange])

  // Handle tap toggle (manual override)
  const handleToggleTap = useCallback(
    (blockSlug: string, reference: string, newState: boolean) => {
      setConfiguredTapStates((prev) => {
        const updated = prev.map((tap) =>
          tap.blockSlug === blockSlug && tap.reference === reference
            ? { ...tap, populated: newState, reason: 'Manually overridden' }
            : tap
        )
        onTapStatesChange(updated)
        return updated
      })
    },
    [onTapStatesChange]
  )

  // Handle manufacturing export
  const handleExportManufacturing = useCallback(async () => {
    if (!blocks || !project) return

    setIsExportingMfg(true)
    setExportError(null)

    try {
      const projectSlug = project.name.toLowerCase().replace(/\s+/g, '-')

      const result = await generateManufacturingPackage({
        projectSlug,
        pcbArtifacts: pcbArtifacts || { placedBlocks: selectedBlocks },
        blocks,
        tapStates: configuredTapStates,
      })

      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)

      logger.info('pcb', 'Manufacturing export complete', { summary: result.summary })
    } catch (error) {
      logger.error('pcb', 'Manufacturing export failed', { error })
      setExportError(error instanceof Error ? error.message : 'Manufacturing export failed')
    } finally {
      setIsExportingMfg(false)
    }
  }, [blocks, project, pcbArtifacts, selectedBlocks, configuredTapStates])

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold text-steel mb-2">Manufacturing Export</h3>
          <p className="text-sm text-steel-dim">
            Configure 0R resistor taps and export manufacturing files (Gerbers, BOM, Centroid)
          </p>
        </div>

        {/* Step 1: Configure Taps */}
        <div className="bg-surface-800 rounded-lg border border-surface-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-copper/20 text-copper flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <div>
                <h4 className="text-sm font-medium text-steel">Configure 0R Taps</h4>
                <p className="text-xs text-steel-dim">
                  AI determines I2C addresses and signal routing
                </p>
              </div>
            </div>
            <button
              onClick={handleConfigureTaps}
              disabled={isTapConfiguring || selectedBlocks.length === 0}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                isTapConfiguring
                  ? 'bg-surface-700 text-steel-dim cursor-wait'
                  : configuredTapStates.length > 0
                    ? 'bg-surface-700 text-steel hover:bg-surface-600'
                    : 'bg-copper text-surface-900 hover:bg-copper-light'
              )}
            >
              {isTapConfiguring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Configuring...
                </>
              ) : configuredTapStates.length > 0 ? (
                <>
                  <Settings2 className="w-4 h-4" />
                  Reconfigure
                </>
              ) : (
                <>
                  <Settings2 className="w-4 h-4" />
                  Configure Taps
                </>
              )}
            </button>
          </div>

          {tapConfigError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              {tapConfigError}
            </div>
          )}

          {configuredTapStates.length > 0 ? (
            <TapConfigTable
              tapStates={configuredTapStates}
              conflicts={tapConfigResponse?.conflicts}
              onToggleTap={handleToggleTap}
              className="mt-2"
            />
          ) : (
            <div className="text-center py-6 text-steel-dim text-sm">
              No tap configuration yet. Click "Configure Taps" to analyze your design.
            </div>
          )}

          {tapConfigResponse?.notes && (
            <div className="mt-4 p-3 bg-surface-900 rounded text-xs text-steel-dim">
              <span className="font-medium text-steel">Notes:</span> {tapConfigResponse.notes}
            </div>
          )}
        </div>

        {/* Step 2: Preview Panel */}
        <div className="bg-surface-800 rounded-lg border border-surface-700 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-surface-700 text-steel-dim flex items-center justify-center text-sm font-semibold">
              2
            </div>
            <div>
              <h4 className="text-sm font-medium text-steel">Panel Layout</h4>
              <p className="text-xs text-steel-dim">
                {panelConfig
                  ? `${panelConfig.panelSize.width.toFixed(1)}×${panelConfig.panelSize.height.toFixed(1)}mm • ${remoteBoards.length + 1} boards`
                  : boardSize
                    ? `${boardSize.widthMm.toFixed(1)}×${boardSize.heightMm.toFixed(1)}mm • Single board`
                    : 'Generate schematic first'}
              </p>
            </div>
          </div>

          {panelConfig && boardSize ? (
            <div className="bg-surface-900 rounded p-4 flex justify-center">
              <PanelPreview
                mainBoardSize={{ width: boardSize.widthMm, height: boardSize.heightMm }}
                remoteBoards={remoteBoards}
                panelConfig={panelConfig}
              />
            </div>
          ) : boardSize ? (
            <div className="bg-surface-900 rounded p-4 text-center text-steel-dim text-sm">
              Single board layout: {boardSize.widthMm.toFixed(1)}×{boardSize.heightMm.toFixed(1)}mm
            </div>
          ) : (
            <div className="bg-surface-900 rounded p-4 text-center text-steel-dim text-sm">
              Generate schematic to see panel layout
            </div>
          )}
        </div>

        {/* Step 3: Export */}
        <div className="bg-surface-800 rounded-lg border border-surface-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-700 text-steel-dim flex items-center justify-center text-sm font-semibold">
                3
              </div>
              <div>
                <h4 className="text-sm font-medium text-steel">Export Manufacturing Files</h4>
                <p className="text-xs text-steel-dim">Gerbers, BOM, Centroid as ZIP</p>
              </div>
            </div>
            <button
              onClick={handleExportManufacturing}
              disabled={isExportingMfg || !pcbArtifacts?.schematicData}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                isExportingMfg
                  ? 'bg-surface-700 text-steel-dim cursor-wait'
                  : !pcbArtifacts?.schematicData
                    ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
              )}
            >
              {isExportingMfg ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  Export ZIP
                </>
              )}
            </button>
          </div>

          {exportError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              {exportError}
            </div>
          )}

          {/* Export contents preview */}
          <div className="bg-surface-900 rounded p-3 text-xs font-mono text-steel-dim">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>gerbers/</div>
              <div className="text-surface-500">10 layer files</div>
              {panelConfig && (
                <>
                  <div className="pl-2">├ VScore.gbr</div>
                  <div className="text-surface-500">V-score lines</div>
                  {panelConfig.routedEdges && panelConfig.routedEdges.length > 0 && (
                    <>
                      <div className="pl-2">├ RoutedEdges.gbr</div>
                      <div className="text-surface-500">Milled edges</div>
                    </>
                  )}
                </>
              )}
              <div>bom.csv</div>
              <div className="text-surface-500">
                Bill of Materials
                {configuredTapStates.length > 0 && (
                  <span className="text-amber-400">
                    {' '}({configuredTapStates.filter((t) => !t.populated).length} DNP)
                  </span>
                )}
              </div>
              <div>centroid.csv</div>
              <div className="text-surface-500">Pick & place</div>
              {configuredTapStates.length > 0 && (
                <>
                  <div>tap-config.json</div>
                  <div className="text-surface-500">0R config reference</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tap config summary at bottom */}
        {configuredTapStates.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs text-steel-dim">
            <TapConfigSummary
              tapStates={configuredTapStates}
              hasConflicts={tapConfigResponse ? hasConflicts(tapConfigResponse) : false}
            />
          </div>
        )}
      </div>
    </div>
  )
}
