/**
 * Admin Users API
 * List and manage user approvals
 */

import type { Env } from '../../env'

interface User {
  id: string
  username: string
  display_name: string | null
  is_admin: number
  is_approved: number
  created_at: string
  last_login_at: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const filter = url.searchParams.get('filter') || 'pending'

  let query = 'SELECT id, username, display_name, is_admin, is_approved, created_at, last_login_at FROM users'

  if (filter === 'pending') {
    query += ' WHERE is_approved = 0'
  } else if (filter === 'approved') {
    query += ' WHERE is_approved = 1'
  }

  query += ' ORDER BY created_at DESC'

  const result = await env.DB.prepare(query).all<User>()

  return Response.json({ users: result.results })
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as { userId: string; isApproved: boolean }

  if (!body.userId) {
    return Response.json({ error: 'userId required' }, { status: 400 })
  }

  await env.DB.prepare('UPDATE users SET is_approved = ? WHERE id = ?')
    .bind(body.isApproved ? 1 : 0, body.userId)
    .run()

  return Response.json({ success: true })
}
