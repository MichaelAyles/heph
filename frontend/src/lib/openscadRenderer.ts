/**
 * OpenSCAD WASM Renderer
 *
 * Lazy-loads openscad-wasm and provides a simple API for rendering
 * OpenSCAD code to STL binary format.
 */

// Lazy-loaded module reference
let openscadInstance: OpenSCADInstance | null = null
let loadPromise: Promise<OpenSCADInstance> | null = null

interface OpenSCADInstance {
  renderToStl: (code: string) => Promise<string>
  getInstance: () => {
    FS: {
      writeFile: (path: string, data: string | Uint8Array) => void
      readFile: (path: string, options?: { encoding?: string }) => Uint8Array | string
      unlink: (path: string) => void
    }
    callMain: (args: string[]) => number
  }
}

interface RenderResult {
  stl: Uint8Array
  logs: string[]
  success: boolean
  error?: string
}

// Warnings to suppress (expected in WASM environment)
const SUPPRESSED_WARNINGS = [
  'Could not initialize localization',
  'Fontconfig error',
  "Can't get font",
]

/**
 * Load the OpenSCAD WASM module
 * This is lazy-loaded to avoid blocking initial page load
 */
async function loadOpenSCAD(): Promise<OpenSCADInstance> {
  if (openscadInstance) {
    return openscadInstance
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    // Temporarily suppress known WASM warnings during initialization
    const originalConsoleLog = console.log
    const originalConsoleError = console.error

    const filterWarning = (args: unknown[]) => {
      const msg = args.join(' ')
      return SUPPRESSED_WARNINGS.some((w) => msg.includes(w))
    }

    console.log = (...args) => {
      if (!filterWarning(args)) originalConsoleLog(...args)
    }
    console.error = (...args) => {
      if (!filterWarning(args)) originalConsoleError(...args)
    }

    try {
      // Dynamic import to enable code splitting
      // The package exports createOpenSCAD as a named export
      const { createOpenSCAD } = await import('openscad-wasm')
      const instance = await createOpenSCAD()

      openscadInstance = instance
      return openscadInstance
    } finally {
      // Restore console after a short delay to catch startup warnings
      setTimeout(() => {
        console.log = originalConsoleLog
        console.error = originalConsoleError
      }, 1000)
    }
  })()

  return loadPromise
}

/**
 * Render OpenSCAD code to STL
 */
export async function renderOpenSCAD(code: string): Promise<RenderResult> {
  const logs: string[] = []

  // Suppress known WASM warnings during rendering
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  const filterWarning = (args: unknown[]) => {
    const msg = args.join(' ')
    return SUPPRESSED_WARNINGS.some((w) => msg.includes(w))
  }

  console.log = (...args) => {
    if (!filterWarning(args)) originalConsoleLog(...args)
  }
  console.error = (...args) => {
    if (!filterWarning(args)) originalConsoleError(...args)
  }

  try {
    const instance = await loadOpenSCAD()

    // Use the high-level API provided by openscad-wasm
    const stlString = await instance.renderToStl(code)

    // Convert string to Uint8Array for binary STL handling
    const encoder = new TextEncoder()
    const stl = encoder.encode(stlString)

    return {
      stl,
      logs,
      success: true,
    }
  } catch (error) {
    return {
      stl: new Uint8Array(),
      logs,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    // Restore console
    console.log = originalConsoleLog
    console.error = originalConsoleError
  }
}

/**
 * Create a Blob URL from STL data for use in viewers
 */
export function createSTLBlobUrl(stlData: Uint8Array): string {
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(stlData.byteLength)
  new Uint8Array(buffer).set(stlData)
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Revoke a Blob URL when no longer needed
 */
export function revokeSTLBlobUrl(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * Check if OpenSCAD WASM is loaded
 */
export function isOpenSCADLoaded(): boolean {
  return openscadInstance !== null
}

/**
 * Preload OpenSCAD WASM module
 * Call this when user navigates to enclosure stage to start loading
 */
export async function preloadOpenSCAD(): Promise<void> {
  await loadOpenSCAD()
}
