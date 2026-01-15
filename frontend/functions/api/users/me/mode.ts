/**
 * PUT /api/users/me/mode
 * Update current user's control mode
 */

import type { Env } from '../../../env'

type ControlMode = 'vibe_it' | 'fix_it' | 'design_it'

const VALID_MODES: ControlMode[] = ['vibe_it', 'fix_it', 'design_it']

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data } = context

  // Middleware sets user in data
  const user = data.user as User | undefined
  if (!user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await context.request.json()) as { controlMode?: string }
    const { controlMode } = body

    if (!controlMode || !VALID_MODES.includes(controlMode as ControlMode)) {
      return Response.json(
        { error: 'Invalid control mode. Must be one of: vibe_it, fix_it, design_it' },
        { status: 400 }
      )
    }

    await env.DB.prepare('UPDATE users SET control_mode = ? WHERE id = ?')
      .bind(controlMode, user.id)
      .run()

    return Response.json({ success: true, controlMode })
  } catch (error) {
    console.error('Update control mode error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
