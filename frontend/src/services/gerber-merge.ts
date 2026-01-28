/**
 * Gerber merger for PHAESTUS - merges pre-exported Gerber files from KiCad blocks
 *
 * Handles real KiCad-generated Gerbers with X2 extensions and absolute coordinates.
 * Normalizes each block to origin, then offsets by grid position.
 */

export interface GerberBlock {
  name: string
  gridX: number // grid position (0, 1, 2...)
  gridY: number
  layers: {
    topCopper?: string // .gtl (F.Cu)
    innerCopper1?: string // .g1 (In1.Cu)
    innerCopper2?: string // .g2 (In2.Cu)
    bottomCopper?: string // .gbl (B.Cu)
    topSilk?: string // .gto (F.Silkscreen)
    bottomSilk?: string // .gbo (B.Silkscreen)
    topMask?: string // .gts (F.Mask)
    bottomMask?: string // .gbs (B.Mask)
    edgeCuts?: string // .gm1 (Edge.Cuts)
    drill?: string // .drl (Excellon)
  }
}

export interface MergedGerbers {
  topCopper: string
  innerCopper1: string
  innerCopper2: string
  bottomCopper: string
  topSilk: string
  bottomSilk: string
  topMask: string
  bottomMask: string
  edgeCuts: string
  drill: string
}

const GRID_SIZE_MM = 12.7
// Vertical overlap for bus connector merging - blocks overlap by 1mm vertically
// This ensures the bus connector pads merge perfectly when stacked
const VERTICAL_OVERLAP_MM = 1.0

/**
 * Find bounding box of coordinates in Gerber content
 * Returns min X and Y values to use as origin offset
 * Only considers actual coordinate commands (X...Y...D0[123]*)
 */
function findGerberBounds(content: string): { minX: number; minY: number } {
  let minX = Infinity
  let minY = Infinity

  // Match coordinate commands: X{num}Y{num}D{01|02|03}*
  // This avoids matching X/Y values inside aperture definitions
  const coordRegex = /X(-?\d+)Y(-?\d+)D0[123]\*/g
  let match
  while ((match = coordRegex.exec(content)) !== null) {
    const x = parseInt(match[1])
    const y = parseInt(match[2])
    if (x < minX) minX = x
    if (y < minY) minY = y
  }

  // Also match standalone X or Y updates (some Gerbers use partial coords)
  // Look for lines that are just coordinates without aperture defs
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip aperture definitions and macros
    if (trimmed.startsWith('%')) continue
    if (trimmed.startsWith('G04')) continue

    // Match coordinate-only lines
    const xMatch = trimmed.match(/^X(-?\d+)(?:Y(-?\d+))?D0[123]\*$/)
    if (xMatch) {
      const x = parseInt(xMatch[1])
      if (x < minX) minX = x
      if (xMatch[2]) {
        const y = parseInt(xMatch[2])
        if (y < minY) minY = y
      }
    }
  }

  return {
    minX: minX === Infinity ? 0 : minX,
    minY: minY === Infinity ? 0 : minY,
  }
}

/**
 * Find bounding box in Excellon drill file (decimal mm format)
 */
function findDrillBounds(content: string): { minX: number; minY: number } {
  let minX = Infinity
  let minY = Infinity

  // Excellon uses decimal format: X110.15Y-66.65
  const matches = content.matchAll(/X(-?\d+\.?\d*)Y(-?\d+\.?\d*)/g)

  for (const match of matches) {
    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    if (x < minX) minX = x
    if (y < minY) minY = y
  }

  return {
    minX: minX === Infinity ? 0 : minX,
    minY: minY === Infinity ? 0 : minY,
  }
}

/**
 * Transform Gerber coordinates: normalize to origin then offset by grid
 * Only transforms coordinate commands, not aperture definitions
 *
 * Note: gridY is inverted so that gridY=0 appears at the BOTTOM of the board
 * (highest Y in Gerber coords). This matches the visual expectation that
 * blocks added first (gridY=0) are at the bottom of the stack.
 */
