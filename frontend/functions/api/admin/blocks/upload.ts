/**
 * Admin endpoint for uploading block KiCad files to R2 and updating metadata
 *
 * POST /api/admin/blocks/upload
 * - Accepts multipart form data with:
 *   - slug: block slug (e.g., "mcu-esp32c6")
 *   - schematic: .kicad_sch file
 *   - pcb: .kicad_pcb file (optional)
 *   - step: .step/.stp file (optional)
 *   - thumbnail: .png file (optional)
 *   - edges: JSON string of edge definitions
 *   - netMappings: JSON string of net mappings
 */

interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  user?: {
    id: string
    username: string
    displayName: string | null
    isAdmin: boolean
  }
}

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface AuthenticatedEnv extends Env {
  user: {
    id: string
    username: string
    displayName: string | null
    isAdmin: boolean
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context as { env: AuthenticatedEnv }

  // Check admin permission
  if (!env.user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const formData = await context.request.formData()
    const slug = formData.get('slug') as string

    if (!slug) {
      return Response.json({ error: 'Block slug is required' }, { status: 400 })
    }

    // Validate block exists in database
    const block = await env.DB.prepare('SELECT * FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first()

    if (!block) {
      return Response.json({ error: `Block "${slug}" not found in database` }, { status: 404 })
    }

    const uploadedFiles: Record<string, string> = {}
    const r2Prefix = `blocks/${slug}/`

    // Upload schematic file
    const schematicFile = formData.get('schematic') as File | null
    if (schematicFile) {
      const key = `${r2Prefix}${slug}.kicad_sch`
      await env.STORAGE.put(key, await schematicFile.arrayBuffer(), {
        httpMetadata: { contentType: 'application/x-kicad-schematic' },
      })
      uploadedFiles.schematic = `${slug}.kicad_sch`
    }

    // Upload PCB file
    const pcbFile = formData.get('pcb') as File | null
    if (pcbFile) {
      const key = `${r2Prefix}${slug}.kicad_pcb`
      await env.STORAGE.put(key, await pcbFile.arrayBuffer(), {
        httpMetadata: { contentType: 'application/x-kicad-pcb' },
      })
      uploadedFiles.pcb = `${slug}.kicad_pcb`
    }

    // Upload STEP model
    const stepFile = formData.get('step') as File | null
    if (stepFile) {
      const key = `${r2Prefix}${slug}.step`
      await env.STORAGE.put(key, await stepFile.arrayBuffer(), {
        httpMetadata: { contentType: 'model/step' },
      })
      uploadedFiles.stepModel = `${slug}.step`
    }

    // Upload thumbnail
    const thumbnailFile = formData.get('thumbnail') as File | null
    if (thumbnailFile) {
      const key = `${r2Prefix}${slug}.png`
      await env.STORAGE.put(key, await thumbnailFile.arrayBuffer(), {
        httpMetadata: { contentType: 'image/png' },
      })
      uploadedFiles.thumbnail = `${slug}.png`
    }

    // Parse and validate edge definitions
    const edgesJson = formData.get('edges') as string | null
    let edges = null
    if (edgesJson) {
      try {
        edges = JSON.parse(edgesJson)
        // Basic validation
        if (!edges.north || !edges.south || !edges.east || !edges.west) {
          return Response.json(
            { error: 'Edges must include north, south, east, and west arrays' },
            { status: 400 }
          )
        }
      } catch {
        return Response.json({ error: 'Invalid edges JSON' }, { status: 400 })
      }
    }

    // Parse net mappings
    const netMappingsJson = formData.get('netMappings') as string | null
    let netMappings = null
    if (netMappingsJson) {
      try {
        netMappings = JSON.parse(netMappingsJson)
      } catch {
        return Response.json({ error: 'Invalid netMappings JSON' }, { status: 400 })
      }
    }

    // Build files JSON from existing + new
    const existingFiles = block.files ? JSON.parse(block.files as string) : {}
    const files = { ...existingFiles, ...uploadedFiles }

    // Update database
    await env.DB.prepare(
      `UPDATE pcb_blocks
       SET files = ?, edges = COALESCE(?, edges), net_mappings = COALESCE(?, net_mappings)
       WHERE slug = ?`
    )
      .bind(
        JSON.stringify(files),
        edges ? JSON.stringify(edges) : null,
        netMappings ? JSON.stringify(netMappings) : null,
        slug
      )
      .run()

    return Response.json({
      success: true,
      slug,
      uploadedFiles,
      message: `Block "${slug}" updated with ${Object.keys(uploadedFiles).length} file(s)`,
    })
  } catch (error) {
    console.error('Block upload error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
