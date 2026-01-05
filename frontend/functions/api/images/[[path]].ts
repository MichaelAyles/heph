/**
 * GET /api/images/*
 * Serve images from R2 storage
 */

import type { Env } from '../../env'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context

  // Get the path from the catch-all parameter
  const pathSegments = params.path
  const key = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments

  if (!key) {
    return new Response('Not found', { status: 404 })
  }

  // Prevent path traversal attacks
  if (key.includes('..') || key.includes('\\')) {
    return new Response('Invalid path', { status: 400 })
  }

  try {
    const object = await env.STORAGE.get(key)

    if (!object) {
      return new Response('Image not found', { status: 404 })
    }

    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Error serving image:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