function transformGerberCoords(
  content: string,
  originX: number,
  originY: number,
  gridX: number,
  gridY: number,
  maxGridY: number
): string {
  // Grid offset in Gerber units (mm * 1,000,000 for 6 decimal places)
  // Y offset uses reduced spacing (GRID_SIZE_MM - VERTICAL_OVERLAP_MM) for bus connector merging
  // Invert gridY so that gridY=0 is at the bottom (highest Y offset)
  const invertedGridY = maxGridY - gridY
  const gridOffsetX = Math.round(gridX * GRID_SIZE_MM * 1000000)
  const gridOffsetY = Math.round(invertedGridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM) * 1000000)

  // Process line by line to avoid transforming aperture definitions
  const lines = content.split('\n')
  const transformed = lines.map((line) => {
    const trimmed = line.trim()

    // Skip aperture definitions, macros, comments
    if (trimmed.startsWith('%')) return line
    if (trimmed.startsWith('G04')) return line
    if (trimmed === '') return line

    // Transform coordinates in this line
    let result = line.replace(/X(-?\d+)/g, (_, x) => {
      const normalized = parseInt(x) - originX + gridOffsetX
      return `X${normalized}`
    })

    result = result.replace(/Y(-?\d+)/g, (_, y) => {
      const normalized = parseInt(y) - originY + gridOffsetY
      return `Y${normalized}`
    })

    return result
  })

  return transformed.join('\n')
}

/**
 * Transform Excellon drill coordinates (decimal mm format)
 */
function transformDrillCoords(
  content: string,
  originX: number,
  originY: number,
  gridX: number,
  gridY: number,
  maxGridY: number
): string {
  // Y offset uses reduced spacing for bus connector merging
  // Invert gridY so that gridY=0 is at the bottom (highest Y offset)
  const invertedGridY = maxGridY - gridY
  const gridOffsetX = gridX * GRID_SIZE_MM
  const gridOffsetY = invertedGridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)

  return content.replace(/X(-?\d+\.?\d*)Y(-?\d+\.?\d*)/g, (_, x, y) => {
    const newX = (parseFloat(x) - originX + gridOffsetX).toFixed(4)
    const newY = (parseFloat(y) - originY + gridOffsetY).toFixed(4)
    return `X${newX}Y${newY}`
  })
}

/**
 * Parse aperture definitions including macros
 */
interface ApertureInfo {
  definition: string // Full definition line(s)
  isMacro: boolean
}

function parseApertures(content: string): Map<number, ApertureInfo> {
  const apertures = new Map<number, ApertureInfo>()

  // Match simple apertures: %ADD{n}{shape},{params}*%
  const simpleRegex = /%ADD(\d+)([^*]+)\*%/g
  let match
  while ((match = simpleRegex.exec(content)) !== null) {
    const dcode = parseInt(match[1])
    apertures.set(dcode, {
      definition: match[2],
      isMacro: false,
    })
  }

  return apertures
}

/**
 * Extract aperture macros from Gerber content
 * Macros start with %AM and end with % (the content inside ends with *)
 * Example: %AMRoundRect*\n0 comment*\n4,1,4,...*%
 */
function extractMacros(content: string): string[] {
  const macros: string[] = []
  // Match %AM followed by anything until closing %
  // The macro content ends with * before the closing %
  const regex = /%AM[^%]+%/g
  let match
  while ((match = regex.exec(content)) !== null) {
    macros.push(match[0])
  }
  return macros
}

/**
 * Extract body content (drawing commands) from Gerber
 * Strips header, attributes, macros, and end marker
 */
function extractGerberBody(content: string): string {
  const lines = content.split('\n')
  const bodyLines: string[] = []
  let inMacro = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Track multi-line macro definitions (start with %AM, end with *%)
    if (trimmed.startsWith('%AM')) {
      // Check if it's a single-line macro that also ends with *%
      if (!trimmed.endsWith('*%')) {
        inMacro = true
      }
      continue
    }
    if (inMacro) {
      if (trimmed.endsWith('*%')) {
        inMacro = false
      }
      continue
    }

    // Skip header/metadata
    if (trimmed.startsWith('%TF.')) continue // File attributes
    if (trimmed.startsWith('%TA.')) continue // Aperture attributes
    if (trimmed.startsWith('%TD')) continue // Delete attributes
    if (trimmed.startsWith('%TO.')) continue // Object attributes
    if (trimmed.startsWith('%MO')) continue // Units
    if (trimmed.startsWith('%FS')) continue // Format spec
    if (trimmed.startsWith('%LP')) continue // Layer polarity
    if (trimmed.startsWith('%ADD')) continue // Aperture definitions
    if (trimmed.startsWith('G04')) continue // Comments
    if (trimmed === 'M02*') continue // End of file
    if (trimmed === '') continue

    // Skip macro body lines (start with number or comment indicator)
    if (/^[0-9]/.test(trimmed)) continue // Macro primitive lines
    if (trimmed.startsWith('0 ')) continue // Macro comments

    bodyLines.push(trimmed)
  }

  return bodyLines.join('\n')
}

