/**
 * BlockViewer - Display and optionally edit PCB block definitions
 *
 * Used in:
 * - Admin panel (editable=true) for managing blocks
 * - Block library (editable=false) for browsing available blocks
 */

import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  Cpu,
  Battery,
  Radio,
  Lightbulb,
  Cable,
  Wrench,
  Wifi,
  Bluetooth,
  Zap,
  Grid3X3,
  ArrowUpDown,
  Package,
  FileCode,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Edit3,
  Save,
  X,
  Trash2,
  Upload,
  Loader2,
  Unplug,
} from 'lucide-react'
import type { BlockDefinition, BusSignal, BlockComponentDef } from '@/schemas/block'
import type { PcbBlock, BlockFiles } from '@/db/schema'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KiCanvasViewer } from '@/components/pcb/KiCanvasViewer'
import { StepViewer } from '@/components/pcb/StepViewer'
import { GerberViewer } from '@/components/pcb/GerberViewer'
import { clearGeometryCache } from '@/components/pcb/PCB3DViewer'
import type { LucideIcon } from 'lucide-react'
import { logger } from '@/lib/logger'
import JSZip from 'jszip'

// =============================================================================
// Types
// =============================================================================

interface BlockViewerProps {
  block: PcbBlock
  editable?: boolean
  onSave?: (definition: BlockDefinition) => Promise<void>
  className?: string
}

type TabId = 'bus' | 'edges' | 'components' | 'files'

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  mcu: { icon: Cpu, label: 'MCU', color: 'text-blue-400' },
  power: { icon: Battery, label: 'Power', color: 'text-yellow-400' },
  sensor: { icon: Radio, label: 'Sensor', color: 'text-green-400' },
  output: { icon: Lightbulb, label: 'Output', color: 'text-purple-400' },
  connector: { icon: Cable, label: 'Connector', color: 'text-orange-400' },
  utility: { icon: Wrench, label: 'Utility', color: 'text-steel' },
  remote: { icon: Unplug, label: 'Remote', color: 'text-amber-400' },
}

