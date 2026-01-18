# Blog 36: BlockViewer - Inspecting Hardware Blocks with KiCanvas

**Date**: January 18, 2026

## The Problem: Blocks Are Opaque

We've built a system that imports KiCad designs and generates block definitions. But once a block is in the database, viewing it means:

1. Download the JSON
2. Open in a text editor
3. Cross-reference with the KiCad files
4. Download and open those in KiCad

For admins managing 20+ blocks, this is tedious. You can't quickly verify that the LLM-generated metadata matches the actual schematic.

## BlockViewer: A Unified Inspector

The BlockViewer component displays everything about a block in one place:

```
┌─────────────────────────────────────────────────────────┐
│ [MCU] ESP32-C6 Module                         v1.0  2×2 │
│ WiFi 6, BLE 5.3, and Zigbee/Thread capable MCU          │
│                                                         │
│ [WiFi 6] [BLE 5] [Zigbee] [Thread]                     │
├─────────────────────────────────────────────────────────┤
│ [Bus Interface] [Edges] [Components] [Files]            │
├─────────────────────────────────────────────────────────┤
│ ▼ Bus Taps (22)                                         │
│   Signal     Resistor  Isolates           Voltage  Dir  │
│   GPIO_0     R1        U1.GPIO0→BUS       0-3.3V   I/O  │
│   GPIO_1     R2        U1.GPIO1→BUS       0-3.3V   I/O  │
│   ...                                                   │
├─────────────────────────────────────────────────────────┤
│ ▼ Permanent Connections (4)                             │
│   Signal  Pin           Reason          Voltage  Dir    │
│   GND     U1.GND        Always ground   0V       PWR    │
│   ...                                                   │
└─────────────────────────────────────────────────────────┘
```

Four tabs organize the information:

**Bus Interface**: Taps (0Ω resistors for signal isolation), permanent connections, power requirements, and I2C/SPI details. This is where you verify the block will integrate correctly with the bus.

**Edges**: Visual representation of north/south edge connectors. Shows which bus signals are exposed on each edge column.

**Components**: Full BOM with reference designators, values, footprints, and quantities. Distinguishes between components to populate and no-fit items (board-to-board interconnects).

**Files**: List of associated files (schematic, PCB, STEP model, thumbnail) with download links. And the key feature: live preview.

## The KiCanvas Integration

