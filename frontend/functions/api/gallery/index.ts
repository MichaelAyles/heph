/**
 * Public Gallery API
 *
 * Returns completed projects that are marked as public (featured).
 * No authentication required.
 */

import type { Env } from '../../env'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface GalleryProject {
  id: string
  name: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  authorUsername: string
  specSummary: string | null
  thumbnailUrl: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context
  const url = new URL(context.request.url)

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // Get completed projects that are published to the gallery
  const result = await env.DB.prepare(
    `
    SELECT
      p.id,
      p.name,
      p.description,
      p.status,
      p.spec,
      p.created_at,
      p.updated_at,
      p.show_author,
      u.username as author_username
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'complete' AND p.is_public = 1
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
    `
  )
    .bind(limit, offset)
    .all()

  // Get total count of public projects
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM projects WHERE status = 'complete' AND is_public = 1`
  ).first<{ count: number }>()

  const projects: GalleryProject[] = result.results.map((row) => {
    // Parse spec to get summary and thumbnail
    let specSummary: string | null = null
    let thumbnailUrl: string | null = null

    try {
      const spec = JSON.parse(row.spec as string)
      if (spec.finalSpec) {
        specSummary = spec.finalSpec.summary || null
      }
      // Get the first blueprint as thumbnail
      if (spec.blueprints && spec.blueprints.length > 0) {
        thumbnailUrl = spec.blueprints[spec.selectedBlueprint || 0]?.url || spec.blueprints[0]?.url
      }
    } catch {
      // Ignore parse errors
    }

    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      authorUsername: row.show_author ? (row.author_username as string) : 'Anonymous',
      specSummary,
      thumbnailUrl,
    }
  })

  return Response.json({
    projects,
    total: countResult?.count || 0,
    limit,
    offset,
  })
}
