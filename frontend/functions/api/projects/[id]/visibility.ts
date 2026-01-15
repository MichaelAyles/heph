/**
 * Project Visibility API
 *
 * Toggle gallery publishing and author visibility.
 */

import type { Env } from '../../../env'

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

interface VisibilityRequest {
  isPublic?: boolean
  showAuthor?: boolean
}

interface VisibilityResponse {
  isPublic: boolean
  showAuthor: boolean
}

// GET /api/projects/:id/visibility - Get current visibility settings
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const projectId = params.id as string

  try {
    const row = await env.DB.prepare(
      'SELECT is_public, show_author FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, user.id)
      .first()

    if (!row) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    return Response.json({
      isPublic: row.is_public === 1,
      showAuthor: row.show_author === 1,
    } as VisibilityResponse)
  } catch (error) {
    console.error('Get visibility error:', error)
    return Response.json(
      { error: 'Failed to get visibility settings' },
      { status: 500 }
    )
  }
}

// PATCH /api/projects/:id/visibility - Update visibility settings
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { env, data, params, request } = context
  const user = data.user as User
  const projectId = params.id as string

  try {
    // Verify ownership and get current status
    const existing = await env.DB.prepare(
      'SELECT id, status, is_public, show_author FROM projects WHERE id = ? AND user_id = ?'
    )
      .bind(projectId, user.id)
      .first()

    if (!existing) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    // Parse request body
    const body = (await request.json()) as VisibilityRequest

    // Validate: can only publish completed projects
    if (body.isPublic === true && existing.status !== 'complete') {
      return Response.json(
        { error: 'Only completed projects can be published to the gallery' },
        { status: 400 }
      )
    }

    // Build update query
    const updates: string[] = []
    const values: (number | string)[] = []

    if (typeof body.isPublic === 'boolean') {
      updates.push('is_public = ?')
      values.push(body.isPublic ? 1 : 0)
    }

    if (typeof body.showAuthor === 'boolean') {
      updates.push('show_author = ?')
      values.push(body.showAuthor ? 1 : 0)
    }

    if (updates.length === 0) {
      return Response.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    updates.push('updated_at = datetime(\'now\')')
    values.push(projectId, user.id)

    await env.DB.prepare(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    )
      .bind(...values)
      .run()

    // Return updated values
    const updated = await env.DB.prepare(
      'SELECT is_public, show_author FROM projects WHERE id = ?'
    )
      .bind(projectId)
      .first()

    return Response.json({
      isPublic: updated?.is_public === 1,
      showAuthor: updated?.show_author === 1,
    } as VisibilityResponse)
  } catch (error) {
    console.error('Update visibility error:', error)
    return Response.json(
      { error: 'Failed to update visibility settings' },
      { status: 500 }
    )
  }
}
