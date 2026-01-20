#!/usr/bin/env npx tsx
/**
 * KiCad Block Export Script
 *
 * Exports a KiCad project to a ZIP file ready for block import:
 * - 4-layer Gerber files
 * - Drill files
 * - .kicad_pcb file
 * - .kicad_sch file
 * - .step 3D model
 *
 * Usage:
 *   pnpm export-block <path-to-kicad-project> [options]
 *
 * Options:
 *   --upload    Upload to admin/blocks after export
 *   --slug      Block slug for upload (defaults to project name)
 *   --url       API base URL (defaults to http://localhost:8788)
 *
 * Examples:
 *   pnpm export-block ../kicad_seed_data/templates/remote-4ch-io-block
 *   pnpm export-block ../kicad_seed_data/templates/remote-4ch-io-block --upload --slug remote-io
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
  upload: boolean
  slug: string | null
  url: string
} {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
KiCad Block Export Script

Usage:
  pnpm export-block <path-to-kicad-project> [options]

Options:
  --upload    Upload to admin/blocks after export
  --slug      Block slug for upload (defaults to project name)
  --url       API base URL (defaults to http://localhost:8788)

Examples:
  pnpm export-block ../kicad_seed_data/templates/remote-4ch-io-block
  pnpm export-block ./my-board --upload --slug my-block
`)
    process.exit(0)
  }

  let projectPath = args[0]
  let upload = false
  let slug: string | null = null
  let url = 'http://localhost:8788'

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--upload') {
      upload = true
    } else if (args[i] === '--slug' && args[i + 1]) {
      slug = args[++i]
    } else if (args[i] === '--url' && args[i + 1]) {
      url = args[++i]
    }
  }

  return { projectPath, upload, slug, url }
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

// Export Gerbers
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

// Create ZIP archive
async function createZip(
  outputPath: string,
  files: { source: string; name: string }[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      console.log(`\n✓ Created ${outputPath} (${(archive.pointer() / 1024).toFixed(1)} KB)`)
      resolve()
    })

    archive.on('error', reject)
    archive.pipe(output)

    for (const file of files) {
      if (fs.existsSync(file.source)) {
        archive.file(file.source, { name: file.name })
      }
    }

    archive.finalize()
  })
}

// Upload ZIP to admin/blocks
async function uploadZip(
  zipPath: string,
  slug: string,
  baseUrl: string
): Promise<void> {
  console.log(`\nUploading to ${baseUrl}/api/admin/blocks/import...`)

  const formData = new FormData()
  const zipBuffer = fs.readFileSync(zipPath)
  const blob = new Blob([zipBuffer], { type: 'application/zip' })
  formData.append('file', blob, path.basename(zipPath))
  formData.append('slug', slug)

  const response = await fetch(`${baseUrl}/api/admin/blocks/import`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Upload failed: ${response.status} ${error}`)
  }

  const result = await response.json()
  console.log('✓ Upload successful:', result)
}

// Main
async function main() {
  const { projectPath, upload, slug, url } = parseArgs()

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

  // Create temp directory for gerbers
  const gerberDir = path.join(projectDir, 'gerbers')
  if (!fs.existsSync(gerberDir)) {
    fs.mkdirSync(gerberDir, { recursive: true })
  }

  // Collect files for ZIP
  const zipFiles: { source: string; name: string }[] = []

  // Export Gerbers and STEP if PCB exists
  let stepPath: string | null = null
  if (pcb) {
    const gerberFiles = exportGerbers(kicadCli, pcb, gerberDir)
    for (const gf of gerberFiles) {
      zipFiles.push({ source: gf, name: `gerbers/${path.basename(gf)}` })
    }

    stepPath = path.join(projectDir, `${projectName}.step`)
    exportStep(kicadCli, pcb, stepPath)
    zipFiles.push({ source: stepPath, name: `${projectName}.step` })
    zipFiles.push({ source: pcb, name: path.basename(pcb) })
  }

  // Add schematic
  if (sch) {
    zipFiles.push({ source: sch, name: path.basename(sch) })
  }

  // Create template block.json if it doesn't exist
  const blockJsonPath = path.join(projectDir, 'block.json')
  if (!fs.existsSync(blockJsonPath)) {
    console.log('  Creating template block.json...')
    const blockJson = {
      name: projectName.replace(/[-_]/g, ' '),
      slug: blockSlug,
      description: 'TODO: Add description',
      category: 'custom',
      version: '1.0.0',
      grid: {
        width: 1,
        height: 1,
      },
      interfaces: {
        // TODO: Define interfaces (I2C, SPI, GPIO, etc.)
      },
      power: {
        voltage: '3.3V',
        current_ma: 0,
      },
      notes: 'Generated by export-kicad-block script. Please update with actual specifications.',
    }
    fs.writeFileSync(blockJsonPath, JSON.stringify(blockJson, null, 2))
    console.log(`  Created ${blockJsonPath} - please update with actual block specifications`)
  }
  zipFiles.push({ source: blockJsonPath, name: 'block.json' })

  // Create ZIP
  const zipPath = path.join(projectDir, `${blockSlug}-export.zip`)
  await createZip(zipPath, zipFiles)

  console.log('\nContents:')
  for (const f of zipFiles) {
    console.log(`  ${f.name}`)
  }

  // Upload if requested
  if (upload) {
    await uploadZip(zipPath, blockSlug, url)
  } else {
    console.log(`\nTo upload manually, run:`)
    console.log(`  pnpm export-block "${projectPath}" --upload --slug ${blockSlug}`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
