/**
 * PUT /api/admin/langgraph/positions
 *
 * Updates node positions in the graph visualization.
 * Positions are stored in orchestrator_prompts table.
 *
 * Request body:
 * {
 *   positions: Array<{ nodeName: string, x: number, y: number }>
 * }
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'

interface PositionUpdate {
  nodeName: string
  x: number
  y: number
}

interface UpdatePositionsRequest {
  positions: PositionUpdate[]
}

export const onRequestPut: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data
  const { DB } = context.env

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: UpdatePositionsRequest
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.positions || !Array.isArray(body.positions)) {
    return Response.json({ error: 'positions array is required' }, { status: 400 })
  }

  // Validate positions
  for (const pos of body.positions) {
    if (!pos.nodeName || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      return Response.json(
        { error: `Invalid position for node: ${pos.nodeName}` },
        { status: 400 }
      )
    }
  }

  try {
    // Update positions in batch
    const stmt = DB.prepare(
      `UPDATE orchestrator_prompts
       SET position_x = ?, position_y = ?, updated_at = datetime('now')
       WHERE node_name = ?`
    )

    const updates = body.positions.map((pos) =>
      stmt.bind(pos.x, pos.y, pos.nodeName)
    )

    await DB.batch(updates)

    return Response.json({
      success: true,
      updated: body.positions.length,
    })
  } catch (error) {
    console.error('Failed to update positions:', error)
    return Response.json(
      { error: 'Failed to update positions' },
      { status: 500 }
    )
  }
}
