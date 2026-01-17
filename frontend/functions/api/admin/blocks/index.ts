/**
 * Admin Blocks API - List and Create
 *
 * GET /api/admin/blocks - List all blocks with definition status
 * POST /api/admin/blocks - Create a new block
 */

import type { Env } from '../../../env.d'
import { parseBlockJson, validateBlockFiles, getBlockFileRequirements } from '../../../lib/block-validator'

interface BlockRow {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  width_units: number
  height_units: number
  is_validated: number
  is_active: number
  definition: string | null
  version: string | null
  files: string | null
  created_at: string | null
  updated_at: string | null
}

interface BlockSummary {
  id: string
  slug: string
  name: string
  category: string
  description: string
  widthUnits: number
  heightUnits: number
  isValidated: boolean
  isActive: boolean
  hasDefinition: boolean
  hasFiles: boolean
  version: string | null
  createdAt: string | null
  updatedAt: string | null
  fileStatus: {
    required: string[]
    present: string[]
    missing: string[]
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const url = new URL(context.request.url)
    const category = url.searchParams.get('category')
    const withDefinition = url.searchParams.get('withDefinition') === 'true'

    let query = `
      SELECT id, slug, name, category, description, width_units, height_units,
             is_validated, is_active, definition, version, files, created_at, updated_at
      FROM pcb_blocks
      WHERE 1=1
    `
    const params: (string | number)[] = []

    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }

    if (withDefinition) {
      query += ' AND definition IS NOT NULL'
    }

    query += ' ORDER BY category, name'

    const result = await env.DB.prepare(query)
      .bind(...params)
      .all<BlockRow>()

    // Transform rows to summaries
    const blocks: BlockSummary[] = result.results.map((row) => {
      const files = row.files ? JSON.parse(row.files) : {}
      const filesList = Object.values(files).filter(Boolean) as string[]
      const requirements = getBlockFileRequirements(row.slug)

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        category: row.category,
        description: row.description || '',
        widthUnits: row.width_units,
        heightUnits: row.height_units,
        isValidated: row.is_validated === 1,
        isActive: row.is_active === 1,
        hasDefinition: row.definition !== null,
        hasFiles: Object.keys(files).length > 0,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fileStatus: {
          required: requirements.required,
          present: filesList,
          missing: requirements.required.filter((f) => !filesList.includes(f)),
        },
      }
    })

    return Response.json({ blocks })
  } catch (error) {
    console.error('List blocks error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to list blocks' },
      { status: 500 }
    )
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      definition: unknown
    }

    // Validate block definition
    const validationResult = parseBlockJson(JSON.stringify(body.definition))
    if (!validationResult.success) {
      return Response.json(
        { error: 'Invalid block definition', errors: validationResult.errors },
        { status: 400 }
      )
    }

    const definition = validationResult.data

    // Check if slug already exists
    const existing = await env.DB.prepare('SELECT id FROM pcb_blocks WHERE slug = ?')
      .bind(definition.slug)
      .first()

    if (existing) {
      return Response.json(
        { error: `Block with slug "${definition.slug}" already exists` },
        { status: 409 }
      )
    }

    // Generate UUID for new block
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Extract legacy fields from definition for backwards compatibility
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

    // Insert into database
    await env.DB.prepare(
      `INSERT INTO pcb_blocks (
        id, slug, name, category, description,
        width_units, height_units, taps, i2c_addresses, spi_cs,
        power, components, is_validated, is_active,
        definition, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        definition.slug,
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
        0, // is_validated - needs files uploaded
        1, // is_active
        JSON.stringify(definition),
        definition.version,
        now,
        now
      )
      .run()

    return Response.json({
      success: true,
      id,
      slug: definition.slug,
      message: `Block "${definition.name}" created. Upload required files to complete setup.`,
    })
  } catch (error) {
    console.error('Create block error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create block' },
      { status: 500 }
    )
  }
}
