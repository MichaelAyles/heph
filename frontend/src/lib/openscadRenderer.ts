/**
 * OpenSCAD WASM Renderer
 *
 * Lazy-loads openscad-wasm and provides a simple API for rendering
 * OpenSCAD code to STL binary format.
 */

// Lazy-loaded module reference
let openscadModule: OpenSCADModule | null = null
let loadPromise: Promise<OpenSCADModule> | null = null

interface OpenSCADModule {
  FS: {
    writeFile: (path: string, data: string | Uint8Array) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
  }
  callMain: (args: string[]) => number
}

interface RenderResult {
  stl: Uint8Array
  logs: string[]
  success: boolean
  error?: string
}

/**
 * Load the OpenSCAD WASM module
 * This is lazy-loaded to avoid blocking initial page load
 */
async function loadOpenSCAD(): Promise<OpenSCADModule> {
  if (openscadModule) {
    return openscadModule
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    // Dynamic import to enable code splitting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const OpenSCAD = (await import('openscad-wasm')) as any

    // Initialize with noInitialRun to prevent auto-execution
    // The module exports a factory function directly
    const factory = OpenSCAD.default || OpenSCAD
    const instance = await factory({
      noInitialRun: true,
      print: (text: string) => console.log('[OpenSCAD]', text),
      printErr: (text: string) => console.error('[OpenSCAD Error]', text),
    })

    openscadModule = instance as OpenSCADModule
    return openscadModule
  })()

  return loadPromise
}

/**
 * Render OpenSCAD code to STL
 */
export async function renderOpenSCAD(code: string): Promise<RenderResult> {
  const logs: string[] = []

  try {
    const module = await loadOpenSCAD()

    // Write the OpenSCAD code to virtual filesystem
    const inputFile = '/input.scad'
    const outputFile = '/output.stl'

    module.FS.writeFile(inputFile, code)

    // Run OpenSCAD with arguments
    // --enable=manifold for faster rendering
    // -o output.stl for STL output
    const exitCode = module.callMain(['-o', outputFile, '--enable=manifold', inputFile])

    if (exitCode !== 0) {
      return {
        stl: new Uint8Array(),
        logs,
        success: false,
        error: `OpenSCAD exited with code ${exitCode}`,
      }
    }

    // Read the output STL file
    const stl = module.FS.readFile(outputFile)

    // Cleanup
    try {
      module.FS.unlink(inputFile)
      module.FS.unlink(outputFile)
    } catch {
      // Ignore cleanup errors
    }

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
  return openscadModule !== null
}

/**
 * Preload OpenSCAD WASM module
 * Call this when user navigates to enclosure stage to start loading
 */
export async function preloadOpenSCAD(): Promise<void> {
  await loadOpenSCAD()
}
