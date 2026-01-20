/**
 * Quick test script to merge real KiCad-exported Gerbers
 * Run with: npx tsx scripts/test-gerber-merge.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mergeGerbers, calculateBoardOutlineFromContent, GerberBlock } from '../src/services/gerber-merge'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_GERBERS = join(__dirname, '../test-gerbers')
const OUTPUT_DIR = join(__dirname, '../test-gerbers/merged')

// Load a block's Gerber files
function loadBlock(name: string, dir: string, gridX: number, gridY: number): GerberBlock {
  const read = (file: string) => {
    try {
      return readFileSync(join(dir, file), 'utf-8')
    } catch {
      return undefined
    }
  }

  // KiCad naming convention
  const prefix = name

  return {
    name,
    gridX,
    gridY,
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
    }
  }
}

async function main() {
  console.log('Loading blocks...')

  // Load the battery connector at grid (0,0)
  const battery = loadBlock(
    '1x1-jst-ph-battery-connector',
    TEST_GERBERS,
    0, 0
  )

  // Load ESP32 at grid (0,1) - VERTICAL stacking so bus connectors line up
  const esp32 = loadBlock(
    'ESP32',
    join(TEST_GERBERS, 'esp32'),
    0, 1  // Stack vertically, not horizontally
  )

  console.log(`Battery block layers: ${Object.keys(battery.layers).filter(k => battery.layers[k as keyof typeof battery.layers]).join(', ')}`)
  console.log(`ESP32 block layers: ${Object.keys(esp32.layers).filter(k => esp32.layers[k as keyof typeof esp32.layers]).join(', ')}`)

  // Debug: check coordinate ranges
  const batteryXs = [...battery.layers.topCopper!.matchAll(/X(-?\d+)/g)].map(m => parseInt(m[1]))
  const esp32Xs = [...esp32.layers.topCopper!.matchAll(/X(-?\d+)/g)].map(m => parseInt(m[1]))
  console.log(`\nBattery X range: ${Math.min(...batteryXs)/1e6}mm to ${Math.max(...batteryXs)/1e6}mm`)
  console.log(`ESP32 X range: ${Math.min(...esp32Xs)/1e6}mm to ${Math.max(...esp32Xs)/1e6}mm`)

  console.log('\nMerging Gerbers...')
  const merged = mergeGerbers([battery, esp32])

  // Calculate board outline from actual content bounds
  const outline = calculateBoardOutlineFromContent(merged.topCopper)
  console.log(`Board size: ${outline.width}mm x ${outline.height}mm`)

  // Write output files
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const files = [
    { name: 'merged-F_Cu.gtl', content: merged.topCopper },
    { name: 'merged-In1_Cu.g1', content: merged.innerCopper1 },
    { name: 'merged-In2_Cu.g2', content: merged.innerCopper2 },
    { name: 'merged-B_Cu.gbl', content: merged.bottomCopper },
    { name: 'merged-F_Silkscreen.gto', content: merged.topSilk },
    { name: 'merged-B_Silkscreen.gbo', content: merged.bottomSilk },
    { name: 'merged-F_Mask.gts', content: merged.topMask },
    { name: 'merged-B_Mask.gbs', content: merged.bottomMask },
    { name: 'merged-Edge_Cuts.gm1', content: outline.gerber }, // Use calculated outline
    { name: 'merged.drl', content: merged.drill },
  ]

  for (const { name, content } of files) {
    if (content) {
      writeFileSync(join(OUTPUT_DIR, name), content)
      console.log(`  Wrote ${name} (${content.length} bytes)`)
    } else {
      console.log(`  Skipped ${name} (no content)`)
    }
  }

  console.log('\nDone! Output in:', OUTPUT_DIR)
  console.log('You can view these in a Gerber viewer like https://tracespace.io/view/')
}

main().catch(console.error)
