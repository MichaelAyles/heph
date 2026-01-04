/**
 * Serve block KiCad files from R2 storage
 *
 * GET /api/blocks/:slug/files/:filename
 * Example: /api/blocks/mcu-esp32c6/files/mcu-esp32c6.kicad_sch
 */

interface Env {
  DB: D1Database
  STORAGE: R2Bucket
}

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

const CONTENT_TYPES: Record<string, string> = {
  '.kicad_sch': 'application/x-kicad-schematic',
  '.kicad_pcb': 'application/x-kicad-pcb',
  '.step': 'model/step',
  '.stp': 'model/step',
  '.png': 'image/png',
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context
  const slug = params.slug as string
  const pathParts = params.path as string | string[] | undefined

  // Handle array or string path
  const filename = Array.isArray(pathParts) ? pathParts.join('/') : pathParts || ''

  if (!filename) {
    return Response.json({ error: 'Filename required' }, { status: 400 })
  }

  // Verify block exists
  const block = await env.DB.prepare('SELECT slug FROM pcb_blocks WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first()

  if (!block) {
    return Response.json({ error: 'Block not found' }, { status: 404 })
  }

  // Fetch from R2
  const key = `blocks/${slug}/${filename}`
  const object = await env.STORAGE.get(key)

  if (!object) {
    return Response.json({ error: 'File not found' }, { status: 404 })
  }

  // Determine content type from extension
  const ext = filename.substring(filename.lastIndexOf('.'))
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

  return new Response(object.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
