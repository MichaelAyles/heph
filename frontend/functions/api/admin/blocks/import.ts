/**
 * Admin endpoint for importing a block from a ZIP file
 *
 * POST /api/admin/blocks/import
 * - Accepts multipart form data with:
 *   - file: ZIP containing required files
 *   - slug: block slug (optional, derived from file names if not provided)
 *   - name: display name (optional)
 *   - description: block description (optional)
 *   - category: block category (optional, defaults to 'custom')
 *
 * Required files in ZIP:
 *   - .kicad_sch (schematic)
 *   - .kicad_pcb (PCB layout)
 *   - .step/.stp (3D model)
 *   - gerbers/ directory with gerber files
 *   - block.json (block definition)
 *
 * Optional:
 *   - thumbnail.png
 */

import JSZip from 'jszip'
import { createLogger } from '../../../lib/logger'

interface Env {
  DB: D1Database
  STORAGE: R2Bucket
}

interface Context {
  request: Request
  env: Env
  data: {
    user?: {
      id: string
      username: string
      displayName: string | null
      isAdmin: boolean
    }
  }
}

interface ValidationResult {
  valid: boolean
  files: {
    schematic: string | null
    pcb: string | null
    step: string | null
    gerbers: string[]
    definition: string | null
    thumbnail: string | null
  }
  missing: string[]
}

