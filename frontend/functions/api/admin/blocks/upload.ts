/**
 * Admin endpoint for uploading block KiCad files to R2 and updating metadata
 *
 * POST /api/admin/blocks/upload
 * - Accepts multipart form data with:
 *   - slug: block slug (e.g., "mcu-esp32c6")
 *   - schematic: .kicad_sch file (REQUIRED)
 *   - pcb: .kicad_pcb file (REQUIRED)
 *   - step: .step/.stp file (REQUIRED for enclosure generation)
 *   - blockJson: block.json content as text (optional - validates and updates definition)
 *   - thumbnail: .png file (optional)
 */

import type { Env } from '../../../env.d'
import { parseBlockJson, getBlockFileRequirements } from '../../../lib/block-validator'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  // Check admin permission
  if (!user?.isAdmin) {
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
      .first<{ id: string; files: string | null; definition: string | null }>()

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

    // Also upload block.json to R2 if provided
    const blockJsonContent = formData.get('blockJson') as string | null
    let definitionUpdated = false

    if (blockJsonContent) {
      // Validate the block.json content
      const validationResult = parseBlockJson(blockJsonContent)
      if (!validationResult.success) {
        return Response.json(
          { error: 'Invalid block.json', errors: validationResult.errors },
          { status: 400 }
        )
      }

      // Ensure slug matches
      if (validationResult.data.slug !== slug) {
        return Response.json(
          { error: `block.json slug "${validationResult.data.slug}" doesn't match upload slug "${slug}"` },
          { status: 400 }
        )
      }

      // Upload block.json to R2
      const key = `${r2Prefix}block.json`
      await env.STORAGE.put(key, blockJsonContent, {
        httpMetadata: { contentType: 'application/json' },
      })
      uploadedFiles.blockJson = 'block.json'
      definitionUpdated = true

      // Extract legacy fields for backwards compatibility
      const definition = validationResult.data
      const taps = definition.bus.taps?.map((t) => ({ net: t.signal })) || []
      const i2cAddresses = definition.bus.i2c?.addresses.map((a) => `0x${a.toString(16)}`) || null
      const spiCs = definition.bus.spi?.csPin || null
      const power = definition.bus.power?.requires?.[0]
        ? { current_max_ma: definition.bus.power.requires[0].maxMa }
        : definition.bus.power?.provides?.[0]
          ? { current_max_ma: -definition.bus.power.provides[0].maxMa }
          : { current_max_ma: 0 }
      const components = definition.components.map((c) => ({
        ref: c.reference,
        value: c.value,
        package: c.footprint,
      }))

      // Build files JSON from existing + new
      const existingFiles = block.files ? JSON.parse(block.files) : {}
      const files = { ...existingFiles, ...uploadedFiles }

      // Update database with definition and files
      await env.DB.prepare(
        `UPDATE pcb_blocks
         SET name = ?, category = ?, description = ?,
             width_units = ?, height_units = ?,
             taps = ?, i2c_addresses = ?, spi_cs = ?,
             power = ?, components = ?,
             definition = ?, version = ?, files = ?,
             updated_at = ?
         WHERE slug = ?`
      )
        .bind(
          definition.name,
          definition.category,
          definition.description,
          definition.gridSize[0],
          definition.gridSize[1],
          JSON.stringify(taps),
          i2cAddresses ? JSON.stringify(i2cAddresses) : null,
          spiCs,
          JSON.stringify(power),
          JSON.stringify(components),
          blockJsonContent,
          definition.version,
          JSON.stringify(files),
          new Date().toISOString(),
          slug
        )
        .run()
    } else {
      // Just update files without definition
      const existingFiles = block.files ? JSON.parse(block.files) : {}
      const files = { ...existingFiles, ...uploadedFiles }

      await env.DB.prepare(
        `UPDATE pcb_blocks SET files = ?, updated_at = ? WHERE slug = ?`
      )
        .bind(JSON.stringify(files), new Date().toISOString(), slug)
        .run()
    }

    // Check if all required files are now present
    const existingFiles = block.files ? JSON.parse(block.files) : {}
    const allFiles = { ...existingFiles, ...uploadedFiles }
    const requirements = getBlockFileRequirements(slug)
    const presentFiles = Object.values(allFiles).filter(Boolean) as string[]
    const missingFiles = requirements.required.filter((f) => !presentFiles.includes(f))

    // Auto-validate if all required files are present and definition exists
    if (missingFiles.length === 0 && (definitionUpdated || block.definition)) {
      await env.DB.prepare('UPDATE pcb_blocks SET is_validated = 1 WHERE slug = ?')
        .bind(slug)
        .run()
    }

    return Response.json({
      success: true,
      slug,
      uploadedFiles,
      definitionUpdated,
      fileStatus: {
        required: requirements.required,
        present: presentFiles,
        missing: missingFiles,
      },
      isValidated: missingFiles.length === 0 && (definitionUpdated || block.definition !== null),
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
