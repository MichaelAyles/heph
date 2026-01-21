import { execSync } from 'child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
  copyFileSync,
} from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import JSZip from 'jszip'
import { ProcessResult, ExportOptions, DEFAULT_EXPORT_OPTIONS } from './types'

/**
 * Process KiCad schematic and PCB files to generate manufacturing outputs
 */
export async function processKicadFiles(
  schPath: string,
  pcbPath: string,
  options: ExportOptions = {}
): Promise<ProcessResult> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options }

  // Create temporary working directory
  const workDir = mkdtempSync(join(tmpdir(), 'kicad-'))
  const outDir = join(workDir, 'out')
  mkdirSync(outDir, { recursive: true })

  // Copy input files to work directory with proper names
  const workPcbPath = join(workDir, 'board.kicad_pcb')
  const workSchPath = join(workDir, 'board.kicad_sch')
  copyFileSync(pcbPath, workPcbPath)
  copyFileSync(schPath, workSchPath)

  try {
    // Export Gerbers
    console.log('Exporting Gerbers...')
    exportGerbers(workPcbPath, outDir, opts.layers)

    // Export drill files
    console.log('Exporting drill files...')
    exportDrill(workPcbPath, outDir, opts.drillFormat)

    // Export pick and place
    console.log('Exporting pick and place...')
    const posPath = join(outDir, 'positions.csv')
    exportPos(workPcbPath, posPath, opts.posUnits)

    // Export STEP model
    console.log('Exporting STEP model...')
    const stepPath = join(outDir, 'model.step')
    exportStep(workPcbPath, stepPath)

    // Create gerbers ZIP
    console.log('Creating gerbers ZIP...')
    const gerbersZip = await createGerbersZip(outDir)

    // Read generated files
    const stepContent = existsSync(stepPath)
      ? readFileSync(stepPath).toString('base64')
      : ''

    const posContent = existsSync(posPath)
      ? readFileSync(posPath).toString('base64')
      : ''

    return {
      gerbersZipBase64: gerbersZip,
      stepBase64: stepContent,
      posBase64: posContent,
    }
  } finally {
    // Cleanup
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch (e) {
      console.error('Failed to cleanup work directory:', e)
    }
  }
}

/**
 * Export Gerber files for all specified layers
 */
function exportGerbers(pcbPath: string, outDir: string, layers: string[]): void {
  const layerArg = layers.join(',')

  try {
    execSync(
      `kicad-cli pcb export gerbers \
        --output "${outDir}/" \
        --layers "${layerArg}" \
        --use-drill-file-origin \
        "${pcbPath}"`,
      {
        stdio: 'pipe',
        timeout: 60000, // 60 second timeout
      }
    )
  } catch (error) {
    const err = error as { stderr?: Buffer; message?: string }
    const stderr = err.stderr?.toString() || err.message || 'Unknown error'
    throw new Error(`Gerber export failed: ${stderr}`)
  }
}

/**
 * Export drill files in Excellon or Gerber format
 */
function exportDrill(
  pcbPath: string,
  outDir: string,
  format: 'excellon' | 'gerber'
): void {
  try {
    execSync(
      `kicad-cli pcb export drill \
        --output "${outDir}/" \
        --format ${format} \
        --excellon-units mm \
        "${pcbPath}"`,
      {
        stdio: 'pipe',
        timeout: 60000,
      }
    )
  } catch (error) {
    const err = error as { stderr?: Buffer; message?: string }
    const stderr = err.stderr?.toString() || err.message || 'Unknown error'
    throw new Error(`Drill export failed: ${stderr}`)
  }
}

/**
 * Export pick and place file
 */
function exportPos(pcbPath: string, outPath: string, units: 'mm' | 'in'): void {
  try {
    execSync(
      `kicad-cli pcb export pos \
        --output "${outPath}" \
        --format csv \
        --units ${units} \
        --side both \
        "${pcbPath}"`,
      {
        stdio: 'pipe',
        timeout: 60000,
      }
    )
  } catch (error) {
    const err = error as { stderr?: Buffer; message?: string }
    const stderr = err.stderr?.toString() || err.message || 'Unknown error'
    // Position export may fail if no components - this is non-fatal
    console.warn(`Position export warning: ${stderr}`)
  }
}

/**
 * Export STEP 3D model
 */
function exportStep(pcbPath: string, outPath: string): void {
  try {
    execSync(
      `kicad-cli pcb export step \
        --output "${outPath}" \
        --subst-models \
        "${pcbPath}"`,
      {
        stdio: 'pipe',
        timeout: 120000, // 2 minute timeout for STEP (can be slow)
      }
    )
  } catch (error) {
    const err = error as { stderr?: Buffer; message?: string }
    const stderr = err.stderr?.toString() || err.message || 'Unknown error'
    // STEP export may fail if 3D models missing - this is non-fatal
    console.warn(`STEP export warning: ${stderr}`)
  }
}

/**
 * Create a ZIP file containing all Gerber and drill files
 */
async function createGerbersZip(outDir: string): Promise<string> {
  const zip = new JSZip()

  const files = readdirSync(outDir)
  const gerberExtensions = [
    '.gbr',
    '.gtl',
    '.gbl',
    '.gts',
    '.gbs',
    '.gto',
    '.gbo',
    '.gtp',
    '.gbp',
    '.gm1',
    '.gm2',
    '.gko',
    '.drl',
    '.xln',
  ]

  for (const file of files) {
    const ext = file.toLowerCase().slice(file.lastIndexOf('.'))
    if (gerberExtensions.includes(ext) || file.includes('-')) {
      // Include files with gerber extensions or KiCad's naming convention
      const filePath = join(outDir, file)
      zip.file(file, readFileSync(filePath))
    }
  }

  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
}

/**
 * Validate that a file is a valid KiCad file
 */
export function validateKicadFile(
  filePath: string,
  type: 'schematic' | 'pcb'
): boolean {
  if (!existsSync(filePath)) {
    return false
  }

  const content = readFileSync(filePath, 'utf-8').slice(0, 1000)

  if (type === 'schematic') {
    return content.includes('kicad_sch') || content.includes('(sheet')
  } else {
    return content.includes('kicad_pcb') || content.includes('(board')
  }
}