function validateZipContents(files: string[], zip: JSZip): ValidationResult {
  const schFile = files.find((f) => f.endsWith('.kicad_sch') && !f.includes('/'))
  const pcbFile = files.find((f) => f.endsWith('.kicad_pcb') && !f.includes('/'))
  const stepFile = files.find((f) => (f.endsWith('.step') || f.endsWith('.stp')) && !f.includes('/'))
  const gerberFiles = files.filter((f) => f.startsWith('gerbers/') && !zip.files[f].dir)
  const definitionFile = files.find((f) => f === 'block.json' || f.endsWith('/block.json'))
  const thumbnailFile = files.find((f) =>
    (f === 'thumbnail.png' || f.endsWith('/thumbnail.png')) ||
    (f.endsWith('.png') && !f.includes('/'))
  )

  const missing: string[] = []
  if (!schFile) missing.push('schematic (.kicad_sch)')
  if (!pcbFile) missing.push('PCB (.kicad_pcb)')
  if (!stepFile) missing.push('STEP model (.step)')
  if (gerberFiles.length === 0) missing.push('gerbers/ directory')
  if (!definitionFile) missing.push('block.json')

  return {
    valid: missing.length === 0,
    files: {
      schematic: schFile || null,
      pcb: pcbFile || null,
      step: stepFile || null,
      gerbers: gerberFiles,
      definition: definitionFile || null,
      thumbnail: thumbnailFile || null,
    },
    missing,
  }
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { env, data } = context

  // Check admin permission
  if (!data.user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const formData = await context.request.formData()
    const zipFile = formData.get('file') as File | null
    const validateOnly = formData.get('validate') === 'true'

    if (!zipFile) {
      return Response.json({ error: 'ZIP file is required' }, { status: 400 })
    }

    // Load and parse ZIP
    const zipBuffer = await zipFile.arrayBuffer()
    const zip = await JSZip.loadAsync(zipBuffer)
    const files = Object.keys(zip.files)

    // Validate ZIP contents
    const validation = validateZipContents(files, zip)

    // If just validating, return the validation result
    if (validateOnly) {
      return Response.json({
        validation,
        files: files.filter(f => !zip.files[f].dir),
      })
    }

    // Check all required files are present
    if (!validation.valid) {
      return Response.json(
        {
          error: `Missing required files: ${validation.missing.join(', ')}`,
          validation,
        },
        { status: 400 }
      )
    }

    const { schematic: schFile, pcb: pcbFile, step: stepFile, gerbers: gerberFiles, definition: definitionFile, thumbnail: thumbnailFile } = validation.files

    // Derive project name from PCB file
    const projectName = pcbFile!.replace(/\.kicad_pcb$/, '')

    // Get or derive slug
    let slug = formData.get('slug') as string | null
    if (!slug) {
      slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    }

    const name = (formData.get('name') as string) || projectName.replace(/[-_]/g, ' ')
    const description = (formData.get('description') as string) || `Imported from ${zipFile.name}`
    const category = (formData.get('category') as string) || 'custom'

    // Check if block exists
    const existingBlock = await env.DB.prepare(
      'SELECT id FROM pcb_blocks WHERE slug = ?'
    ).bind(slug).first()

    const r2Prefix = `blocks/${slug}/`
    const uploadedFiles: Record<string, string> = {}

    // Upload schematic
    if (schFile) {
      const content = await zip.files[schFile].async('arraybuffer')
      const key = `${r2Prefix}${slug}.kicad_sch`
      await env.STORAGE.put(key, content, {
        httpMetadata: { contentType: 'application/x-kicad-schematic' },
      })
      uploadedFiles.schematic = `${slug}.kicad_sch`
    }

    // Upload PCB
    if (pcbFile) {
      const content = await zip.files[pcbFile].async('arraybuffer')
      const key = `${r2Prefix}${slug}.kicad_pcb`
      await env.STORAGE.put(key, content, {
        httpMetadata: { contentType: 'application/x-kicad-pcb' },
      })
      uploadedFiles.pcb = `${slug}.kicad_pcb`
    }

    // Upload STEP
    if (stepFile) {
      const content = await zip.files[stepFile].async('arraybuffer')
      const key = `${r2Prefix}${slug}.step`
      await env.STORAGE.put(key, content, {
        httpMetadata: { contentType: 'model/step' },
      })
      uploadedFiles.stepModel = `${slug}.step`
    }

    // Upload Gerbers as a ZIP
    if (gerberFiles.length > 0) {
      const gerberZip = new JSZip()
      for (const gf of gerberFiles) {
        const content = await zip.files[gf].async('arraybuffer')
        const fileName = gf.replace('gerbers/', '')
        gerberZip.file(fileName, content)
      }
      const gerberZipBuffer = await gerberZip.generateAsync({ type: 'arraybuffer' })
      const key = `${r2Prefix}${slug}-gerbers.zip`
      await env.STORAGE.put(key, gerberZipBuffer, {
        httpMetadata: { contentType: 'application/zip' },
      })
      uploadedFiles.gerbers = `${slug}-gerbers.zip`
    }

    // Read and parse block.json definition
    let definition: Record<string, unknown> | null = null
    if (definitionFile) {
      const definitionContent = await zip.files[definitionFile].async('string')
      try {
        definition = JSON.parse(definitionContent)
      } catch {
        return Response.json(
          { error: 'Invalid block.json: failed to parse JSON' },
          { status: 400 }
        )
      }
    }

    // Upload thumbnail if present
    if (thumbnailFile) {
      const content = await zip.files[thumbnailFile].async('arraybuffer')
      const key = `${r2Prefix}${slug}.png`
      await env.STORAGE.put(key, content, {
        httpMetadata: { contentType: 'image/png' },
      })
      uploadedFiles.thumbnail = `${slug}.png`
    }

    // Create or update block record
    if (existingBlock) {
      // Update existing block
      const existingFiles = await env.DB.prepare(
        'SELECT files FROM pcb_blocks WHERE slug = ?'
      ).bind(slug).first<{ files: string }>()

      const mergedFiles = {
        ...(existingFiles?.files ? JSON.parse(existingFiles.files) : {}),
        ...uploadedFiles,
      }

      await env.DB.prepare(
        `UPDATE pcb_blocks
         SET name = ?, description = ?, category = ?, files = ?, definition = ?, updated_at = CURRENT_TIMESTAMP
         WHERE slug = ?`
      ).bind(name, description, category, JSON.stringify(mergedFiles), JSON.stringify(definition), slug).run()
    } else {
      // Create new block
      await env.DB.prepare(
        `INSERT INTO pcb_blocks (slug, name, description, category, files, definition, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(slug, name, description, category, JSON.stringify(uploadedFiles), JSON.stringify(definition)).run()
    }

    return Response.json({
      success: true,
      slug,
      name,
      isNew: !existingBlock,
      uploadedFiles,
      gerberCount: gerberFiles.length,
      message: existingBlock
        ? `Block "${slug}" updated with ${Object.keys(uploadedFiles).length} file(s)`
        : `Block "${slug}" created with ${Object.keys(uploadedFiles).length} file(s)`,
    })
  } catch (error) {
    const logger = createLogger(env, data.user)
    await logger.error('api', 'Block import error', { error: String(error) })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
