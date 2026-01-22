/**
 * Admin JLCPCB Components - Individual Component Operations
 *
 * GET    /api/admin/components/:lcsc - Get component by LCSC part number
 * PUT    /api/admin/components/:lcsc - Update component
 * DELETE /api/admin/components/:lcsc - Delete component
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
// GET - Get component by LCSC part number
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const lcsc = params.lcsc

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!lcsc) {
    return Response.json({ error: 'LCSC part number is required' }, { status: 400 })
  }

  try {
    const row = await env.DB.prepare('SELECT * FROM jlcpcb_components WHERE lcsc_part_number = ?')
      .bind(lcsc)
      .first<JlcpcbComponentRow>()

    if (!row) {
      return Response.json({ error: 'Component not found' }, { status: 404 })
    }

    await logger.debug('api', 'JLCPCB component retrieved', { lcsc })

    return Response.json({ component: rowToComponent(row) })
  } catch (error) {
    await logger.error('api', 'Failed to get JLCPCB component', { error: String(error), lcsc })
    return Response.json({ error: 'Failed to get component' }, { status: 500 })
  }
}

// =============================================================================
// PUT - Update component
// =============================================================================

interface UpdateComponentRequest {
  manufacturerPartNumber?: string | null
  description?: string | null
  footprint?: string | null
  rotationOffset?: number
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const lcsc = params.lcsc

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!lcsc) {
    return Response.json({ error: 'LCSC part number is required' }, { status: 400 })
  }

  try {
    const body = (await context.request.json()) as UpdateComponentRequest

    // Check component exists
    const existing = await env.DB.prepare('SELECT * FROM jlcpcb_components WHERE lcsc_part_number = ?')
      .bind(lcsc)
      .first<JlcpcbComponentRow>()

    if (!existing) {
      return Response.json({ error: 'Component not found' }, { status: 404 })
    }

    const now = new Date().toISOString()

    await env.DB.prepare(
      `UPDATE jlcpcb_components
       SET manufacturer_part_number = ?,
           description = ?,
           footprint = ?,
           rotation_offset = ?,
           updated_at = ?
       WHERE lcsc_part_number = ?`
    )
      .bind(
        body.manufacturerPartNumber !== undefined ? body.manufacturerPartNumber : existing.manufacturer_part_number,
        body.description !== undefined ? body.description : existing.description,
        body.footprint !== undefined ? body.footprint : existing.footprint,
        body.rotationOffset !== undefined ? body.rotationOffset : existing.rotation_offset,
        now,
        lcsc
      )
      .run()

    // Fetch updated component
    const updated = await env.DB.prepare('SELECT * FROM jlcpcb_components WHERE lcsc_part_number = ?')
      .bind(lcsc)
      .first<JlcpcbComponentRow>()

    if (!updated) {
      return Response.json({ error: 'Failed to retrieve updated component' }, { status: 500 })
    }

    await logger.info('api', 'JLCPCB component updated', { lcsc })

    return Response.json({ component: rowToComponent(updated) })
  } catch (error) {
    await logger.error('api', 'Failed to update JLCPCB component', { error: String(error), lcsc })
    return Response.json({ error: 'Failed to update component' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Delete component
// =============================================================================

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const lcsc = params.lcsc

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!lcsc) {
    return Response.json({ error: 'LCSC part number is required' }, { status: 400 })
  }

  try {
    // Check component exists
    const existing = await env.DB.prepare('SELECT * FROM jlcpcb_components WHERE lcsc_part_number = ?')
      .bind(lcsc)
      .first<JlcpcbComponentRow>()

    if (!existing) {
      return Response.json({ error: 'Component not found' }, { status: 404 })
    }

    await env.DB.prepare('DELETE FROM jlcpcb_components WHERE lcsc_part_number = ?').bind(lcsc).run()

    await logger.info('api', 'JLCPCB component deleted', { lcsc })

    return Response.json({ success: true })
  } catch (error) {
    await logger.error('api', 'Failed to delete JLCPCB component', { error: String(error), lcsc })
    return Response.json({ error: 'Failed to delete component' }, { status: 500 })
  }
}
