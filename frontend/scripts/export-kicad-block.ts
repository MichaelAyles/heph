#!/usr/bin/env npx tsx
/**
 * KiCad Block Export Script
 *
 * Exports a KiCad project to a directory ready for block import:
 * - gerbers.zip (4-layer Gerber files + drill files)
 * - {name}.kicad_pcb
 * - {name}.kicad_sch
 * - {name}.step
 *
 * Usage:
 *   pnpm export-block <path-to-kicad-project> [options]
 *
 * Options:
 *   --output    Output directory name (defaults to {slug}-export)
 *   --slug      Block slug (defaults to project name)
 *
 * Examples:
 *   pnpm export-block ../kicad_seed_data/templates/remote-4ch-io-block
 *   pnpm export-block ./my-board --slug my-block
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'

// Find KiCad CLI
function findKicadCli(): string {
  const possiblePaths = [
    'C:/Program Files/KiCad/9.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/8.0/bin/kicad-cli.exe',
    '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
    '/usr/bin/kicad-cli',
    '/usr/local/bin/kicad-cli',
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  // Try PATH
  try {
    execSync('kicad-cli --version', { stdio: 'ignore' })
    return 'kicad-cli'
  } catch {
    throw new Error(
      'KiCad CLI not found. Please install KiCad 8.0+ or add kicad-cli to PATH.'
    )
  }
}

// Parse command line arguments
function parseArgs(): {
  projectPath: string
  output: string | null
  slug: string | null
} {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
KiCad Block Export Script

Exports a KiCad project to a directory with:
  - gerbers.zip (Gerber + drill files only)
  - {name}.kicad_pcb
  - {name}.kicad_sch
  - {name}.step

Usage:
  pnpm export-block <path-to-kicad-project> [options]

Options:
  --output    Output directory name (defaults to {slug}-export)
  --slug      Block slug (defaults to project name)

Examples:
  pnpm export-block ../kicad_seed_data/templates/mcu-esp32c6
  pnpm export-block ./my-board --slug my-block --output my-export
`)
    process.exit(0)
  }

  const projectPath = args[0]
  let output: string | null = null
  let slug: string | null = null

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      output = args[++i]
    } else if (args[i] === '--slug' && args[i + 1]) {
      slug = args[++i]
    }
  }

  return { projectPath, output, slug }
}

// Find KiCad files in project directory
function findKicadFiles(projectDir: string): {
  pcb: string | null
  sch: string | null
  projectName: string
} {
  const files = fs.readdirSync(projectDir)

  const pcb = files.find((f) => f.endsWith('.kicad_pcb'))
  const sch = files.find((f) => f.endsWith('.kicad_sch'))

  if (!pcb && !sch) {
    throw new Error(`No KiCad files found in ${projectDir}`)
  }

  // Get project name from PCB or SCH file
  const projectName = (pcb || sch)!.replace(/\.kicad_(pcb|sch)$/, '')

  return {
    pcb: pcb ? path.join(projectDir, pcb) : null,
    sch: sch ? path.join(projectDir, sch) : null,
    projectName,
  }
}

// Export Gerbers to a temp directory
function exportGerbers(
  kicadCli: string,
  pcbPath: string,
  outputDir: string
): string[] {
  console.log('  Exporting Gerbers...')

  const layers = [
    'F.Cu',
    'In1.Cu',
    'In2.Cu',
    'B.Cu',
    'F.Paste',
    'B.Paste',
    'F.SilkS',
    'B.SilkS',
    'F.Mask',
    'B.Mask',
    'Edge.Cuts',
  ]

  execSync(
    `"${kicadCli}" pcb export gerbers --layers "${layers.join(',')}" -o "${outputDir}/" "${pcbPath}"`,
    { stdio: 'inherit' }
  )

  // Export drill files
  console.log('  Exporting drill files...')
  execSync(
    `"${kicadCli}" pcb export drill -o "${outputDir}/" "${pcbPath}"`,
    { stdio: 'inherit' }
  )

  // Return list of generated files
  return fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.gbr') || f.endsWith('.drl') || f.match(/\.(g[tb][lsop]|g[12m]|gm1|gbrjob|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp)$/i))
    .map((f) => path.join(outputDir, f))
}

// Export STEP
function exportStep(
  kicadCli: string,
  pcbPath: string,
  outputPath: string
): void {
  console.log('  Exporting STEP 3D model...')
  execSync(`"${kicadCli}" pcb export step -o "${outputPath}" "${pcbPath}"`, {
    stdio: 'inherit',
  })
}

// Create ZIP archive containing only gerber files
async function createGerberZip(
  outputPath: string,
  gerberFiles: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`  Created gerbers.zip (${(archive.pointer() / 1024).toFixed(1)} KB)`)
      resolve()
    })

    archive.on('error', reject)
    archive.pipe(output)

    for (const file of gerberFiles) {
      if (fs.existsSync(file)) {
        archive.file(file, { name: path.basename(file) })
      }
    }

    archive.finalize()
  })
}

// Main
async function main() {
  const { projectPath, output, slug } = parseArgs()

  // Resolve project path
  const projectDir = path.resolve(projectPath)
  if (!fs.existsSync(projectDir)) {
    console.error(`Error: Project directory not found: ${projectDir}`)
    process.exit(1)
  }

  console.log(`\nExporting KiCad project: ${projectDir}\n`)

  // Find KiCad CLI
  const kicadCli = findKicadCli()
  console.log(`Using KiCad CLI: ${kicadCli}\n`)

  // Find KiCad files
  const { pcb, sch, projectName } = findKicadFiles(projectDir)
  const blockSlug = slug || projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  console.log(`Project name: ${projectName}`)
  console.log(`Block slug: ${blockSlug}`)
  if (pcb) console.log(`PCB file: ${pcb}`)
  if (sch) console.log(`Schematic: ${sch}`)
  console.log()

  // Create output directory
  const outputDir = path.join(projectDir, output || `${blockSlug}-export`)
  if (fs.existsSync(outputDir)) {
    console.log(`Cleaning existing output directory: ${outputDir}`)
    fs.rmSync(outputDir, { recursive: true })
  }
  fs.mkdirSync(outputDir, { recursive: true })

  // Create temp directory for gerbers
  const gerberTempDir = path.join(outputDir, '_gerbers_temp')
  fs.mkdirSync(gerberTempDir, { recursive: true })

  // Export Gerbers and STEP if PCB exists
  if (pcb) {
    const gerberFiles = exportGerbers(kicadCli, pcb, gerberTempDir)

    // Create gerbers.zip from the gerber files
    const gerberZipPath = path.join(outputDir, 'gerbers.zip')
    await createGerberZip(gerberZipPath, gerberFiles)

    // Clean up temp gerber directory
    fs.rmSync(gerberTempDir, { recursive: true })

    // Export STEP
    const stepPath = path.join(outputDir, `${blockSlug}.step`)
    exportStep(kicadCli, pcb, stepPath)

    // Copy PCB file
    const pcbDest = path.join(outputDir, `${blockSlug}.kicad_pcb`)
    fs.copyFileSync(pcb, pcbDest)
    console.log(`  Copied ${path.basename(pcb)} -> ${blockSlug}.kicad_pcb`)
  }

  // Copy schematic
  if (sch) {
    const schDest = path.join(outputDir, `${blockSlug}.kicad_sch`)
    fs.copyFileSync(sch, schDest)
    console.log(`  Copied ${path.basename(sch)} -> ${blockSlug}.kicad_sch`)
  }

  // List output contents
  console.log(`\n✓ Export complete: ${outputDir}\n`)
  console.log('Contents:')
  const outputFiles = fs.readdirSync(outputDir)
  for (const f of outputFiles) {
    const stat = fs.statSync(path.join(outputDir, f))
    const size = (stat.size / 1024).toFixed(1)
    console.log(`  ${f} (${size} KB)`)
  }

  console.log(`\nUpload these files individually to the admin blocks page.`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