/**
 * Renumber aperture selections in body content
 */
function renumberApertureSelections(body: string, offset: number): string {
  // D{n}* where n > 3 (D01, D02, D03 are commands)
  return body.replace(/D(\d+)\*/g, (match, d) => {
    const num = parseInt(d)
    if (num <= 3) return match
    return `D${num + offset}*`
  })
}

/**
 * Parse Excellon drill tools
 */
function parseDrillTools(content: string): Map<number, string> {
  const tools = new Map<number, string>()
  // T{n}C{diameter}
  const regex = /^T(\d+)(C[\d.]+)/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    tools.set(parseInt(match[1]), match[2])
  }
  return tools
}

/**
 * Extract drill body (tool selections and hits)
 */
function extractDrillBody(content: string): string {
  const lines = content.split('\n')
  const bodyLines: string[] = []
  let inBody = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '%') {
      inBody = true
      continue
    }

    if (!inBody) continue
    if (trimmed === 'M30') continue
    if (trimmed === '') continue
    if (trimmed.startsWith(';')) continue
    if (trimmed.startsWith('G')) continue

    bodyLines.push(trimmed)
  }

  return bodyLines.join('\n')
}

/**
 * Renumber tool selections in drill body
 */
function renumberToolSelections(body: string, offset: number): string {
  return body.replace(/^T(\d+)$/gm, (_, t) => `T${parseInt(t) + offset}`)
}

/**
 * Calculate unified bounds for a block using edge cuts (board outline)
 * This ensures all layers use the same origin for proper grid alignment
 *
 * IMPORTANT: Uses edge cuts for alignment because:
 * - Edge cuts define the physical board boundary on the 12.7mm grid
 * - All KiCad blocks are designed with edge cuts at grid boundaries
 * - Copper content can vary in position within the board
 * - Silkscreen can overhang board edges
 *
 * Falls back to copper layers only if edge cuts aren't available.
 */
function findUnifiedBounds(block: GerberBlock): { minX: number; minY: number } {
  // Prefer edge cuts - defines the physical board boundary on the grid
  const edgeCuts = block.layers.edgeCuts
  if (edgeCuts) {
    const bounds = findGerberBounds(edgeCuts)
    const hasCoords = /X-?\d+Y-?\d+D0[123]\*/.test(edgeCuts)
    if (hasCoords && (bounds.minX !== 0 || bounds.minY !== 0)) {
      return bounds
    }
  }

  // Fallback: use copper layers (for blocks without edge cuts)
  let minX = Infinity
  let minY = Infinity

  const copperLayers: (keyof GerberBlock['layers'])[] = [
    'topCopper',
    'innerCopper1',
    'innerCopper2',
    'bottomCopper',
  ]

  for (const layerKey of copperLayers) {
    const content = block.layers[layerKey]
    if (!content) continue

    const bounds = findGerberBounds(content)
    if (bounds.minX !== 0 || bounds.minY !== 0) {
      const hasCoords = /X-?\d+Y-?\d+D0[123]\*/.test(content)
      if (hasCoords) {
        if (bounds.minX < minX) minX = bounds.minX
        if (bounds.minY < minY) minY = bounds.minY
      }
    }
  }

  return {
    minX: minX === Infinity ? 0 : minX,
    minY: minY === Infinity ? 0 : minY,
  }
}

/**
 * Pre-calculate unified bounds for all blocks
 */
function calculateAllBlockBounds(
  blocks: GerberBlock[]
): Map<string, { minX: number; minY: number }> {
  const boundsMap = new Map<string, { minX: number; minY: number }>()
  for (const block of blocks) {
    boundsMap.set(block.name, findUnifiedBounds(block))
  }
  return boundsMap
}

/**
 * Merge a single Gerber layer from multiple blocks
 */
