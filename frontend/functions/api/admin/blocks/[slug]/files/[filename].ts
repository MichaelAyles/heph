/**
 * Admin endpoint for managing individual block files
 *
 * DELETE /api/admin/blocks/:slug/files/:filename - Delete a file from R2 and update metadata
 */

import type { Env } from '../../../../../env.d'
import { createLogger } from '../../../../../lib/logger'

// Map from file key to files object property
const FILE_KEY_MAP: Record<string, string> = {
  schematic: 'schematic',
  pcb: 'pcb',
  stepModel: 'stepModel',
  step: 'stepModel',
  thumbnail: 'thumbnail',
  blockJson: 'blockJson',
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const slug = params.slug as string
  const filename = params.filename as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    // Get block from database
    const block = await env.DB.prepare('SELECT id, files FROM pcb_blocks WHERE slug = ?')
      .bind(slug)
      .first<{ id: string; files: string | null }>()

    if (!block) {
      return Response.json({ error: `Block "${slug}" not found` }, { status: 404 })
    }

    const files = block.files ? JSON.parse(block.files) : {}

    // Find which file key this filename corresponds to
    let fileKey: string | null = null
    for (const [key, value] of Object.entries(files)) {
      if (value === filename) {
        fileKey = key
        break
      }
    }

    if (!fileKey) {
      return Response.json({ error: `File "${filename}" not found in block` }, { status: 404 })
    }

    // Delete from R2
    const r2Key = `blocks/${slug}/${filename}`
    await env.STORAGE.delete(r2Key)

    // Update files in database
    delete files[fileKey]
    await env.DB.prepare(
      'UPDATE pcb_blocks SET files = ?, updated_at = ? WHERE slug = ?'
    )
      .bind(JSON.stringify(files), new Date().toISOString(), slug)
      .run()

    return Response.json({
      success: true,
      slug,
      deletedFile: filename,
      deletedKey: fileKey,
      message: `File "${filename}" deleted from block "${slug}"`,
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('api', 'Block file delete error', {
      error: error instanceof Error ? error.message : String(error),
      slug,
      filename,
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