[KiCanvas](https://github.com/theacodes/kicanvas) is a web-based KiCad file viewer. It runs entirely in the browser - no server-side rendering needed. Perfect for our use case.

One problem: KiCanvas expects a URL to fetch the file from. Our files are in R2 storage, accessible via API. But we've already fetched the content to check file types. Re-fetching wastes bandwidth and adds latency.

### The Fork

The solution: fork KiCanvas to support a `content` attribute alongside `src`. Instead of:

```html
<kicanvas-embed src="https://example.com/schematic.kicad_sch"></kicanvas-embed>
```

We can now do:

```html
<kicanvas-embed content="(kicad_sch (version 20230121)...)"></kicanvas-embed>
```

The forked version lives at `https://kicanvas.mikeayles.com/kicanvas/kicanvas.js`.

### The React Wrapper

`KiCanvasViewer` is a React component that handles the complexity of embedding a web component:

```typescript
export function KiCanvasViewer({
  src,
  content,
  type = 'schematic',
  controls = 'basic',
  theme = 'kicad',
  className,
  onLoad,
  onError,
}: KiCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<HTMLElement | null>(null)
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
```

Key implementation details:

**Script Loading**: KiCanvas is a module script. We load it once globally and track the promise to avoid duplicate loads:

```typescript
let kicanvasLoaded = false
let kicanvasLoadPromise: Promise<void> | null = null

async function loadKiCanvas(): Promise<void> {
  if (kicanvasLoaded) return
  if (kicanvasLoadPromise) return kicanvasLoadPromise

  kicanvasLoadPromise = new Promise((resolve, reject) => {
    if (customElements.get('kicanvas-embed')) {
      kicanvasLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'https://kicanvas.mikeayles.com/kicanvas/kicanvas.js'
    script.onload = () => { kicanvasLoaded = true; resolve() }
    script.onerror = () => reject(new Error('Failed to load KiCanvas'))
    document.head.appendChild(script)
  })

  return kicanvasLoadPromise
}
```

**Element Management**: Web components need careful lifecycle handling. We create the embed element imperatively and track it with a ref separate from the container:

```typescript
// Remove previous embed if it exists
if (embedRef.current && embedRef.current.parentNode) {
  embedRef.current.parentNode.removeChild(embedRef.current)
  embedRef.current = null
}

// Create new embed
const embed = document.createElement('kicanvas-embed')
embedRef.current = embed

if (content) {
  embed.setAttribute('content', content)
} else if (src) {
  embed.setAttribute('src', src)
}

embed.setAttribute('controls', controls)
embed.setAttribute('theme', theme)

containerRef.current.appendChild(embed)
```

**Loading State**: KiCanvas doesn't always fire load events reliably. We use a fallback timeout that clears the loading state after 5 seconds:

```typescript
// Clear timeout on successful load
embed.addEventListener('load', () => {
  if (loadingTimeoutRef.current) {
    clearTimeout(loadingTimeoutRef.current)
    loadingTimeoutRef.current = null
  }
  setLoading(false)
})

// Fallback timeout
loadingTimeoutRef.current = setTimeout(() => {
  if (mounted) setLoading(false)
}, 5000)
```

**Cleanup**: The useEffect cleanup removes the embed and clears any pending timeout to avoid memory leaks:

```typescript
return () => {
  mounted = false
  if (loadingTimeoutRef.current) {
    clearTimeout(loadingTimeoutRef.current)
    loadingTimeoutRef.current = null
  }
  if (embedRef.current && embedRef.current.parentNode) {
    embedRef.current.parentNode.removeChild(embedRef.current)
    embedRef.current = null
  }
}
```

## The Files Tab Flow

When a user clicks "Schematic" or "PCB" in the Files tab:

```typescript
const loadPreview = async (type: 'schematic' | 'pcb') => {
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
    console.error('Failed to load preview:', err)
  } finally {
    setLoadingPreview(false)
  }
}
```

The content is fetched from R2 via our API, then passed to KiCanvasViewer:

```tsx
<KiCanvasViewer
  content={previewContent}
  type={previewType === 'schematic' ? 'schematic' : 'pcb'}
  controls="full"
  theme="kicad"
  className="h-full"
/>
```

The result: interactive schematic and PCB viewing directly in the browser. Pan, zoom, click components - all without leaving the admin panel.

## Fullscreen Support

For detailed inspection, KiCanvasViewer includes a fullscreen toggle:

```typescript
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

// Sync state with browser fullscreen changes
useEffect(() => {
  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement)
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
}, [])
```

When fullscreen, the viewer gets `fixed inset-0 z-50` positioning to fill the screen.

## Integration with Admin

The AdminBlocksPage now has a "View" button for each block:

```tsx
<button
  onClick={() => setViewingBlock(block)}
  className="p-1.5 text-steel hover:text-copper transition-colors"
  title="View block details"
>
  <Eye className="w-4 h-4" strokeWidth={1.5} />
</button>
```

Clicking it opens a modal with the BlockViewer:

```tsx
{viewingBlock && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
    <div className="relative w-full max-w-4xl max-h-[90vh] overflow-auto">
      <button
        onClick={() => setViewingBlock(null)}
        className="absolute top-4 right-4 z-10 p-2 bg-surface-800 rounded-full"
      >
        <X className="w-5 h-5 text-steel" />
      </button>
      <BlockViewer block={viewingBlock} />
    </div>
  </div>
)}
```

## What We Shipped

The workflow for verifying a block went from:

1. Find block in admin list
2. Download schematic.kicad_sch
3. Open KiCad
4. Open schematic
5. Compare with downloaded block.json
6. Repeat for PCB

To:

1. Click "View" button
2. Browse tabs - all the information is there
3. Click "Schematic" - see it rendered
4. Click "PCB" - see the layout

This cuts block verification time from minutes to seconds. When the LLM generates slightly wrong I2C addresses or misidentifies a bus tap, you spot it immediately.

## The Commits

```
Add BlockViewer component with admin integration

- Create comprehensive BlockViewer for viewing block definitions
- Includes tabs: Bus Interface, Edges, Components, Files
- Displays taps, permanent connections, power, I2C/SPI info
- Shows wireless capability badges (WiFi, BLE, Zigbee, etc.)
- KiCanvas preview in Files tab for schematics and PCB layouts
- Collapsible sections for organized data display
- Integrate BlockViewer modal into AdminBlocksPage with View button
```

```
Fix KiCanvasViewer removeChild error by using separate embed ref

Maintains a separate ref for the embed element to ensure proper
cleanup without React DOM conflicts.
```

```
Fix race conditions, data loss, and error handling issues

Includes fix for KiCanvasViewer timeout stale closure - uses
ref to track timeout and properly clears it on load/error/unmount.
```

The block library is now browsable. Next step: using these validated blocks to build actual PCBs.
