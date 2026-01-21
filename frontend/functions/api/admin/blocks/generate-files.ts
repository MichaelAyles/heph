/**
 * Admin endpoint for generating manufacturing files from KiCad source files
 *
 * POST /api/admin/blocks/generate-files
 * - Accepts multipart form data with:
 *   - slug: block slug (required)
 *   - schematic: .kicad_sch file (required)
 *   - pcb: .kicad_pcb file (required)
 *
 * This endpoint forwards the KiCad files to the KiCad microservice running on Railway,
 * which generates Gerbers, STEP model, and Pick & Place files using the KiCad CLI.
 *
 * The generated files are then stored in R2 alongside the source files.
 */

import type { Env } from '../../../env.d'
import { createLogger } from '../../../lib/logger'

interface KicadServiceResponse {
  success: boolean
  files?: {
    gerbers: string // base64
    step: string // base64
    pos: string // base64
  }
  error?: string
  details?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const logger = createLogger(env)

  // Check admin permission
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Check KiCad service URL is configured
  const kicadServiceUrl = env.KICAD_SERVICE_URL
  if (!kicadServiceUrl) {
    return Response.json(
      { error: 'KiCad service not configured. Set KICAD_SERVICE_URL environment variable.' },
      { status: 503 }
    )
  }

  try {
    const formData = await context.request.formData()
    const slug = formData.get('slug') as string
    const schematic = formData.get('schematic') as File | null
    const pcb = formData.get('pcb') as File | null

    // Validate required fields
    if (!slug) {
      return Response.json({ error: 'Block slug is required' }, { status: 400 })
    }

    // Check for overwrite flag
    const overwrite = formData.get('overwrite') === 'true'

    if (!schematic) {
      return Response.json(
        { error: 'Schematic file (.kicad_sch) is required' },
        { status: 400 }
      )
    }

    if (!pcb) {
      return Response.json(
        { error: 'PCB file (.kicad_pcb) is required' },
        { status: 400 }
      )
    }

    // Validate file extensions
    if (!schematic.name.toLowerCase().endsWith('.kicad_sch')) {
      return Response.json(
        { error: 'Schematic file must have .kicad_sch extension' },
        { status: 400 }
      )
    }

    if (!pcb.name.toLowerCase().endsWith('.kicad_pcb')) {
      return Response.json(
        { error: 'PCB file must have .kicad_pcb extension' },
        { status: 400 }
      )
    }

    // Check if block exists in database
    const block = await env.DB.prepare('SELECT id, files FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first<{ id: string; files: string | null }>()

    // If block exists and overwrite not specified, return error
    if (block && !overwrite) {
      return Response.json(
        {
          error: `Block with slug "${slug}" already exists`,
          exists: true,
          hint: 'Set overwrite=true to replace existing files',
        },
        { status: 409 }
      )
    }

    await logger.info('api', 'Generating manufacturing files from KiCad', {
      slug,
      schematicName: schematic.name,
      pcbName: pcb.name,
      blockExists: !!block,
    })

    // Forward files to KiCad microservice
    const serviceFormData = new FormData()
    serviceFormData.append('schematic', schematic)
    serviceFormData.append('pcb', pcb)

    const startTime = Date.now()

    const response = await fetch(`${kicadServiceUrl}/process`, {
      method: 'POST',
      body: serviceFormData,
    })

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as KicadServiceResponse
      await logger.error('api', 'KiCad service error', {
        slug,
        status: response.status,
        error: errorData.error,
        details: errorData.details,
        latencyMs,
      })
      return Response.json(
        {
          error: errorData.error || 'KiCad service processing failed',
          details: errorData.details,
        },
        { status: 502 }
      )
    }

    const result = (await response.json()) as KicadServiceResponse

    if (!result.success || !result.files) {
      return Response.json(
        { error: 'KiCad service returned invalid response' },
        { status: 502 }
      )
    }

    await logger.info('api', 'KiCad service completed', {
      slug,
      latencyMs,
      hasGerbers: !!result.files.gerbers,
      hasStep: !!result.files.step,
      hasPos: !!result.files.pos,
    })

    // Store generated files in R2
    const r2Prefix = `blocks/${slug}/`
    const uploadedFiles: Record<string, string> = {}

    // Store source files first
    const schematicKey = `${r2Prefix}${slug}.kicad_sch`
    await env.STORAGE.put(schematicKey, await schematic.arrayBuffer(), {
      httpMetadata: { contentType: 'application/x-kicad-schematic' },
    })
    uploadedFiles.schematic = `${slug}.kicad_sch`

    const pcbKey = `${r2Prefix}${slug}.kicad_pcb`
    await env.STORAGE.put(pcbKey, await pcb.arrayBuffer(), {
      httpMetadata: { contentType: 'application/x-kicad-pcb' },
    })
    uploadedFiles.pcb = `${slug}.kicad_pcb`

    // Store generated Gerbers ZIP
    if (result.files.gerbers) {
      const gerbersBuffer = base64ToArrayBuffer(result.files.gerbers)
      const gerbersKey = `${r2Prefix}${slug}-gerbers.zip`
      await env.STORAGE.put(gerbersKey, gerbersBuffer, {
        httpMetadata: { contentType: 'application/zip' },
      })
      uploadedFiles.gerbers = `${slug}-gerbers.zip`
    }

    // Store generated STEP file
    if (result.files.step) {
      const stepBuffer = base64ToArrayBuffer(result.files.step)
      const stepKey = `${r2Prefix}${slug}.step`
      await env.STORAGE.put(stepKey, stepBuffer, {
        httpMetadata: { contentType: 'model/step' },
      })
      uploadedFiles.stepModel = `${slug}.step`
    }

    // Store generated Pick & Place file
    if (result.files.pos) {
      const posBuffer = base64ToArrayBuffer(result.files.pos)
      const posKey = `${r2Prefix}${slug}-pos.csv`
      await env.STORAGE.put(posKey, posBuffer, {
        httpMetadata: { contentType: 'text/csv' },
      })
      uploadedFiles.pos = `${slug}-pos.csv`
    }

    // Update database with file references
    if (block) {
      const existingFiles = block.files ? JSON.parse(block.files) : {}
      const mergedFiles = { ...existingFiles, ...uploadedFiles }

      await env.DB.prepare(
        `UPDATE pcb_blocks SET files = ?, updated_at = ? WHERE slug = ?`
      )
        .bind(JSON.stringify(mergedFiles), new Date().toISOString(), slug)
        .run()
    } else {
      // Create a minimal block record if it doesn't exist
      // Use 'utility' as default category (DB constraint: mcu, power, sensor, output, connector, utility)
      await env.DB.prepare(
        `INSERT INTO pcb_blocks (slug, name, category, files, created_at, updated_at)
         VALUES (?, ?, 'utility', ?, ?, ?)`
      )
        .bind(
          slug,
          slug.replace(/-/g, ' '),
          JSON.stringify(uploadedFiles),
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run()
    }

    await logger.info('api', 'Manufacturing files stored', {
      slug,
      uploadedFiles: Object.keys(uploadedFiles),
    })

    return Response.json({
      success: true,
      slug,
      generatedFiles: {
        gerbers: !!result.files.gerbers,
        step: !!result.files.step,
        pos: !!result.files.pos,
      },
      uploadedFiles,
      latencyMs,
      message: `Manufacturing files generated and stored for block "${slug}"`,
    })
  } catch (error) {
    await logger.error('api', 'Generate files error', {
      error: error instanceof Error ? error.message : String(error),
    })

    // Check if it's a network error connecting to the KiCad service
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return Response.json(
        {
          error: 'Unable to connect to KiCad service',
          details: 'The KiCad processing service may be unavailable or starting up.',
        },
        { status: 503 }
      )
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'File generation failed' },
      { status: 500 }
    )
  }
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}