function mergeLayer(
  blocks: GerberBlock[],
  layerKey: keyof GerberBlock['layers'],
  blockBounds?: Map<string, { minX: number; minY: number }>
): string {
  if (layerKey === 'drill') {
    return mergeDrill(blocks, blockBounds)
  }

  // Calculate max gridY for Y-axis inversion
  const maxGridY = Math.max(...blocks.map((b) => b.gridY))

  const allMacros = new Set<string>()
  const allApertures = new Map<number, string>()
  const bodies: string[] = []
  let apertureOffset = 0

  for (const block of blocks) {
    const content = block.layers[layerKey]
    if (!content) continue

    // Use unified bounds if provided, otherwise calculate from this layer
    const bounds = blockBounds?.get(block.name) ?? findGerberBounds(content)

    // Extract macros (deduplicate by content)
    const macros = extractMacros(content)
    macros.forEach((m) => allMacros.add(m))

    // Extract apertures with offset
    const apertures = parseApertures(content)
    let maxDcode = 9
    for (const [dcode, info] of apertures) {
      allApertures.set(dcode + apertureOffset, info.definition)
      if (dcode + apertureOffset > maxDcode) maxDcode = dcode + apertureOffset
    }

    // Extract and transform body
    let body = extractGerberBody(content)
    body = transformGerberCoords(body, bounds.minX, bounds.minY, block.gridX, block.gridY, maxGridY)
    body = renumberApertureSelections(body, apertureOffset)

    if (body.trim()) {
      bodies.push(`G04 Block: ${block.name}*\n${body}`)
    }

    apertureOffset = maxDcode + 1
  }

  if (bodies.length === 0) return ''

  // Build merged Gerber
  const header = ['G04 Merged by PHAESTUS*', '%MOMM*%', '%FSLAX46Y46*%', '%LPD*%']

  // Add macros
  for (const macro of allMacros) {
    header.push(macro)
  }

  // Add apertures
  for (const [dcode, def] of allApertures) {
    header.push(`%ADD${dcode}${def}*%`)
  }

  header.push('G04 APERTURE END LIST*')

  return `${header.join('\n')}\n${bodies.join('\n')}\nM02*`
}

/**
 * Merge Excellon drill files
 */
function mergeDrill(
  blocks: GerberBlock[],
  blockBounds?: Map<string, { minX: number; minY: number }>
): string {
  // Calculate max gridY for Y-axis inversion
  const maxGridY = Math.max(...blocks.map((b) => b.gridY))

  const allTools = new Map<number, string>()
  const bodies: string[] = []
  let toolOffset = 0

  for (const block of blocks) {
    const content = block.layers.drill
    if (!content) continue

    // Use unified bounds (convert from Gerber format to drill format)
    // Gerber uses integer units (mm * 1e6), drill uses decimal mm
    const gerberBounds = blockBounds?.get(block.name)
    const bounds = gerberBounds
      ? { minX: gerberBounds.minX / 1000000, minY: gerberBounds.minY / 1000000 }
      : findDrillBounds(content)

    // Extract tools with offset
    const tools = parseDrillTools(content)
    let maxTool = 0
    for (const [num, def] of tools) {
      allTools.set(num + toolOffset, def)
      if (num + toolOffset > maxTool) maxTool = num + toolOffset
    }

    // Extract and transform body
    let body = extractDrillBody(content)
    body = transformDrillCoords(body, bounds.minX, bounds.minY, block.gridX, block.gridY, maxGridY)
    body = renumberToolSelections(body, toolOffset)

    if (body.trim()) {
      bodies.push(`; Block: ${block.name}\n${body}`)
    }

    toolOffset = maxTool + 1
  }

  if (bodies.length === 0) return ''

  // Build merged drill file
  const header = ['M48', '; Merged by PHAESTUS', 'FMAT,2', 'METRIC']

  for (const [num, def] of allTools) {
    header.push(`T${num}${def}`)
  }

  header.push('%')
  header.push('G90')
  header.push('G05')

  return `${header.join('\n')}\n${bodies.join('\n')}\nM30`
}

/**
 * Merge multiple PCB blocks into unified Gerber files
 */
export function mergeGerbers(blocks: GerberBlock[]): MergedGerbers {
  // Calculate unified bounds for each block ONCE, across all layers
  // This ensures all layers of a block use the same origin
  const blockBounds = calculateAllBlockBounds(blocks)

  return {
    topCopper: mergeLayer(blocks, 'topCopper', blockBounds),
    innerCopper1: mergeLayer(blocks, 'innerCopper1', blockBounds),
    innerCopper2: mergeLayer(blocks, 'innerCopper2', blockBounds),
    bottomCopper: mergeLayer(blocks, 'bottomCopper', blockBounds),
    topSilk: mergeLayer(blocks, 'topSilk', blockBounds),
    bottomSilk: mergeLayer(blocks, 'bottomSilk', blockBounds),
    topMask: mergeLayer(blocks, 'topMask', blockBounds),
    bottomMask: mergeLayer(blocks, 'bottomMask', blockBounds),
    edgeCuts: mergeLayer(blocks, 'edgeCuts', blockBounds),
    drill: mergeLayer(blocks, 'drill', blockBounds),
  }
}

