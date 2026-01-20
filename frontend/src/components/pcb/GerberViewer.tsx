/**
 * GerberViewer - Displays Gerber layer information
 *
 * Uses @tracespace/parser to parse Gerber files and displays layer details.
 * Full SVG rendering is a future enhancement.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createParser, type Root } from '@tracespace/parser'
import { Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Layers, Eye, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'

// Layer colors matching typical PCB CAM viewers
const LAYER_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  'F.Cu': { fill: '#c83232', stroke: '#ff4444', label: 'Top Copper' },
  'In1.Cu': { fill: '#c8c800', stroke: '#ffff00', label: 'Inner 1' },
  'In2.Cu': { fill: '#00c8c8', stroke: '#00ffff', label: 'Inner 2' },
  'B.Cu': { fill: '#3232c8', stroke: '#4444ff', label: 'Bottom Copper' },
  'F.Mask': { fill: '#800080', stroke: '#aa00aa', label: 'Top Mask' },
  'B.Mask': { fill: '#008080', stroke: '#00aaaa', label: 'Bottom Mask' },
  'F.SilkS': { fill: '#c8c8c8', stroke: '#ffffff', label: 'Top Silk' },
  'B.SilkS': { fill: '#808080', stroke: '#aaaaaa', label: 'Bottom Silk' },
  'Edge.Cuts': { fill: 'none', stroke: '#c8c800', label: 'Board Outline' },
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
  return 'Unknown'
}

interface GerberLayer {
  name: string
  filename: string
  content: string
  visible: boolean
  parsedTree?: Root
  bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  graphicCount?: number
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
  const svgRef = useRef<SVGSVGElement>(null)
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
            const parser = createParser()
            parser.feed(content)
            const tree = parser.results()

            // Count graphics and calculate bounds
            let graphicCount = 0
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

            for (const child of tree.children) {
              if (child.type === 'graphic') {
                graphicCount++
                // Try to extract coordinates if available
                // Coordinates is { [axis: string]: string } with 'x' and 'y' keys
                const graphicNode = child as { coordinates?: Record<string, string> }
                if (graphicNode.coordinates) {
                  const xStr = graphicNode.coordinates['x']
                  const yStr = graphicNode.coordinates['y']
                  if (xStr !== undefined) {
                    const x = parseFloat(xStr)
                    if (!isNaN(x)) {
                      minX = Math.min(minX, x)
                      maxX = Math.max(maxX, x)
                    }
                  }
                  if (yStr !== undefined) {
                    const y = parseFloat(yStr)
                    if (!isNaN(y)) {
                      minY = Math.min(minY, y)
                      maxY = Math.max(maxY, y)
                    }
                  }
                }
              }
            }

            parsed.push({
              name: layerName,
              filename,
              content,
              visible: layerName !== 'Unknown',
              parsedTree: tree,
              bounds: isFinite(minX) ? { minX, minY, maxX, maxY } : undefined,
              graphicCount,
            })
          } catch (parseError) {
            console.warn(`Failed to parse ${filename}:`, parseError)
            parsed.push({
              name: layerName,
              filename,
              content,
              visible: false,
              graphicCount: 0,
            })
          }
        }

        // Sort layers by typical viewing order (bottom to top)
        const layerOrder = [
          'B.Cu',
          'In2.Cu',
          'In1.Cu',
          'F.Cu',
          'B.Mask',
          'F.Mask',
          'B.SilkS',
          'F.SilkS',
          'Edge.Cuts',
        ]
        parsed.sort((a, b) => {
          const aIdx = layerOrder.indexOf(a.name)
          const bIdx = layerOrder.indexOf(b.name)
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
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

  // Calculate bounds from all layers
  const bounds = React.useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    for (const layer of parsedLayers) {
      if (!layer.visible || !layer.bounds) continue
      minX = Math.min(minX, layer.bounds.minX)
      minY = Math.min(minY, layer.bounds.minY)
      maxX = Math.max(maxX, layer.bounds.maxX)
      maxY = Math.max(maxY, layer.bounds.maxY)
    }

    if (!isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 }
    }

    const padding = 5 // mm padding
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
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 10))
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
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)))
  }

  // Render a single layer to SVG paths
  const renderLayer = useCallback((layer: GerberLayer) => {
    if (!layer.parsedTree || !layer.visible) return null

    const color = LAYER_COLORS[layer.name] || { fill: '#888', stroke: '#aaa', label: layer.name }
    const paths: React.ReactElement[] = []
    let pathId = 0

    for (const child of layer.parsedTree.children) {
      if (child.type === 'graphic') {
        // Coordinates is { [axis: string]: string } with 'x' and 'y' keys
        const graphicNode = child as { coordinates?: Record<string, string>; graphic?: string }
        if (!graphicNode.coordinates) continue

        const xStr = graphicNode.coordinates['x']
        const yStr = graphicNode.coordinates['y']
        if (xStr === undefined || yStr === undefined) continue

        const x = parseFloat(xStr)
        const y = parseFloat(yStr)
        if (isNaN(x) || isNaN(y)) continue

        // For shape graphics (flashes), render as a circle
        // For segment graphics, we'd need to track the previous point
        if (graphicNode.graphic === 'shape' || graphicNode.graphic === null) {
          paths.push(
            <circle
              key={`${layer.filename}-${pathId++}`}
              cx={x}
              cy={-y} // Flip Y for SVG
              r={0.2}
              fill={color.fill}
              opacity={0.8}
            />
          )
        } else {
          // For segments, render as a small circle at each coordinate
          // (Full segment rendering would require tracking previous position)
          paths.push(
            <circle
              key={`${layer.filename}-${pathId++}`}
              cx={x}
              cy={-y}
              r={0.1}
              fill={color.stroke}
              opacity={0.7}
            />
          )
        }
      }
    }

    return <g key={layer.filename}>{paths}</g>
  }, [])

  if (isLoading) {
    return (
      <div className={clsx('flex items-center justify-center', className)}>
        <Loader2 className="w-8 h-8 text-copper animate-spin" />
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

  const totalGraphics = parsedLayers.reduce((sum, l) => sum + (l.graphicCount || 0), 0)
  const visibleLayers = parsedLayers.filter((l) => l.visible)

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
          {totalGraphics.toLocaleString()} graphics • {visibleLayers.length}/{parsedLayers.length} layers
        </div>

        {/* SVG canvas */}
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            cursor: isDragging.current ? 'grabbing' : 'grab',
          }}
        >
          <g
            transform={`translate(${pan.x + (containerRef.current?.clientWidth || 0) / 2}, ${pan.y + (containerRef.current?.clientHeight || 0) / 2}) scale(${zoom * 3}) translate(${-bounds.minX - bounds.width / 2}, ${bounds.minY + bounds.height / 2})`}
          >
            {/* Background grid */}
            <defs>
              <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#333" strokeWidth="0.02" />
              </pattern>
            </defs>
            <rect
              x={bounds.minX}
              y={-bounds.maxY}
              width={bounds.width}
              height={bounds.height}
              fill="url(#grid)"
            />

            {/* Render layers */}
            {parsedLayers.map(renderLayer)}
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
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                    layer.visible
                      ? 'bg-surface-800 text-steel'
                      : 'text-steel-dim hover:bg-surface-800/50'
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-sm border"
                    style={{
                      backgroundColor: layer.visible ? color.fill : 'transparent',
                      borderColor: color.stroke,
                    }}
                  />
                  <span className="truncate flex-1 text-left">{color.label}</span>
                  {layer.visible ? (
                    <Eye className="w-3 h-3 text-copper" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-surface-500" />
                  )}
                </button>
              )
            })}
          </div>
          {/* Layer stats */}
          <div className="p-2 border-t border-surface-700 text-xs text-steel-dim">
            <div className="flex justify-between">
              <span>Total graphics:</span>
              <span className="font-mono">{totalGraphics.toLocaleString()}</span>
            </div>
            {bounds.width > 0 && bounds.width < 1000 && (
              <div className="flex justify-between mt-1">
                <span>Board size:</span>
                <span className="font-mono">
                  {bounds.width.toFixed(1)}×{bounds.height.toFixed(1)}mm
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GerberViewer
