import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, Maximize2, Minimize2 } from 'lucide-react'
import { clsx } from 'clsx'

interface KiCanvasViewerProps {
  /** URL to the KiCad schematic or PCB file */
  src: string
  /** Type of document to display */
  type?: 'schematic' | 'pcb'
  /** Control level: none, basic, or full */
  controls?: 'none' | 'basic' | 'full'
  /** Additional class names */
  className?: string
  /** Callback when loading completes */
  onLoad?: () => void
  /** Callback on error */
  onError?: (error: string) => void
}

// Track if KiCanvas script has been loaded
let kicanvasLoaded = false
let kicanvasLoadPromise: Promise<void> | null = null

async function loadKiCanvas(): Promise<void> {
  if (kicanvasLoaded) return
  if (kicanvasLoadPromise) return kicanvasLoadPromise

  kicanvasLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (customElements.get('kicanvas-embed')) {
      kicanvasLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.type = 'module'
    // Using unpkg CDN for KiCanvas - this bundles all dependencies
    script.src = 'https://kicanvas.org/kicanvas/kicanvas.js'
    script.onload = () => {
      kicanvasLoaded = true
      resolve()
    }
    script.onerror = () => {
      reject(new Error('Failed to load KiCanvas'))
    }
    document.head.appendChild(script)
  })

  return kicanvasLoadPromise
}

export function KiCanvasViewer({
  src,
  type = 'schematic',
  controls = 'basic',
  className,
  onLoad,
  onError,
}: KiCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        setLoading(true)
        setError(null)

        // Load KiCanvas script
        await loadKiCanvas()

        if (!mounted) return

        // Wait a tick for custom elements to register
        await new Promise((resolve) => setTimeout(resolve, 100))

        if (!mounted || !containerRef.current) return

        // Clear previous content
        containerRef.current.innerHTML = ''

        // Create KiCanvas embed element
        const embed = document.createElement('kicanvas-embed')
        embed.setAttribute('src', src)
        embed.setAttribute('controls', controls)
        embed.style.width = '100%'
        embed.style.height = '100%'
        embed.style.display = 'block'

        // Listen for load/error events
        embed.addEventListener('load', () => {
          if (mounted) {
            setLoading(false)
            onLoad?.()
          }
        })

        embed.addEventListener('error', (e: Event) => {
          if (mounted) {
            const msg = (e as CustomEvent).detail?.message || 'Failed to load document'
            setError(msg)
            setLoading(false)
            onError?.(msg)
          }
        })

        containerRef.current.appendChild(embed)

        // Set a timeout for loading
        setTimeout(() => {
          if (mounted && loading) {
            setLoading(false)
          }
        }, 5000)
      } catch (err) {
        if (mounted) {
          const msg = err instanceof Error ? err.message : 'Failed to initialize viewer'
          setError(msg)
          setLoading(false)
          onError?.(msg)
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [src, controls, onLoad, onError])

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative bg-surface-900 overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-copper animate-spin mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-steel-dim">Loading {type}...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900/80 z-10">
          <div className="text-center max-w-md p-4">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-red-400 mb-2">Failed to load {type}</p>
            <p className="text-xs text-steel-dim">{error}</p>
          </div>
        </div>
      )}

      {/* Fullscreen toggle button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-20 p-2 bg-surface-800/80 hover:bg-surface-700 rounded transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4 text-steel" strokeWidth={1.5} />
        ) : (
          <Maximize2 className="w-4 h-4 text-steel" strokeWidth={1.5} />
        )}
      </button>
    </div>
  )
}

export default KiCanvasViewer