/**
 * Calculate board outline from merged Gerber content (actual bounds)
 * Creates outline with uniform margin around all content
 */
export function calculateBoardOutlineFromContent(
  mergedGerber: string,
  marginMM: number = 1
): {
  width: number
  height: number
  gerber: string
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = 0
  let maxY = 0

  // Find all coordinate commands
  const coordRegex = /X(-?\d+)Y(-?\d+)D0[123]\*/g
  let match
  while ((match = coordRegex.exec(mergedGerber)) !== null) {
    const x = parseInt(match[1])
    const y = parseInt(match[2])
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  // Calculate outline with exact margin around content (in Gerber units)
  const marginUnits = Math.round(marginMM * 1000000)
  const x1 = minX - marginUnits
  const y1 = minY - marginUnits
  const x2 = maxX + marginUnits
  const y2 = maxY + marginUnits

  const width = (x2 - x1) / 1000000
  const height = (y2 - y1) / 1000000

  const gerber = [
    'G04 Board outline - Merged by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    '%ADD10C,0.150000*%', // 0.15mm line width
    'D10*',
    'G01*',
    `X${x1}Y${y1}D02*`,
    `X${x2}Y${y1}D01*`,
    `X${x2}Y${y2}D01*`,
    `X${x1}Y${y2}D01*`,
    `X${x1}Y${y1}D01*`,
    'M02*',
  ].join('\n')

  return { width, height, gerber }
}

/**
 * Calculate board outline for merged blocks (grid-based, deprecated)
 */
export function calculateBoardOutline(blocks: GerberBlock[]): {
  width: number
  height: number
  gerber: string
} {
  let maxX = 0
  let maxY = 0

  for (const block of blocks) {
    maxX = Math.max(maxX, block.gridX + 1)
    maxY = Math.max(maxY, block.gridY + 1)
  }

  const width = maxX * GRID_SIZE_MM
  // Height accounts for vertical overlap: each row seam saves VERTICAL_OVERLAP_MM
  const height = maxY * GRID_SIZE_MM - (maxY - 1) * VERTICAL_OVERLAP_MM

  // Generate edge cuts Gerber (rectangle)
  const w = Math.round(width * 1000000)
  const h = Math.round(height * 1000000)

  const gerber = [
    'G04 Board outline - Merged by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    '%ADD10C,0.150000*%', // 0.15mm line width
    'D10*',
    'G01*',
    `X0Y0D02*`,
    `X${w}Y0D01*`,
    `X${w}Y${h}D01*`,
    `X0Y${h}D01*`,
    `X0Y0D01*`,
    'M02*',
  ].join('\n')

  return { width, height, gerber }
}

/**
 * Parse board dimensions from Edge Cuts gerber
 * Returns the bounding box of the board outline
 */
export function parseBoardDimensionsFromEdgeCuts(edgeCutsGerber: string): {
  width: number
  height: number
  minX: number
  minY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Find all coordinate commands in edge cuts
  const coordRegex = /X(-?\d+)Y(-?\d+)D0[123]\*/g
  let match
  while ((match = coordRegex.exec(edgeCutsGerber)) !== null) {
    const x = parseInt(match[1])
    const y = parseInt(match[2])
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  // Convert from Gerber units (usually nm or 10^-6 mm) to mm
  const width = (maxX - minX) / 1000000
  const height = (maxY - minY) / 1000000

  return {
    width: width || 0,
    height: height || 0,
    minX: minX === Infinity ? 0 : minX / 1000000,
    minY: minY === Infinity ? 0 : minY / 1000000,
  }
}

/**
 * Generate board outline gerber with margin around specified dimensions
 */
export function generateBoardOutlineGerber(
  width: number,
  height: number,
  marginMM: number = 1
): { width: number; height: number; gerber: string } {
  const totalWidth = width + marginMM * 2
  const totalHeight = height + marginMM * 2

  const w = Math.round(totalWidth * 1000000)
  const h = Math.round(totalHeight * 1000000)

  const gerber = [
    'G04 Board outline - Generated by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    '%ADD10C,0.150000*%', // 0.15mm line width
    'D10*',
    'G01*',
    `X0Y0D02*`,
    `X${w}Y0D01*`,
    `X${w}Y${h}D01*`,
    `X0Y${h}D01*`,
    `X0Y0D01*`,
    'M02*',
  ].join('\n')

  return { width: totalWidth, height: totalHeight, gerber }
}
