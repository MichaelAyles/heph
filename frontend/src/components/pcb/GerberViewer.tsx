/**
 * GerberViewer - Displays Gerber layers using tracespace rendering
 *
 * Uses @tracespace/parser, @tracespace/plotter, and @tracespace/renderer
 * for proper gerber visualization.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createParser } from '@tracespace/parser'
import { plot as plotTree, BoundingBox } from '@tracespace/plotter'
import { render as renderImage } from '@tracespace/renderer'
import { Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Layers, Eye, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'

// Layer colors matching typical PCB CAM viewers
const LAYER_COLORS: Record<string, { fill: string; stroke: string; label: string; order: number }> = {
  'F.Cu': { fill: '#c83232', stroke: '#ff4444', label: 'Top Copper', order: 4 },
  'In1.Cu': { fill: '#c8c800', stroke: '#ffff00', label: 'Inner 1', order: 3 },
  'In2.Cu': { fill: '#00c8c8', stroke: '#00ffff', label: 'Inner 2', order: 2 },
  'B.Cu': { fill: '#3232c8', stroke: '#4444ff', label: 'Bottom Copper', order: 1 },
  'F.Mask': { fill: '#800080', stroke: '#aa00aa', label: 'Top Mask', order: 6 },
  'B.Mask': { fill: '#008080', stroke: '#00aaaa', label: 'Bottom Mask', order: 0 },
  'F.SilkS': { fill: '#f0f0f0', stroke: '#ffffff', label: 'Top Silk', order: 7 },
  'B.SilkS': { fill: '#808080', stroke: '#aaaaaa', label: 'Bottom Silk', order: -1 },
  'Edge.Cuts': { fill: 'none', stroke: '#c8c800', label: 'Board Outline', order: 8 },
  'Drill': { fill: '#ffffff', stroke: '#ffffff', label: 'Drills', order: 5 },
}

// Map common Gerber file extensions to layer names
function guessLayerFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.includes('f.cu') || lower.endsWith('.gtl') || lower.includes('-f_cu'))
    return 'F.Cu'
  if (lower.includes('b.cu') || lower.endsWith('.gbl') || lower.includes('-b_cu'))
    return 'B.Cu'
  if (lower.includes('in1.cu') || lower.endsWith('.g2') || lower.includes('-in1_cu'))
    return 'In1.Cu'
  if (lower.includes('in2.cu') || lower.endsWith('.g3') || lower.includes('-in2_cu'))
    return 'In2.Cu'
  if (lower.includes('f.mask') || lower.endsWith('.gts') || lower.includes('-f_mask'))
    return 'F.Mask'
  if (lower.includes('b.mask') || lower.endsWith('.gbs') || lower.includes('-b_mask'))
    return 'B.Mask'
  if (lower.includes('f.silks') || lower.endsWith('.gto') || lower.includes('-f_silkscreen'))
    return 'F.SilkS'
  if (lower.includes('b.silks') || lower.endsWith('.gbo') || lower.includes('-b_silkscreen'))
    return 'B.SilkS'
  if (lower.includes('edge') || lower.endsWith('.gm1') || lower.includes('-edge_cuts'))
    return 'Edge.Cuts'
  if (lower.endsWith('.drl') || lower.includes('drill'))
    return 'Drill'
  return 'Unknown'
}

interface GerberLayer {
  name: string
  filename: string
  content: string
  visible: boolean
  svgContent?: string
  bounds?: BoundingBox
  error?: string
}

interface GerberViewerProps {
  /** Map of filename to Gerber content */
  layers: Record<string, string>
  className?: string
}

