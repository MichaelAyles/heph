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

interface CreateProjectRequest {
  name: string
  description: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const url = new URL(context.request.url)

  const status = url.searchParams.get('status')
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const offset = parseInt(url.searchParams.get('offset') || '0')

  let query =
    'SELECT id, name, description, status, spec, created_at, updated_at FROM projects WHERE user_id = ?'
  const params: (string | number)[] = [user.id]

  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const result = await env.DB.prepare(query)
    .bind(...params)
    .all()

  // Get total count
  let countQuery = 'SELECT COUNT(*) as count FROM projects WHERE user_id = ?'
  const countParams: string[] = [user.id]
  if (status) {
    countQuery += ' AND status = ?'
    countParams.push(status)
  }
  const countResult = await env.DB.prepare(countQuery)
    .bind(...countParams)
    .first()

  const projects = result.results.map((row) => {
    let spec = null
    if (row.spec) {
      try {
        spec = typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec
      } catch {
        // Ignore parse errors
      }
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      spec,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return Response.json({
    projects,
    total: countResult?.count || 0,
    limit,
    offset,
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User

  try {
    const body = (await context.request.json()) as CreateProjectRequest
    const { name, description } = body

    if (!name?.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!description?.trim()) {
      return Response.json({ error: 'Description is required' }, { status: 400 })
    }
    // Enforce input limits to prevent DoS and ensure reasonable LLM token usage
    if (name.length > 100) {
      return Response.json({ error: 'Name must be 100 characters or less' }, { status: 400 })
    }
    if (description.length > 2000) {
      return Response.json({ error: 'Description must be 2000 characters or less' }, { status: 400 })
    }

    const id = crypto.randomUUID().replace(/-/g, '')
    const now = new Date().toISOString()

    // Create initial spec with description
    const spec = JSON.stringify({
      description: description.trim(),
      requirements: [],
      formFactor: null,
      blocks: [],
      decisions: [],
    })

    await env.DB.prepare(
      `
      INSERT INTO projects (id, user_id, name, description, status, spec, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
    `
    )
      .bind(id, user.id, name.trim(), description.trim(), spec, now, now)
      .run()

    return Response.json(
      {
        project: {
          id,
          name: name.trim(),
          description: description.trim(),
          status: 'draft',
          spec: JSON.parse(spec),
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create project error:', error)
    return Response.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
