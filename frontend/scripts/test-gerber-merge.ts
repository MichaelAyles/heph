/**
 * Test script for Gerber merger - Full Board Layout
 *
 * Loads gerber files from kicad_seed_data/templates and merges them
 * into a unified board layout for verification.
 *
 * Run with: cd frontend && npx tsx scripts/test-gerber-merge.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync, spawn } from 'child_process'
import {
  mergeGerbers,
  parseBoardDimensionsFromEdgeCuts,
  generateBoardOutlineGerber,
  type GerberBlock,
  type MergedGerbers,
} from '../src/services/gerber-merge'
import { calculatePanelLayout, mergeIntoPanelGerbers } from '../src/services/panel-merge'
import type { RemoteBoard } from '../src/db/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '../../kicad_seed_data/templates')
const OUTPUT_DIR = join(__dirname, '../test-output')
const GERBV_PATH = join(__dirname, '../../gerbv/gerbv.exe')

const GRID_SIZE_MM = 12.7

// Parse CLI args
const args = process.argv.slice(2)
const EXPORT_PNG = args.includes('--png')
const OPEN_GERBV = args.includes('--open') || (!EXPORT_PNG && existsSync(GERBV_PATH))

// =============================================================================
// Block Configuration
// =============================================================================

interface BlockConfig {
  name: string
  gerberDir: string
  gerberPrefix: string
  gridX: number
  gridY: number
  gridWidth: number
  gridHeight: number
}

const MAIN_BOARD_BLOCKS: BlockConfig[] = [
  {
    name: 'usbc',
    gerberDir: join(TEMPLATES_DIR, '2x1-usbc-power/gerbers'),
    gerberPrefix: '2x1-usbc-power',
    gridX: 0,
    gridY: 0,
    gridWidth: 2,
    gridHeight: 1,
  },
  {
    name: 'battery',
    gerberDir: join(TEMPLATES_DIR, '1x1-jst-ph-battery-connector/gerbers'),
    gerberPrefix: '1x1-jst-ph-battery-connector',
    gridX: 0,
    gridY: 1,
    gridWidth: 1,
    gridHeight: 1,
  },
  {
    name: 'io',
    gerberDir: join(TEMPLATES_DIR, '1x1-io-block/gerbers'),
    gerberPrefix: '1x1-io-block',
    gridX: 1,
    gridY: 1,
    gridWidth: 1,
    gridHeight: 1,
  },
  {
    name: 'esp32',
    gerberDir: join(TEMPLATES_DIR, '2x2-ESP32-C6-MCU/ESP32/gerbers'),
    gerberPrefix: 'ESP32',
    gridX: 0,
    gridY: 2,
    gridWidth: 2,
    gridHeight: 2,
  },
]

const REMOTE_BOARD_CONFIG: BlockConfig = {
  name: 'remote-4ch-io',
  gerberDir: join(TEMPLATES_DIR, 'remote-4ch-io-block/gerbers'),
  gerberPrefix: 'remote-4ch-io-block',
  gridX: 0,
  gridY: 0,
  gridWidth: 2,
  gridHeight: 1,
}

// =============================================================================
// Helper Functions
// =============================================================================

function loadBlock(config: BlockConfig): GerberBlock {
  const read = (file: string) => {
    const fullPath = join(config.gerberDir, file)
    try {
      return readFileSync(fullPath, 'utf-8')
    } catch {
      return undefined
    }
  }

  const prefix = config.gerberPrefix

  return {
    name: config.name,
    gridX: config.gridX,
    gridY: config.gridY,
    layers: {
      topCopper: read(`${prefix}-F_Cu.gtl`),
      innerCopper1: read(`${prefix}-In1_Cu.g1`),
      innerCopper2: read(`${prefix}-In2_Cu.g2`),
      bottomCopper: read(`${prefix}-B_Cu.gbl`),
      topSilk: read(`${prefix}-F_Silkscreen.gto`),
      bottomSilk: read(`${prefix}-B_Silkscreen.gbo`),
      topMask: read(`${prefix}-F_Mask.gts`),
      bottomMask: read(`${prefix}-B_Mask.gbs`),
      edgeCuts: read(`${prefix}-Edge_Cuts.gm1`),
      drill: read(`${prefix}.drl`),
    },
  }
}

function countLayers(block: GerberBlock): number {
  return Object.values(block.layers).filter(Boolean).length
}

function writeOutput(filename: string, content: string): void {
  writeFileSync(join(OUTPUT_DIR, filename), content)
  console.log(`  Written: ${filename} (${content.length} bytes)`)
}

function getLayerExtension(layerKey: string): string {
  const ext: Record<string, string> = {
    topCopper: '-F_Cu.gtl',
    innerCopper1: '-In1_Cu.g1',
    innerCopper2: '-In2_Cu.g2',
    bottomCopper: '-B_Cu.gbl',
    topSilk: '-F_Silkscreen.gto',
    bottomSilk: '-B_Silkscreen.gbo',
    topMask: '-F_Mask.gts',
    bottomMask: '-B_Mask.gbs',
    edgeCuts: '-Edge_Cuts.gm1',
    drill: '.drl',
    vScore: '-VScore.gbr',
  }
  return ext[layerKey] || `.${layerKey}`
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('PHAESTUS Gerber Merger - Full Board Test')
  console.log('='.repeat(60))

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true })
  console.log(`\nOutput directory: ${OUTPUT_DIR}\n`)

  // =========================================================================
  // Step 1: Load main board blocks
  // =========================================================================
  console.log('[Step 1] Loading main board blocks...\n')

  const mainBoardBlocks: GerberBlock[] = []

  for (const config of MAIN_BOARD_BLOCKS) {
    console.log(`  Loading: ${config.name}`)
    console.log(`    Path: ${config.gerberDir}`)
    console.log(
      `    Grid: (${config.gridX}, ${config.gridY}) - ${config.gridWidth}x${config.gridHeight}`
    )

    if (!existsSync(config.gerberDir)) {
      console.log(`    ERROR: Directory not found, skipping`)
      continue
    }

    const block = loadBlock(config)
    const layerCount = countLayers(block)

    if (layerCount === 0) {
      console.log(`    ERROR: No gerber layers found, skipping`)
      continue
    }

    mainBoardBlocks.push(block)
    console.log(`    Loaded ${layerCount} layers`)
  }

  if (mainBoardBlocks.length === 0) {
    console.error('\nERROR: No blocks loaded!')
    process.exit(1)
  }

  console.log(`\nLoaded ${mainBoardBlocks.length} blocks for main board`)

  // =========================================================================
  // Step 2: Merge main board gerbers
  // =========================================================================
  console.log('\n[Step 2] Merging main board gerbers...\n')

  const merged = mergeGerbers(mainBoardBlocks)

  // =========================================================================
  // Step 3: Calculate board outline with 1mm margin
  // =========================================================================
  console.log('[Step 3] Calculating board outline...\n')

  // Calculate main board size from grid layout (not content bounds)
  // Main board is 2 cols × 4 rows = 25.4mm × 50.8mm
  const mainBoardGridWidth = 2
  const mainBoardGridHeight = 4
  const mainBoardBaseWidth = mainBoardGridWidth * GRID_SIZE_MM // 25.4mm
  const mainBoardBaseHeight = mainBoardGridHeight * GRID_SIZE_MM // 50.8mm
  const marginMM = 1.0

  const outline = generateBoardOutlineGerber(mainBoardBaseWidth, mainBoardBaseHeight, marginMM)
  console.log(`  Board dimensions: ${outline.width.toFixed(2)}mm x ${outline.height.toFixed(2)}mm`)
  console.log(
    `    (Grid: ${mainBoardGridWidth}x${mainBoardGridHeight} = ${mainBoardBaseWidth}mm x ${mainBoardBaseHeight}mm + ${marginMM * 2}mm margin)`
  )

  // Replace edge cuts with calculated outline
  merged.edgeCuts = outline.gerber

  // =========================================================================
  // Step 4: Write main board outputs
  // =========================================================================
  console.log('\n[Step 4] Writing main board outputs...\n')

  const layerKeys: (keyof MergedGerbers)[] = [
    'topCopper',
    'innerCopper1',
    'innerCopper2',
    'bottomCopper',
    'topSilk',
    'bottomSilk',
    'topMask',
    'bottomMask',
    'edgeCuts',
    'drill',
  ]

  for (const key of layerKeys) {
    if (merged[key]) {
      writeOutput(`main-board${getLayerExtension(key)}`, merged[key])
    }
  }

  // =========================================================================
  // Step 5: Load remote board
  // =========================================================================
  console.log('\n[Step 5] Loading remote board...\n')

  if (!existsSync(REMOTE_BOARD_CONFIG.gerberDir)) {
    console.log('  Remote board gerbers not found, skipping panelization')
  } else {
    const remoteBlock = loadBlock(REMOTE_BOARD_CONFIG)
    const remoteLayerCount = countLayers(remoteBlock)

    console.log(`  Loaded ${remoteLayerCount} layers for remote board`)

    if (remoteLayerCount > 0) {
      // Merge remote board (single block at origin)
      const remoteMerged = mergeGerbers([{ ...remoteBlock, gridX: 0, gridY: 0 }])

      // Parse actual board dimensions from edge cuts
      const edgeCutsDims = parseBoardDimensionsFromEdgeCuts(remoteBlock.layers.edgeCuts || '')
      console.log(
        `  Remote board edge cuts: ${edgeCutsDims.width.toFixed(2)}mm x ${edgeCutsDims.height.toFixed(2)}mm`
      )

      // Generate outline with 1mm margin (for edge cut gerber only)
      const remoteOutline = generateBoardOutlineGerber(
        edgeCutsDims.width,
        edgeCutsDims.height,
        marginMM
      )
      remoteMerged.edgeCuts = remoteOutline.gerber
      console.log(
        `  Remote board with margin: ${remoteOutline.width.toFixed(2)}mm x ${remoteOutline.height.toFixed(2)}mm`
      )
      console.log(
        `  Remote board ACTUAL size (for routing): ${edgeCutsDims.width.toFixed(2)}mm x ${edgeCutsDims.height.toFixed(2)}mm`
      )

      // =====================================================================
      // Step 6: Create panel layout
      // =====================================================================
      console.log('\n[Step 6] Creating panel layout...\n')

      // Use ACTUAL board dimensions (without margin) for panel layout
      // The margin is for manufacturing tolerance, not board sizing
      const mainBoardSize = {
        width: mainBoardBaseWidth, // 25.4mm (actual grid size)
        height: mainBoardBaseHeight, // 50.8mm (actual grid size)
      }

      // Use actual remote board dimensions from edge cuts (NOT with margin)
      const remoteBoard: RemoteBoard = {
        id: 'remote-io',
        name: '4ch IO Remote',
        slug: 'remote-4ch-io',
        type: 'connector',
        placedBlocks: [],
        boardSize: {
          width: edgeCutsDims.width, // 10mm (actual board)
          height: edgeCutsDims.height, // 50mm (actual board)
          unit: 'mm',
        },
        connectionMapping: [],
        gridWidth: REMOTE_BOARD_CONFIG.gridWidth,
        gridHeight: REMOTE_BOARD_CONFIG.gridHeight,
      }

      console.log(`\n  Height comparison (actual board sizes):`)
      console.log(`    Main board:   ${mainBoardSize.height.toFixed(2)}mm`)
      console.log(`    Remote board: ${remoteBoard.boardSize.height.toFixed(2)}mm`)
      console.log(
        `    Difference:   ${(mainBoardSize.height - remoteBoard.boardSize.height).toFixed(2)}mm`
      )

      const panelConfig = calculatePanelLayout(mainBoardSize, [remoteBoard])

      console.log(
        `  Panel size: ${panelConfig.panelSize.width.toFixed(1)}mm x ${panelConfig.panelSize.height.toFixed(1)}mm`
      )
      console.log(
        `  Main board at: (${panelConfig.mainBoardPosition.x}, ${panelConfig.mainBoardPosition.y})`
      )
      console.log(`  Remote boards: ${panelConfig.remoteBoards.length}`)
      console.log(`  V-score lines: ${panelConfig.vScoreLines.length}`)
      console.log(`  Routed edges: ${panelConfig.routedEdges?.length ?? 0}`)

      // =====================================================================
      // Step 7: Merge into panel gerbers
      // =====================================================================
      console.log('\n[Step 7] Merging panel gerbers...\n')

      const panelGerbers = await mergeIntoPanelGerbers(
        merged,
        [{ board: remoteBoard, gerbers: remoteMerged }],
        panelConfig
      )

      // =====================================================================
      // Step 8: Write panel outputs
      // =====================================================================
      console.log('[Step 8] Writing panel outputs...\n')

      for (const key of layerKeys) {
        if (panelGerbers[key]) {
          writeOutput(`panel${getLayerExtension(key)}`, panelGerbers[key])
        }
      }

      writeOutput('panel-VScore.gbr', panelGerbers.vScore)
      if (panelGerbers.routedEdges) {
        writeOutput('panel-RoutedEdges.gbr', panelGerbers.routedEdges)
      }
      writeOutput('panel-config.json', JSON.stringify(panelConfig, null, 2))
    }
  }

  // =========================================================================
  // Step 9: Write README
  // =========================================================================
  console.log('\n[Step 9] Writing README...\n')

  const readme = `# Gerber Merge Test Output

Generated by PHAESTUS Gerber Merger.

## Main Board

**Dimensions:** ${outline.width.toFixed(2)}mm x ${outline.height.toFixed(2)}mm

**Grid Layout (12.7mm grid):**
\`\`\`
+----------+----------+
|   USB-C Power 2x1   |  Row 0
| (0,0)         (1,0) |
+----------+----------+
| Battery  |    IO    |  Row 1
|  (0,1)   |  (1,1)   |
+----------+----------+
|  ESP32   |  ESP32   |  Row 2
|  (0,2)   |  (1,2)   |
+----------+----------+
|  ESP32   |  ESP32   |  Row 3
|  (0,3)   |  (1,3)   |
+----------+----------+
\`\`\`

## Files

### Main Board
- main-board-F_Cu.gtl - Top copper
- main-board-In1_Cu.g1 - Inner 1
- main-board-In2_Cu.g2 - Inner 2
- main-board-B_Cu.gbl - Bottom copper
- main-board-F_Silkscreen.gto - Top silk
- main-board-B_Silkscreen.gbo - Bottom silk
- main-board-F_Mask.gts - Top mask
- main-board-B_Mask.gbs - Bottom mask
- main-board-Edge_Cuts.gm1 - Outline
- main-board.drl - Drill

### Panel
- panel-*.g* - Panel gerbers
- panel-VScore.gbr - V-score lines (continuous, for board separation)
- panel-RoutedEdges.gbr - Routed edges (for shorter boards' top edges)
- panel-config.json - Layout config

## Verification

View files at: https://tracespace.io/view/
`

  writeOutput('README.md', readme)

  // =========================================================================
  // Step 10: Open in gerbv or export PNG
  // =========================================================================

  // Collect panel gerber files for viewing (or main board if no panel)
  const gerberFiles = [
    join(OUTPUT_DIR, 'panel-F_Cu.gtl'),
    join(OUTPUT_DIR, 'panel-In1_Cu.g1'),
    join(OUTPUT_DIR, 'panel-In2_Cu.g2'),
    join(OUTPUT_DIR, 'panel-B_Cu.gbl'),
    join(OUTPUT_DIR, 'panel-F_Silkscreen.gto'),
    join(OUTPUT_DIR, 'panel-F_Mask.gts'),
    join(OUTPUT_DIR, 'panel-B_Mask.gbs'),
    join(OUTPUT_DIR, 'panel-Edge_Cuts.gm1'),
    join(OUTPUT_DIR, 'panel-VScore.gbr'),
    join(OUTPUT_DIR, 'panel-RoutedEdges.gbr'),
  ].filter(existsSync)

  if (EXPORT_PNG && existsSync(GERBV_PATH)) {
    console.log('\n[Step 10] Exporting PNG preview...\n')
    const pngPath = join(OUTPUT_DIR, 'panel-preview.png')
    try {
      // Export PNG with gerbv - copper layers only for cleaner preview
      const copperFiles = [
        join(OUTPUT_DIR, 'panel-F_Cu.gtl'),
        join(OUTPUT_DIR, 'panel-Edge_Cuts.gm1'),
        join(OUTPUT_DIR, 'panel-VScore.gbr'),
      ].filter(existsSync)

      execSync(
        `"${GERBV_PATH}" --export=png --dpi=300 --antialias --background=#000000 -o "${pngPath}" ${copperFiles.map((f) => `"${f}"`).join(' ')}`,
        {
          stdio: 'inherit',
        }
      )
      console.log(`  Exported: ${pngPath}`)
    } catch (error) {
      console.error('  Failed to export PNG:', error)
    }
  } else if (OPEN_GERBV && existsSync(GERBV_PATH)) {
    console.log('\n[Step 10] Opening in gerbv...\n')
    try {
      // Open gerbv with all panel layers
      const gerbvProcess = spawn(GERBV_PATH, gerberFiles, {
        detached: true,
        stdio: 'ignore',
      })
      gerbvProcess.unref()
      console.log(`  Opened gerbv with ${gerberFiles.length} layers`)
    } catch (error) {
      console.error('  Failed to open gerbv:', error)
    }
  }

  // =========================================================================
  // Done
  // =========================================================================
  console.log('\n' + '='.repeat(60))
  console.log('COMPLETE')
  console.log('='.repeat(60))
  console.log(`\nOutput: ${OUTPUT_DIR}`)
  if (!OPEN_GERBV && !EXPORT_PNG) {
    console.log('View at: https://tracespace.io/view/')
    console.log('\nTip: Run with --open to launch gerbv, or --png to export preview')
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