const WIRELESS_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  wifi4: { icon: Wifi, label: 'WiFi 4', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  wifi5: { icon: Wifi, label: 'WiFi 5', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  wifi6: { icon: Wifi, label: 'WiFi 6', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  ble4: {
    icon: Bluetooth,
    label: 'BLE 4',
    color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
  ble5: {
    icon: Bluetooth,
    label: 'BLE 5',
    color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
  zigbee: {
    icon: Radio,
    label: 'Zigbee',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  thread: {
    icon: Radio,
    label: 'Thread',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  lora: {
    icon: Radio,
    label: 'LoRa',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  nfc: {
    icon: Radio,
    label: 'NFC',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  uwb: { icon: Radio, label: 'UWB', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
}

const DIRECTION_LABELS: Record<string, { label: string; color: string }> = {
  input: { label: 'IN', color: 'text-green-400' },
  output: { label: 'OUT', color: 'text-blue-400' },
  bidirectional: { label: 'I/O', color: 'text-purple-400' },
  power: { label: 'PWR', color: 'text-yellow-400' },
  'open-drain': { label: 'OD', color: 'text-orange-400' },
}

// =============================================================================
// Main Component
// =============================================================================

export function BlockViewer({ block, editable = false, onSave, className }: BlockViewerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('bus')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const definition = block.definition
  if (!definition) {
    return (
      <div className={clsx('bg-surface-800 rounded-lg p-8 text-center', className)}>
        <p className="text-steel-dim">No block definition available</p>
        <p className="text-sm text-steel-dim mt-2">This block uses legacy format</p>
      </div>
    )
  }

  const category = CATEGORY_CONFIG[definition.category] || CATEGORY_CONFIG.utility
  const CategoryIcon = category.icon

  const handleSave = async () => {
    if (!onSave) return
    setIsSaving(true)
    try {
      await onSave(definition)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={clsx('bg-surface-800 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="p-6 border-b border-surface-700">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Category + Version */}
            <div className="flex items-center gap-3 mb-2">
              <div className={clsx('flex items-center gap-1.5 text-sm', category.color)}>
                <CategoryIcon className="w-4 h-4" strokeWidth={1.5} />
                <span>{category.label}</span>
              </div>
              <span className="text-steel-dim text-sm">v{definition.version}</span>
              {definition.gridSize && (
                <div className="flex items-center gap-1 text-steel-dim text-sm">
                  <Grid3X3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>
                    {definition.gridSize[0]}×{definition.gridSize[1]}
                  </span>
                </div>
              )}
              {definition.isRemote && (
                <div className="flex items-center gap-1 text-amber-400 text-sm">
                  <span>Remote</span>
                </div>
              )}
            </div>

            {/* Name */}
            <h2 className="text-xl font-medium text-white mb-2">{definition.name}</h2>

            {/* Description */}
            <p className="text-steel text-sm leading-relaxed">{definition.description}</p>

            {/* Wireless badges */}
            {definition.wireless && definition.wireless.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {definition.wireless.map((cap) => {
                  const config = WIRELESS_CONFIG[cap]
                  if (!config) return null
                  const Icon = config.icon
                  return (
                    <span
                      key={cap}
                      className={clsx(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                        config.color
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {config.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Edit button */}
          {editable && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="p-2 text-steel hover:text-white transition-colors"
                    title="Cancel"
                  >
                    <X className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-3 py-1.5 bg-copper text-surface-900 rounded font-medium text-sm hover:bg-copper-light transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" strokeWidth={1.5} />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-700 text-steel hover:text-white rounded text-sm transition-colors"
                >
                  <Edit3 className="w-4 h-4" strokeWidth={1.5} />
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-700">
        <div className="flex">
          {[
            { id: 'bus' as const, label: 'Bus Interface', icon: ArrowUpDown },
            { id: 'edges' as const, label: 'Edges', icon: Grid3X3 },
            { id: 'components' as const, label: 'Components', icon: Package },
            { id: 'files' as const, label: 'Files', icon: FileCode },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-copper text-white'
                  : 'border-transparent text-steel hover:text-white'
              )}
            >
              <tab.icon className="w-4 h-4" strokeWidth={1.5} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'bus' && <BusInterfaceTab definition={definition} />}
        {activeTab === 'edges' && <EdgesTab definition={definition} />}
        {activeTab === 'components' && <ComponentsTab block={block} editable={editable} />}
        {activeTab === 'files' && <FilesTab block={block} editable={editable} />}
      </div>
    </div>
  )
}

// =============================================================================
// Bus Interface Tab
// =============================================================================

function BusInterfaceTab({ definition }: { definition: BlockDefinition }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['taps', 'permanent', 'power'])
  )

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const taps = definition.bus.taps || []
  const permanent = definition.bus.permanent || []
  const power = definition.bus.power
  const i2c = definition.bus.i2c
  const spi = definition.bus.spi

  return (
    <div className="space-y-4">
      {/* Taps */}
      <CollapsibleSection
        title={`Bus Taps (${taps.length})`}
        subtitle="0Ω resistors for signal isolation"
        expanded={expandedSections.has('taps')}
        onToggle={() => toggleSection('taps')}
      >
        {taps.length === 0 ? (
          <p className="text-steel-dim text-sm py-2">No bus taps defined</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-steel-dim border-b border-surface-700">
                  <th className="pb-2 pr-4 font-medium">Signal</th>
                  <th className="pb-2 pr-4 font-medium">Resistor</th>
                  <th className="pb-2 pr-4 font-medium">Isolates</th>
                  <th className="pb-2 pr-4 font-medium">Voltage</th>
                  <th className="pb-2 font-medium">Dir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/50">
                {taps.map((tap, i) => (
                  <tr key={i} className="text-steel hover:bg-surface-700/30">
                    <td className="py-2 pr-4">
                      <span className="font-mono text-copper">{tap.signal}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-white">{tap.reference}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-steel-dim">{tap.isolates.from}</span>
                      <span className="text-steel-dim mx-1">→</span>
                      <span className="text-steel-dim">{tap.isolates.to}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {tap.voltage ? `${tap.voltage.min}-${tap.voltage.max}V` : '—'}
                    </td>
                    <td className="py-2">
                      {tap.voltage?.direction && (
                        <span
                          className={clsx(
                            'text-xs font-medium',
                            DIRECTION_LABELS[tap.voltage.direction]?.color
                          )}
                        >
                          {DIRECTION_LABELS[tap.voltage.direction]?.label}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Permanent Connections */}
      <CollapsibleSection
        title={`Permanent Connections (${permanent.length})`}
        subtitle="Hardwired signals without isolation"
        expanded={expandedSections.has('permanent')}
        onToggle={() => toggleSection('permanent')}
      >
        {permanent.length === 0 ? (
          <p className="text-steel-dim text-sm py-2">No permanent connections</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-steel-dim border-b border-surface-700">
                  <th className="pb-2 pr-4 font-medium">Signal</th>
                  <th className="pb-2 pr-4 font-medium">Pin</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 pr-4 font-medium">Voltage</th>
                  <th className="pb-2 font-medium">Dir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/50">
                {permanent.map((conn, i) => (
                  <tr key={i} className="text-steel hover:bg-surface-700/30">
                    <td className="py-2 pr-4">
                      <span className="font-mono text-copper">{conn.signal}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-mono text-white">{conn.pin}</span>
                    </td>
                    <td className="py-2 pr-4 text-steel-dim">{conn.reason || '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {conn.voltage ? `${conn.voltage.min}-${conn.voltage.max}V` : '—'}
                    </td>
                    <td className="py-2">
                      {conn.voltage?.direction && (
                        <span
                          className={clsx(
                            'text-xs font-medium',
                            DIRECTION_LABELS[conn.voltage.direction]?.color
                          )}
                        >
                          {DIRECTION_LABELS[conn.voltage.direction]?.label}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Power */}
      <CollapsibleSection
        title="Power"
        subtitle="Power rails provided and required"
        expanded={expandedSections.has('power')}
        onToggle={() => toggleSection('power')}
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Provides */}
          <div>
            <h4 className="text-sm font-medium text-steel mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-400" strokeWidth={1.5} />
              Provides
            </h4>
            {power?.provides && power.provides.length > 0 ? (
              <div className="space-y-1">
                {power.provides.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-yellow-400">{p.rail}</span>
                    <span className="text-steel-dim">up to</span>
                    <span className="text-white">{p.maxMa}mA</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-steel-dim text-sm">None</p>
            )}
          </div>

          {/* Requires */}
          <div>
            <h4 className="text-sm font-medium text-steel mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-400" strokeWidth={1.5} />
              Requires
            </h4>
            {power?.requires && power.requires.length > 0 ? (
              <div className="space-y-1">
                {power.requires.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-yellow-400">{r.rail}</span>
                    <span className="text-steel-dim">typ</span>
                    <span className="text-white">{r.typicalMa}mA</span>
                    <span className="text-steel-dim">max</span>
                    <span className="text-white">{r.maxMa}mA</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-steel-dim text-sm">None</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* I2C & SPI in a row */}
      {(i2c || spi) && (
        <div className="grid grid-cols-2 gap-4">
          {i2c && (
            <div className="bg-surface-700/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-2">I2C</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-steel-dim">Addresses:</span>
                  <span className="font-mono text-copper">
                    {i2c.addresses.map((a) => `0x${a.toString(16).toUpperCase()}`).join(', ')}
                  </span>
                </div>
                {i2c.addressConfigurable && (
                  <div className="text-green-400 text-xs">Configurable via jumper</div>
                )}
                {i2c.providesPullups && (
                  <div className="text-blue-400 text-xs">Provides pullup resistors</div>
                )}
              </div>
            </div>
          )}
          {spi && (
            <div className="bg-surface-700/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-2">SPI</h4>
              <div className="text-sm">
                <span className="text-steel-dim">CS Pin:</span>{' '}
                <span className="font-mono text-copper">{spi.csPin}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Edges Tab
// =============================================================================

function EdgesTab({ definition }: { definition: BlockDefinition }) {
  // Remote blocks don't have edges
  if (definition.isRemote || !definition.edges || !definition.gridSize) {
    return (
      <div className="p-6 text-center">
        <div className="text-steel-dim">
          {definition.isRemote
            ? 'Remote blocks connect via cable, not bus edges.'
            : 'No edge connection data available.'}
        </div>
        {definition.remote && (
          <div className="mt-4 bg-surface-800 rounded-lg p-4 text-left">
            <h4 className="text-sm font-medium text-white mb-2">Cable Connection</h4>
            <div className="text-sm text-steel space-y-1">
              <div>Connector: {definition.remote.cable.connectorType}</div>
              <div>Pin count: {definition.remote.cable.pinCount}</div>
              {definition.remote.cable.pitch && <div>Pitch: {definition.remote.cable.pitch}</div>}
              <div>Mates with: {definition.remote.matingConnectorSlug}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderEdge = (direction: 'north' | 'south', connections: NonNullable<typeof definition.edges>['north']) => (
    <div className="bg-surface-700/30 rounded-lg p-4">
      <h4 className="text-sm font-medium text-white mb-3 capitalize">{direction} Edge</h4>
      <div className="flex gap-2">
        {connections.map((conn, i) => (
          <div key={i} className="flex-1 bg-surface-800 rounded-lg p-3 border border-surface-600">
            <div className="text-xs text-steel-dim mb-1">Column {i + 1}</div>
            {conn.connector && (
              <div className="font-mono text-copper text-sm">{conn.connector}</div>
            )}
            <div className="text-xs text-steel mt-1">
              {conn.signals === 'ALL' ? (
                <span className="text-green-400">All signals</span>
              ) : (
                <span>{(conn.signals as BusSignal[]).join(', ')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Visual representation */}
      <div className="bg-surface-900 rounded-lg p-6">
        <div className="max-w-md mx-auto space-y-4">
          {/* North edge */}
          {renderEdge('north', definition.edges.north)}

          {/* Block representation */}
          <div className="flex justify-center">
            <div
              className="bg-surface-700 border-2 border-copper/50 rounded-lg flex items-center justify-center"
              style={{
                width: definition.gridSize[0] * 60,
                height: definition.gridSize[1] * 60,
              }}
            >
              <div className="text-center">
                <div className="text-copper font-medium">{definition.slug}</div>
                <div className="text-xs text-steel-dim">
                  {definition.gridSize[0]}×{definition.gridSize[1]}
                </div>
              </div>
            </div>
          </div>

          {/* South edge */}
          {renderEdge('south', definition.edges.south)}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Components Tab (Editable BOM)
// =============================================================================

function ComponentsTab({
  block,
  editable = false,
}: {
  block: PcbBlock
  editable?: boolean
}) {
  const definition = block.definition
  const queryClient = useQueryClient()
  const [components, setComponents] = useState<BlockComponentDef[]>(definition?.components || [])
  const [hasChanges, setHasChanges] = useState(false)

  // Reset when definition changes
  useEffect(() => {
    setComponents(definition?.components || [])
    setHasChanges(false)
  }, [definition])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (updatedComponents: BlockComponentDef[]) => {
      if (!definition) throw new Error('No definition to update')

      const updatedDefinition: BlockDefinition = {
        ...definition,
        components: updatedComponents,
      }

      const res = await fetch(`/api/admin/blocks/${block.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: updatedDefinition }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-block'] })
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
      setHasChanges(false)
    },
  })

  const updateComponent = (index: number, field: keyof BlockComponentDef, value: string | number | boolean) => {
    setComponents((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    setHasChanges(true)
  }

  const handleSave = () => {
    saveMutation.mutate(components)
  }

  // Group by fit/nofit
  const grouped = components.reduce(
    (acc, comp) => {
      const key = comp.nofit ? 'nofit' : 'fit'
      acc[key].push(comp)
      return acc
    },
    { fit: [] as BlockComponentDef[], nofit: [] as BlockComponentDef[] }
  )

  // Stats
  const withLcsc = components.filter((c) => c.lcscPartNumber).length
  const withMpn = components.filter((c) => c.mpn).length

  if (!definition) {
    return (
      <div className="text-center py-8 text-steel-dim">
        No block definition available. Components cannot be edited.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface-700/30 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-white">{components.length}</div>
          <div className="text-xs text-steel-dim">Total</div>
        </div>
        <div className="bg-surface-700/30 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-green-400">{grouped.fit.length}</div>
          <div className="text-xs text-steel-dim">Populate</div>
        </div>
        <div className="bg-surface-700/30 rounded-lg p-3 text-center">
          <div className={clsx('text-xl font-bold', withLcsc === components.length ? 'text-emerald-400' : 'text-amber-400')}>
            {withLcsc}/{components.length}
          </div>
          <div className="text-xs text-steel-dim">LCSC</div>
        </div>
        <div className="bg-surface-700/30 rounded-lg p-3 text-center">
          <div className={clsx('text-xl font-bold', withMpn === components.length ? 'text-emerald-400' : 'text-amber-400')}>
            {withMpn}/{components.length}
          </div>
          <div className="text-xs text-steel-dim">MPN</div>
        </div>
      </div>

      {/* Save bar */}
      {editable && (
        <div className="flex items-center justify-between bg-surface-700/30 rounded-lg px-4 py-2">
          <div className="text-xs">
            {saveMutation.isSuccess && <span className="text-emerald-400">Saved successfully</span>}
            {saveMutation.isError && (
              <span className="text-red-400">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
              </span>
            )}
            {hasChanges && !saveMutation.isPending && (
              <span className="text-amber-400">Unsaved changes</span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
              hasChanges
                ? 'bg-copper text-surface-900 hover:bg-copper-light'
                : 'bg-surface-700 text-steel-dim cursor-not-allowed'
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" strokeWidth={1.5} />
            )}
            Save
          </button>
        </div>
      )}

      {/* Components table */}
      {grouped.fit.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white mb-3">Bill of Materials</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-steel-dim border-b border-surface-700">
                  <th className="pb-2 pr-2 font-medium">Ref</th>
                  <th className="pb-2 pr-2 font-medium">Value</th>
                  <th className="pb-2 pr-2 font-medium">Footprint</th>
                  <th className="pb-2 pr-2 font-medium">Qty</th>
                  {editable && (
                    <>
                      <th className="pb-2 pr-2 font-medium">Manufacturer</th>
                      <th className="pb-2 pr-2 font-medium">MPN</th>
                      <th className="pb-2 font-medium">LCSC #</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/50">
                {components.map((comp, i) => {
                  if (comp.nofit) return null
                  return (
                    <tr key={i} className="text-steel hover:bg-surface-700/30">
                      <td className="py-1.5 pr-2 font-mono text-white text-xs">{comp.reference}</td>
                      <td className="py-1.5 pr-2 text-xs">{comp.value}</td>
                      <td className="py-1.5 pr-2 text-steel-dim text-xs">{comp.footprint}</td>
                      <td className="py-1.5 pr-2 text-center text-xs">{comp.quantity}</td>
                      {editable && (
                        <>
                          <td className="py-1.5 pr-2">
                            <input
                              type="text"
                              value={comp.manufacturer || ''}
                              onChange={(e) => updateComponent(i, 'manufacturer', e.target.value)}
                              placeholder="—"
                              className="w-20 px-1.5 py-0.5 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="text"
                              value={comp.mpn || ''}
                              onChange={(e) => updateComponent(i, 'mpn', e.target.value)}
                              placeholder="—"
                              className="w-28 px-1.5 py-0.5 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                            />
                          </td>
                          <td className="py-1.5">
                            <input
                              type="text"
                              value={comp.lcscPartNumber || ''}
                              onChange={(e) => updateComponent(i, 'lcscPartNumber', e.target.value)}
                              placeholder="C######"
                              className={clsx(
                                'w-20 px-1.5 py-0.5 bg-surface-800 border text-xs focus:outline-none focus:border-copper',
                                comp.lcscPartNumber
                                  ? 'border-emerald-500/50 text-emerald-400'
                                  : 'border-surface-600 text-steel'
                              )}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No-fit components (read-only) */}
      {grouped.nofit.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-steel-dim mb-3">No-fit (Board Interconnects)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm opacity-60">
              <thead>
                <tr className="text-left text-steel-dim border-b border-surface-700">
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Footprint</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/50">
                {grouped.nofit.map((comp, i) => (
                  <tr key={i} className="text-steel">
                    <td className="py-2 pr-4 font-mono">{comp.reference}</td>
                    <td className="py-2 pr-4">{comp.value}</td>
                    <td className="py-2 pr-4 text-xs">{comp.footprint}</td>
                    <td className="py-2 text-right">{comp.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Files Tab
// =============================================================================

function FilesTab({ block, editable = false }: { block: PcbBlock; editable?: boolean }) {
  const files: Partial<BlockFiles> = block.files || {}
  const hasSchematic = !!files.schematic
  const hasPcb = !!files.pcb
  const hasStep = !!files.stepModel
  const hasBlockJson = !!files.blockJson
  const hasGerbers = !!files.gerbers
  const hasPos = !!files.pos

  const [previewType, setPreviewType] = useState<'schematic' | 'pcb' | '3d' | 'json' | 'gerbers' | 'pos' | 'bom' | null>(
    hasSchematic ? 'schematic' : hasPcb ? 'pcb' : hasStep ? '3d' : hasGerbers ? 'gerbers' : hasBlockJson ? 'json' : null
  )
  const [posContent, setPosContent] = useState<string | null>(null)
  const [bomContent, setBomContent] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [jsonContent, setJsonContent] = useState<string | null>(null)
  const [jsonEdited, setJsonEdited] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [savingJson, setSavingJson] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [gerberLayers, setGerberLayers] = useState<Record<string, string> | null>(null)

  // File input refs for replacement
  const fileInputRefs = {
    schematic: useRef<HTMLInputElement>(null),
    pcb: useRef<HTMLInputElement>(null),
    stepModel: useRef<HTMLInputElement>(null),
    blockJson: useRef<HTMLInputElement>(null),
    thumbnail: useRef<HTMLInputElement>(null),
    gerbers: useRef<HTMLInputElement>(null),
    pos: useRef<HTMLInputElement>(null),
  }

  const handleDeleteFile = async (fileKey: string, filename: string) => {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return

    setDeletingFile(fileKey)
    try {
      const res = await fetch(`/api/admin/blocks/${block.slug}/files/${filename}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // Clear geometry cache and reload to refresh block data
        clearGeometryCache()
        window.location.reload()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to delete file')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file')
    } finally {
      setDeletingFile(null)
    }
  }

  const handleReplaceFile = async (fileKey: string, file: File) => {
    setUploadingFile(fileKey)
    try {
      const formData = new FormData()
      formData.append('slug', block.slug)

      // Map fileKey to the correct form field name
      const fieldMap: Record<string, string> = {
        schematic: 'schematic',
        pcb: 'pcb',
        stepModel: 'step',
        blockJson: 'blockJson',
        thumbnail: 'thumbnail',
        gerbers: 'gerberZip',
      }
      formData.append(fieldMap[fileKey] || fileKey, file)

      const res = await fetch('/api/admin/blocks/upload', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        // Clear geometry cache and reload to refresh block data
        clearGeometryCache()
        window.location.reload()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to upload file')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file')
    } finally {
      setUploadingFile(null)
    }
  }

  const handleFileInputChange = (fileKey: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleReplaceFile(fileKey, file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const loadPreview = async (type: 'schematic' | 'pcb' | '3d' | 'json' | 'gerbers' | 'pos' | 'bom') => {
    // 3D preview doesn't need to load content - StepViewer fetches directly
    if (type === '3d') {
      setPreviewType('3d')
      setPreviewContent(null)
      return
    }

    // Position file preview
    if (type === 'pos') {
      if (!files.pos) return
      setLoadingPreview(true)
      setPreviewType('pos')
      try {
        const res = await fetch(`/api/blocks/${block.slug}/files/${files.pos}`)
        if (res.ok) {
          const content = await res.text()
          setPosContent(content)
        }
      } catch (err) {
        logger.error('ui', 'Failed to load pos file', { error: err })
        setPosContent(null)
      } finally {
        setLoadingPreview(false)
      }
      return
    }

    // BOM preview (generated from definition)
    if (type === 'bom') {
      setPreviewType('bom')
      // Generate BOM from block definition
      const components = block.definition?.components || []
      const fitComponents = components.filter((c) => !c.nofit)

      // Create CSV content
      const headers = ['Reference', 'Value', 'Footprint', 'Quantity', 'Manufacturer', 'MPN', 'LCSC Part Number']
      const rows = fitComponents.map((c) => [
        c.reference,
        c.value,
        c.footprint,
        c.quantity.toString(),
        c.manufacturer || '',
        c.mpn || '',
        c.lcscPartNumber || '',
      ])

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      setBomContent(csvContent)
      return
    }

    // Gerbers preview - load and extract zip
    if (type === 'gerbers') {
      if (!files.gerbers) return
      setLoadingPreview(true)
      setPreviewType('gerbers')
      try {
        const res = await fetch(`/api/blocks/${block.slug}/files/${files.gerbers}`)
        if (res.ok) {
          const blob = await res.blob()
          const zip = await JSZip.loadAsync(blob)
          const layers: Record<string, string> = {}

          // Extract all files from the zip
          for (const [filename, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir) {
              // Only extract gerber files (skip directories and non-gerber files)
              const lower = filename.toLowerCase()
              if (
                lower.endsWith('.gbr') ||
                lower.endsWith('.gtl') ||
                lower.endsWith('.gbl') ||
                lower.endsWith('.gts') ||
                lower.endsWith('.gbs') ||
                lower.endsWith('.gto') ||
                lower.endsWith('.gbo') ||
                lower.endsWith('.gm1') ||
                lower.endsWith('.g1') ||
                lower.endsWith('.g2') ||
                lower.endsWith('.g3') ||
                lower.endsWith('.drl') ||
                lower.includes('-f_cu') ||
                lower.includes('-b_cu') ||
                lower.includes('-in1_cu') ||
                lower.includes('-in2_cu') ||
                lower.includes('-f_mask') ||
                lower.includes('-b_mask') ||
                lower.includes('-f_silkscreen') ||
                lower.includes('-b_silkscreen') ||
                lower.includes('-edge_cuts')
              ) {
                const content = await zipEntry.async('string')
                // Use just the filename without path
                const basename = filename.split('/').pop() || filename
                layers[basename] = content
              }
            }
          }

          setGerberLayers(layers)
        }
      } catch (err) {
        logger.error('ui', 'Failed to load gerbers', { error: err })
        setGerberLayers(null)
      } finally {
        setLoadingPreview(false)
      }
      return
    }

    // JSON preview
    if (type === 'json') {
      if (!files.blockJson) return
      setLoadingPreview(true)
      setPreviewType('json')
      try {
        const res = await fetch(`/api/blocks/${block.slug}/files/${files.blockJson}`)
        if (res.ok) {
          const content = await res.text()
          // Pretty print the JSON
          try {
            const parsed = JSON.parse(content)
            setJsonContent(JSON.stringify(parsed, null, 2))
          } catch {
            setJsonContent(content)
          }
          setJsonEdited(false)
          setJsonError(null)
        }
      } catch (err) {
        logger.error('ui', 'Failed to load JSON', { error: err })
      } finally {
        setLoadingPreview(false)
      }
      return
    }

    const filename = type === 'schematic' ? files.schematic : files.pcb
    if (!filename) return

    setLoadingPreview(true)
    setPreviewType(type)

    try {
      const res = await fetch(`/api/blocks/${block.slug}/files/${filename}`)
      if (res.ok) {
        const content = await res.text()
        setPreviewContent(content)
      }
    } catch (err) {
      logger.error('ui', 'Failed to load preview', { error: err })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleJsonChange = (value: string) => {
    setJsonContent(value)
    setJsonEdited(true)
    // Validate JSON
    try {
      JSON.parse(value)
      setJsonError(null)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  const handleSaveJson = async () => {
    if (!jsonContent || jsonError) return

    setSavingJson(true)
    try {
      // Parse to validate and get the definition
      const definition = JSON.parse(jsonContent)

      // Update the block via API
      const res = await fetch(`/api/admin/blocks/${block.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
      })

      if (res.ok) {
        setJsonEdited(false)
        // Could trigger a refresh here if needed
      } else {
        const err = await res.json()
        setJsonError(err.error || 'Failed to save')
      }
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingJson(false)
    }
  }

  const fileList = [
    {
      key: 'schematic',
      label: 'Schematic',
      file: files.schematic,
      ext: '.kicad_sch',
      accept: '.kicad_sch',
    },
    { key: 'pcb', label: 'PCB Layout', file: files.pcb, ext: '.kicad_pcb', accept: '.kicad_pcb' },
    {
      key: 'stepModel',
      label: '3D Model',
      file: files.stepModel,
      ext: '.step',
      accept: '.step,.stp',
    },
    {
      key: 'gerbers',
      label: 'Gerbers',
      file: files.gerbers,
      ext: '.zip',
      accept: '.zip',
    },
    {
      key: 'pos',
      label: 'Pick & Place',
      file: files.pos,
      ext: '.csv',
      accept: '.csv',
    },
    {
      key: 'blockJson',
      label: 'Block Definition',
      file: files.blockJson,
      ext: '.json',
      accept: '.json',
    },
    {
      key: 'thumbnail',
      label: 'Thumbnail',
      file: files.thumbnail,
      ext: '.png',
      accept: '.png,.jpg,.jpeg',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Hidden file inputs for replacement */}
      {editable &&
        fileList.map(({ key, accept }) => (
          <input
            key={`input-${key}`}
            ref={fileInputRefs[key as keyof typeof fileInputRefs]}
            type="file"
            accept={accept}
            onChange={handleFileInputChange(key)}
            className="hidden"
          />
        ))}

      {/* File list */}
      <div className="grid grid-cols-2 gap-3">
        {fileList.map(({ key, label, file, ext }) => {
          const isDeleting = deletingFile === key
          const isUploading = uploadingFile === key
          const isLoading = isDeleting || isUploading

          return (
            <div
              key={key}
              className={clsx(
                'flex items-center justify-between p-3 rounded-lg border',
                file
                  ? 'bg-surface-700/30 border-surface-600'
                  : 'bg-surface-900/50 border-surface-700/50'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white">{label}</div>
                <div className="text-xs text-steel-dim font-mono truncate">
                  {file || `Missing ${ext}`}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-copper animate-spin" strokeWidth={1.5} />
                ) : (
                  <>
                    {/* Upload/Replace button */}
                    {editable && (
                      <button
                        onClick={() =>
                          fileInputRefs[key as keyof typeof fileInputRefs].current?.click()
                        }
                        className="p-1.5 text-steel hover:text-copper transition-colors"
                        title={file ? 'Replace' : 'Upload'}
                      >
                        <Upload className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                    {/* Download button */}
                    {file && (
                      <a
                        href={`/api/blocks/${block.slug}/files/${file}`}
                        download
                        className="p-1.5 text-steel hover:text-white transition-colors"
                        title="Download"
                      >
                        <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                      </a>
                    )}
                    {/* Delete button */}
                    {editable && file && (
                      <button
                        onClick={() => handleDeleteFile(key, file)}
                        className="p-1.5 text-steel hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview */}
      {(hasSchematic || hasPcb || hasStep || hasGerbers || hasBlockJson || hasPos || block.definition?.components) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">Preview</span>
              <div className="flex gap-1">
                {hasSchematic && (
                  <button
                    onClick={() => loadPreview('schematic')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'schematic'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    Schematic
                  </button>
                )}
                {hasPcb && (
                  <button
                    onClick={() => loadPreview('pcb')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'pcb'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    PCB
                  </button>
                )}
                {hasStep && (
                  <button
                    onClick={() => loadPreview('3d')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === '3d'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    3D Model
                  </button>
                )}
                {hasGerbers && (
                  <button
                    onClick={() => loadPreview('gerbers')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'gerbers'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    Gerbers
                  </button>
                )}
                {hasBlockJson && (
                  <button
                    onClick={() => loadPreview('json')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'json'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    JSON
                  </button>
                )}
                {hasPos && (
                  <button
                    onClick={() => loadPreview('pos')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'pos'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    Pick & Place
                  </button>
                )}
                {block.definition?.components && (
                  <button
                    onClick={() => loadPreview('bom')}
                    className={clsx(
                      'px-3 py-1 text-xs rounded transition-colors',
                      previewType === 'bom'
                        ? 'bg-copper text-surface-900'
                        : 'bg-surface-700 text-steel hover:text-white'
                    )}
                  >
                    BOM
                  </button>
                )}
              </div>
            </div>
            {/* Save button for JSON editor */}
            {previewType === 'json' && jsonEdited && (
              <button
                onClick={handleSaveJson}
                disabled={!!jsonError || savingJson}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors',
                  jsonError
                    ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                )}
              >
                <Save className="w-3 h-3" />
                {savingJson ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
          {/* JSON error message */}
          {previewType === 'json' && jsonError && (
            <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {jsonError}
            </div>
          )}
          <div className="bg-surface-900 rounded-lg overflow-hidden" style={{ height: 400 }}>
            {loadingPreview ? (
              <div className="h-full flex items-center justify-center text-steel-dim">
                Loading preview...
              </div>
            ) : previewType === '3d' && files.stepModel ? (
              <StepViewer
                url={`/api/blocks/${block.slug}/files/${files.stepModel}`}
                className="h-full"
              />
            ) : previewType === 'gerbers' && gerberLayers ? (
              <GerberViewer layers={gerberLayers} className="h-full" />
            ) : previewType === 'pos' && posContent !== null ? (
              <div className="h-full overflow-auto p-4">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-surface-800">
                    <tr className="text-left text-steel-dim border-b border-surface-700">
                      {posContent.split('\n')[0]?.split(',').map((header, i) => (
                        <th key={i} className="pb-2 pr-3 font-medium whitespace-nowrap">
                          {header.replace(/"/g, '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/30">
                    {posContent.split('\n').slice(1).filter(line => line.trim()).map((row, i) => (
                      <tr key={i} className="text-steel hover:bg-surface-800/50">
                        {row.split(',').map((cell, j) => (
                          <td key={j} className="py-1.5 pr-3 whitespace-nowrap">
                            {cell.replace(/"/g, '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previewType === 'bom' && bomContent !== null ? (
              <div className="h-full overflow-auto p-4">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-surface-800">
                    <tr className="text-left text-steel-dim border-b border-surface-700">
                      {bomContent.split('\n')[0]?.split(',').map((header, i) => (
                        <th key={i} className="pb-2 pr-3 font-medium whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700/30">
                    {bomContent.split('\n').slice(1).filter(line => line.trim()).map((row, i) => (
                      <tr key={i} className="text-steel hover:bg-surface-800/50">
                        {row.split(',').map((cell, j) => (
                          <td key={j} className={clsx(
                            'py-1.5 pr-3 whitespace-nowrap',
                            j === 6 && cell ? 'text-emerald-400' : '' // LCSC column
                          )}>
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : previewType === 'json' && jsonContent !== null ? (
              <textarea
                value={jsonContent}
                onChange={(e) => handleJsonChange(e.target.value)}
                className="w-full h-full p-4 bg-surface-900 text-steel font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-copper/50"
                spellCheck={false}
              />
            ) : previewContent ? (
              <KiCanvasViewer
                content={previewContent}
                type={previewType === 'schematic' ? 'schematic' : 'pcb'}
                controls="full"
                theme="kicad"
                className="h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-steel-dim">
                Select a file to preview
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Shared Components
// =============================================================================

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-surface-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-surface-700/30 hover:bg-surface-700/50 transition-colors"
      >
        <div className="text-left">
          <div className="text-sm font-medium text-white">{title}</div>
          {subtitle && <div className="text-xs text-steel-dim mt-0.5">{subtitle}</div>}
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-steel" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-5 h-5 text-steel" strokeWidth={1.5} />
        )}
      </button>
      {expanded && <div className="p-4 border-t border-surface-700">{children}</div>}
    </div>
  )
}

export default BlockViewer
