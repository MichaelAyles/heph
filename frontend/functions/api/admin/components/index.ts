/**
 * Admin JLCPCB Components API
 *
 * GET  /api/admin/components - List all components (paginated, searchable)
 * POST /api/admin/components - Create new component
 */

import type { Env } from '../../../env'
import { createLogger } from '../../../lib/logger'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

interface JlcpcbComponentRow {
  lcsc_part_number: string
  manufacturer_part_number: string | null
  description: string | null
  footprint: string | null
  rotation_offset: number
  created_at: string
  updated_at: string
}

interface JlcpcbComponent {
  lcscPartNumber: string
  manufacturerPartNumber: string | null
  description: string | null
  footprint: string | null
  rotationOffset: number
  createdAt: string
  updatedAt: string
}

function rowToComponent(row: JlcpcbComponentRow): JlcpcbComponent {
  return {
    lcscPartNumber: row.lcsc_part_number,
    manufacturerPartNumber: row.manufacturer_part_number,
    description: row.description,
    footprint: row.footprint,
    rotationOffset: row.rotation_offset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// =============================================================================
// GET - List all components
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    let query: string
    let params: unknown[]

    if (search) {
      query = `
        SELECT * FROM jlcpcb_components
        WHERE lcsc_part_number LIKE ?
           OR manufacturer_part_number LIKE ?
           OR description LIKE ?
           OR footprint LIKE ?
        ORDER BY lcsc_part_number
        LIMIT ? OFFSET ?
      `
      const searchPattern = `%${search}%`
      params = [searchPattern, searchPattern, searchPattern, searchPattern, limit, offset]
    } else {
      query = 'SELECT * FROM jlcpcb_components ORDER BY lcsc_part_number LIMIT ? OFFSET ?'
      params = [limit, offset]
    }

    const result = await env.DB.prepare(query).bind(...params).all<JlcpcbComponentRow>()

    // Get total count
    let countQuery: string
    let countParams: unknown[]
    if (search) {
      countQuery = `
        SELECT COUNT(*) as count FROM jlcpcb_components
        WHERE lcsc_part_number LIKE ?
           OR manufacturer_part_number LIKE ?
           OR description LIKE ?
           OR footprint LIKE ?
      `
      const searchPattern = `%${search}%`
      countParams = [searchPattern, searchPattern, searchPattern, searchPattern]
    } else {
      countQuery = 'SELECT COUNT(*) as count FROM jlcpcb_components'
      countParams = []
    }

    const countResult = await env.DB.prepare(countQuery)
      .bind(...countParams)
      .first<{ count: number }>()

    const components = (result.results ?? []).map(rowToComponent)

    await logger.debug('api', 'JLCPCB components listed', { count: components.length })

    return Response.json({
      components,
      total: countResult?.count ?? 0,
      limit,
      offset,
    })
  } catch (error) {
    await logger.error('api', 'Failed to list JLCPCB components', { error: String(error) })
    return Response.json({ error: 'Failed to list components' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create new component
// =============================================================================

interface CreateComponentRequest {
  lcscPartNumber: string
  manufacturerPartNumber?: string
  description?: string
  footprint?: string
  rotationOffset?: number
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = (await context.request.json()) as CreateComponentRequest

    // Validate required fields
    if (!body.lcscPartNumber) {
      return Response.json({ error: 'lcscPartNumber is required' }, { status: 400 })
    }

    // Validate LCSC format (starts with C followed by numbers)
    if (!/^C\d+$/.test(body.lcscPartNumber)) {
      return Response.json(
        { error: 'Invalid LCSC part number format. Must start with C followed by numbers (e.g., C295747)' },
        { status: 400 }
      )
    }

    // Check for duplicate
    const existing = await env.DB.prepare(
      'SELECT lcsc_part_number FROM jlcpcb_components WHERE lcsc_part_number = ?'
    )
      .bind(body.lcscPartNumber)
      .first()

    if (existing) {
      return Response.json({ error: 'A component with this LCSC part number already exists' }, { status: 409 })
    }

    const now = new Date().toISOString()

    await env.DB.prepare(
      `INSERT INTO jlcpcb_components (lcsc_part_number, manufacturer_part_number, description, footprint, rotation_offset, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.lcscPartNumber,
        body.manufacturerPartNumber || null,
        body.description || null,
        body.footprint || null,
        body.rotationOffset ?? 0,
        now,
        now
      )
      .run()

    // Fetch the created component
    const created = await env.DB.prepare('SELECT * FROM jlcpcb_components WHERE lcsc_part_number = ?')
      .bind(body.lcscPartNumber)
      .first<JlcpcbComponentRow>()

    if (!created) {
      return Response.json({ error: 'Failed to retrieve created component' }, { status: 500 })
    }

    await logger.info('api', 'JLCPCB component created', { lcscPartNumber: body.lcscPartNumber })

    return Response.json({ component: rowToComponent(created) }, { status: 201 })
  } catch (error) {
    await logger.error('api', 'Failed to create JLCPCB component', { error: String(error) })
    return Response.json({ error: 'Failed to create component' }, { status: 500 })
  }
}