export function GerberViewer({ layers, className }: GerberViewerProps) {
  const [parsedLayers, setParsedLayers] = useState<GerberLayer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  // Parse all Gerber layers
  useEffect(() => {
    async function parseAllLayers() {
      setIsLoading(true)
      setError(null)

      try {
        const parsed: GerberLayer[] = []

        for (const [filename, content] of Object.entries(layers)) {
          const layerName = guessLayerFromFilename(filename)
          try {
            // Parse the gerber content
            const parser = createParser()
            parser.feed(content)
            const parseTree = parser.results()

            // Plot to image tree
            const imageTree = plotTree(parseTree)

            // Render to SVG
            const svgElement = renderImage(imageTree)

            // Extract the inner SVG content (without the wrapper <svg> tags)
            // The render function returns a full SVG element, we need to convert to string
            let svgString = ''
            if (svgElement && typeof svgElement === 'object') {
              // Build SVG string from element properties
              const children = svgElement.children || []
              const viewBox = svgElement.attributes?.viewBox || ''

              // Create group with layer styling
              const colorConfig = LAYER_COLORS[layerName] || { fill: '#888', stroke: '#aaa' }

              svgString = `<g class="layer-${layerName.replace('.', '-')}" fill="${colorConfig.fill}" stroke="${colorConfig.stroke}">`

              // Recursively convert children to SVG string
              const convertToString = (el: unknown): string => {
                if (!el || typeof el !== 'object') return ''
                const element = el as { type?: string; attributes?: Record<string, unknown>; children?: unknown[] }
                if (!element.type) return ''

                const attrs = element.attributes || {}
                const attrStr = Object.entries(attrs)
                  .map(([k, v]) => `${k}="${v}"`)
                  .join(' ')

                if (element.children && element.children.length > 0) {
                  const childStr = element.children.map(convertToString).join('')
                  return `<${element.type} ${attrStr}>${childStr}</${element.type}>`
                }
                return `<${element.type} ${attrStr}/>`
              }

              svgString += children.map(convertToString).join('')
              svgString += '</g>'
            }

            parsed.push({
              name: layerName,
              filename,
              content,
              visible: layerName !== 'Unknown',
              svgContent: svgString,
              bounds: imageTree.size,
            })
          } catch (parseError) {
            console.warn(`Failed to parse ${filename}:`, parseError)
            parsed.push({
              name: layerName,
              filename,
              content,
              visible: false,
              error: parseError instanceof Error ? parseError.message : 'Parse error',
            })
          }
        }

        // Sort layers by viewing order
        parsed.sort((a, b) => {
          const aOrder = LAYER_COLORS[a.name]?.order ?? 99
          const bOrder = LAYER_COLORS[b.name]?.order ?? 99
          return aOrder - bOrder
        })

        setParsedLayers(parsed)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse Gerber files')
      } finally {
        setIsLoading(false)
      }
    }

    if (Object.keys(layers).length > 0) {
      parseAllLayers()
    }
  }, [layers])

  // Calculate overall bounds
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const layer of parsedLayers) {
      if (!layer.visible || !layer.bounds) continue
      minX = Math.min(minX, layer.bounds[0])
      minY = Math.min(minY, layer.bounds[1])
      maxX = Math.max(maxX, layer.bounds[2])
      maxY = Math.max(maxY, layer.bounds[3])
    }

    if (!isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }
    }

    const padding = 2
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    }
  }, [parsedLayers])

  // Toggle layer visibility
  const toggleLayer = useCallback((filename: string) => {
    setParsedLayers((prev) =>
      prev.map((l) => (l.filename === filename ? { ...l, visible: !l.visible } : l))
    )
  }, [])

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 20))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, 0.1))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.1, Math.min(20, z * delta)))
  }

  if (isLoading) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-950', className)}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-copper animate-spin mx-auto mb-2" />
          <p className="text-sm text-steel-dim">Parsing gerber files...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={clsx('flex items-center justify-center', className)}>
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (parsedLayers.length === 0) {
    return (
      <div className={clsx('flex items-center justify-center', className)}>
        <p className="text-steel-dim text-sm">No Gerber layers to display</p>
      </div>
    )
  }

  const visibleLayers = parsedLayers.filter((l) => l.visible && l.svgContent)
  const successfulLayers = parsedLayers.filter((l) => !l.error)

  return (
    <div className={clsx('flex h-full', className)}>
      {/* Main viewer */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-surface-950"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Toolbar */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-surface-800/90 rounded p-1">
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-surface-700 rounded text-steel-dim hover:text-steel"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-surface-700 rounded text-steel-dim hover:text-steel"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1 hover:bg-surface-700 rounded text-steel-dim hover:text-steel"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="text-xs text-steel-dim px-1">{Math.round(zoom * 100)}%</span>
          <div className="w-px h-4 bg-surface-600 mx-1" />
          <button
            onClick={() => setShowLayerPanel((v) => !v)}
            className={clsx(
              'p-1 rounded',
              showLayerPanel
                ? 'bg-copper/20 text-copper'
                : 'hover:bg-surface-700 text-steel-dim hover:text-steel'
            )}
            title="Toggle Layers Panel"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        {/* Info badge */}
        <div className="absolute top-2 right-2 z-10 text-xs text-steel-dim bg-surface-800/90 rounded px-2 py-1">
          {visibleLayers.length}/{successfulLayers.length} layers visible
        </div>

        {/* SVG canvas */}
        <svg
          className="w-full h-full"
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            cursor: isDragging.current ? 'grabbing' : 'grab',
          }}
        >
          <g transform={`translate(${pan.x / zoom / 10}, ${pan.y / zoom / 10}) scale(${zoom})`}>
            {/* Background */}
            <rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.width}
              height={bounds.height}
              fill="#1a1a1a"
            />

            {/* Grid */}
            <defs>
              <pattern id="grid-minor" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#333" strokeWidth="0.02" />
              </pattern>
              <pattern id="grid-major" width="10" height="10" patternUnits="userSpaceOnUse">
                <rect width="10" height="10" fill="url(#grid-minor)" />
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#444" strokeWidth="0.05" />
              </pattern>
            </defs>
            <rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.width}
              height={bounds.height}
              fill="url(#grid-major)"
            />

            {/* Render layers (bottom to top) */}
            {visibleLayers.map((layer) => (
              <g
                key={layer.filename}
                dangerouslySetInnerHTML={{ __html: layer.svgContent || '' }}
                opacity={0.85}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Layer panel */}
      {showLayerPanel && (
        <div className="w-48 border-l border-surface-700 bg-surface-900 overflow-y-auto">
          <div className="p-2 border-b border-surface-700">
            <h3 className="text-xs font-medium text-steel-dim uppercase tracking-wider">Layers</h3>
          </div>
          <div className="p-2 space-y-1">
            {parsedLayers.map((layer) => {
              const color = LAYER_COLORS[layer.name] || {
                fill: '#888',
                stroke: '#aaa',
                label: layer.name,
              }
              return (
                <button
                  key={layer.filename}
                  onClick={() => toggleLayer(layer.filename)}
                  disabled={!!layer.error}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                    layer.error
                      ? 'text-red-400/50 cursor-not-allowed'
                      : layer.visible
                        ? 'bg-surface-800 text-steel'
                        : 'text-steel-dim hover:bg-surface-800/50'
                  )}
                  title={layer.error || layer.filename}
                >
                  <span
                    className="w-3 h-3 rounded-sm border"
                    style={{
                      backgroundColor: layer.visible && !layer.error ? color.fill : 'transparent',
                      borderColor: layer.error ? '#f44' : color.stroke,
                    }}
                  />
                  <span className="truncate flex-1 text-left">{color.label}</span>
                  {layer.error ? (
                    <AlertCircle className="w-3 h-3 text-red-400" />
                  ) : layer.visible ? (
                    <Eye className="w-3 h-3 text-copper" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-surface-500" />
                  )}
                </button>
              )
            })}
          </div>
          {/* Board size */}
          {bounds.width > 0 && bounds.width < 1000 && (
            <div className="p-2 border-t border-surface-700 text-xs text-steel-dim">
              <div className="flex justify-between">
                <span>Board size:</span>
                <span className="font-mono">
                  {bounds.width.toFixed(1)}×{bounds.height.toFixed(1)}mm
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GerberViewer
