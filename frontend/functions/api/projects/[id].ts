import type { Env } from '../../env'

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
}

interface UpdateProjectRequest {
  name?: string
  description?: string
  status?: string
  spec?: object
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const projectId = params.id as string

  const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .bind(projectId, user.id)
    .first()

  if (!row) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  return Response.json({
    project: {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      spec: row.spec ? JSON.parse(row.spec as string) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const projectId = params.id as string

  // Verify ownership
  const existing = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .bind(projectId, user.id)
    .first()

  if (!existing) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    const body = (await context.request.json()) as UpdateProjectRequest
    const updates: string[] = []
    const values: (string | null)[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      values.push(body.description)
    }
    if (body.status !== undefined) {
      const validStatuses = ['draft', 'analyzing', 'designing', 'complete', 'error']
      if (!validStatuses.includes(body.status)) {
        return Response.json({ error: 'Invalid status' }, { status: 400 })
      }
      updates.push('status = ?')
      values.push(body.status)
    }
    if (body.spec !== undefined) {
      updates.push('spec = ?')
      values.push(JSON.stringify(body.spec))
    }

    if (updates.length === 0) {
      return Response.json({ error: 'No updates provided' }, { status: 400 })
    }

    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(projectId)

    await env.DB.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    // Fetch updated project
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?')
      .bind(projectId)
      .first()

    return Response.json({
      project: {
        id: row!.id,
        name: row!.name,
        description: row!.description,
        status: row!.status,
        spec: row!.spec ? JSON.parse(row!.spec as string) : null,
        createdAt: row!.created_at,
        updatedAt: row!.updated_at,
      },
    })
  } catch (error) {
    console.error('Update project error:', error)
    return Response.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const projectId = params.id as string

  const result = await env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .bind(projectId, user.id)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
