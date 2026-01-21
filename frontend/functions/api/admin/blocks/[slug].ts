/**
 * Admin Block API - Individual Block Operations
 *
 * GET /api/admin/blocks/:slug - Get block details with definition
 * PUT /api/admin/blocks/:slug - Update block definition
 * DELETE /api/admin/blocks/:slug - Delete block and its files
 */

import type { Env } from '../../../env.d'
import { parseBlockJson, getBlockFileRequirements } from '../../../lib/block-validator'
import type { BlockDefinition } from '../../../../src/schemas/block'
import { createLogger } from '../../../lib/logger'

interface BlockRow {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  width_units: number
  height_units: number
  taps: string
  i2c_addresses: string | null
  spi_cs: string | null
  power: string | null
  components: string | null
  is_validated: number
  is_active: number
  definition: string | null
  version: string | null
  files: string | null
  edges: string | null
  net_mappings: string | null
  created_at: string | null
  updated_at: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const slug = params.slug as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const block = await env.DB.prepare('SELECT * FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first<BlockRow>()

    if (!block) {
      return Response.json({ error: `Block "${slug}" not found` }, { status: 404 })
    }

    // Parse JSON fields
    const files = block.files ? JSON.parse(block.files) : {}
    const definition = block.definition ? (JSON.parse(block.definition) as BlockDefinition) : null
    const taps = JSON.parse(block.taps || '[]')
    const i2cAddresses = block.i2c_addresses ? JSON.parse(block.i2c_addresses) : null
    const power = block.power ? JSON.parse(block.power) : null
    const components = block.components ? JSON.parse(block.components) : []
    const edges = block.edges ? JSON.parse(block.edges) : null
    const netMappings = block.net_mappings ? JSON.parse(block.net_mappings) : null

    // Get file status
    const requirements = getBlockFileRequirements(slug)
    const filesList = Object.values(files).filter(Boolean) as string[]

    return Response.json({
      block: {
        id: block.id,
        slug: block.slug,
        name: block.name,
        category: block.category,
        description: block.description,
        widthUnits: block.width_units,
        heightUnits: block.height_units,
        isValidated: block.is_validated === 1,
        isActive: block.is_active === 1,
        version: block.version,
        createdAt: block.created_at,
        updatedAt: block.updated_at,
        // Definition (new schema)
        definition,
        hasDefinition: definition !== null,
        // Legacy fields
        taps,
        i2cAddresses,
        spiCs: block.spi_cs,
        power,
        components,
        edges,
        netMappings,
        // Files
        files,
        fileStatus: {
          required: requirements.required,
          present: filesList,
          missing: requirements.required.filter((f) => !filesList.includes(f)),
        },
      },
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('api', 'Get block error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to get block' },
      { status: 500 }
    )
  }
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, params, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const slug = params.slug as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    // Check block exists
    const existing = await env.DB.prepare('SELECT id FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first()

    if (!existing) {
      return Response.json({ error: `Block "${slug}" not found` }, { status: 404 })
    }

    const body = (await request.json()) as {
      definition?: unknown
      isActive?: boolean
      isValidated?: boolean
    }

    const updates: string[] = []
    const params: (string | number | null)[] = []

    // Update definition if provided
    if (body.definition !== undefined) {
      const validationResult = parseBlockJson(JSON.stringify(body.definition))
      if (!validationResult.success) {
        return Response.json(
          { error: 'Invalid block definition', errors: validationResult.errors },
          { status: 400 }
        )
      }

      const definition = validationResult.data

      // Ensure slug matches
      if (definition.slug !== slug) {
        return Response.json(
          { error: `Definition slug "${definition.slug}" doesn't match URL slug "${slug}"` },
          { status: 400 }
        )
      }

      // Extract legacy fields for backwards compatibility
      const taps = definition.bus?.taps?.map((t) => ({ net: t.signal })) ?? []
      const i2cAddresses = definition.bus?.i2c?.addresses?.map((a) => `0x${a.toString(16)}`) ?? null
      const spiCs = definition.bus?.spi?.csPin ?? null
      const power = definition.bus?.power?.requires?.[0]
        ? { current_max_ma: definition.bus.power.requires[0].maxMa }
        : definition.bus?.power?.provides?.[0]
          ? { current_max_ma: -definition.bus.power.provides[0].maxMa }
          : { current_max_ma: 0 }
      const components = definition.components?.map((c) => ({
        ref: c.reference,
        value: c.value,
        package: c.footprint,
      })) ?? []

      updates.push(
        'name = ?',
        'category = ?',
        'description = ?',
        'width_units = ?',
        'height_units = ?',
        'taps = ?',
        'i2c_addresses = ?',
        'spi_cs = ?',
        'power = ?',
        'components = ?',
        'definition = ?',
        'version = ?'
      )
      params.push(
        definition.name,
        definition.category,
        definition.description,
        definition.gridSize?.[0] ?? 0,
        definition.gridSize?.[1] ?? 0,
        JSON.stringify(taps),
        i2cAddresses ? JSON.stringify(i2cAddresses) : null,
        spiCs,
        JSON.stringify(power),
        JSON.stringify(components),
        JSON.stringify(definition),
        definition.version
      )
    }

    // Update flags if provided
    if (body.isActive !== undefined) {
      updates.push('is_active = ?')
      params.push(body.isActive ? 1 : 0)
    }

    if (body.isValidated !== undefined) {
      updates.push('is_validated = ?')
      params.push(body.isValidated ? 1 : 0)
    }

    if (updates.length === 0) {
      return Response.json({ error: 'No updates provided' }, { status: 400 })
    }

    // Add updated_at
    updates.push('updated_at = ?')
    params.push(new Date().toISOString())

    // Add slug for WHERE clause
    params.push(slug)

    await env.DB.prepare(`UPDATE pcb_blocks SET ${updates.join(', ')} WHERE slug = ?`)
      .bind(...params)
      .run()

    return Response.json({
      success: true,
      slug,
      message: `Block "${slug}" updated`,
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('api', 'Update block error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to update block' },
      { status: 500 }
    )
  }
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const slug = params.slug as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    // Get block to verify it exists
    const block = await env.DB.prepare('SELECT id FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first<{ id: string }>()

    if (!block) {
      return Response.json({ error: `Block "${slug}" not found` }, { status: 404 })
    }

    // Delete ALL files from R2 under the block's prefix
    const r2Prefix = `blocks/${slug}/`
    const deletedFiles: string[] = []

    // List all objects with the prefix and delete them
    const listed = await env.STORAGE.list({ prefix: r2Prefix })
    for (const object of listed.objects) {
      try {
        await env.STORAGE.delete(object.key)
        deletedFiles.push(object.key.replace(r2Prefix, ''))
      } catch {
        // R2 file deletion failed - continue with other files
      }
    }

    // Handle truncated results (more than 1000 objects)
    let truncated = listed.truncated
    let cursor = listed.cursor
    while (truncated) {
      const next = await env.STORAGE.list({ prefix: r2Prefix, cursor })
      for (const object of next.objects) {
        try {
          await env.STORAGE.delete(object.key)
          deletedFiles.push(object.key.replace(r2Prefix, ''))
        } catch {
          // Continue on error
        }
      }
      truncated = next.truncated
      cursor = next.cursor
    }

    // Delete from database
    await env.DB.prepare('DELETE FROM pcb_blocks WHERE slug = ?').bind(slug).run()

    const logger = createLogger(env)
    await logger.info('api', 'Block deleted', {
      slug,
      deletedFiles: deletedFiles.length,
    })

    return Response.json({
      success: true,
      slug,
      deletedFiles,
      message: `Block "${slug}" and ${deletedFiles.length} file(s) deleted`,
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('api', 'Delete block error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to delete block' },
      { status: 500 }
    )
  }
}
