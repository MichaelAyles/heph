/**
 * Admin Single Blog API
 *
 * GET /api/admin/blog/:slug - Get blog with full settings
 * DELETE /api/admin/blog/:slug - Reset blog to defaults (remove settings)
 */

import type { Env, UserData } from '../../../env'

interface BlogEntry {
  slug: string
  number: number
  title: string
  date: string
  excerpt: string
  thumbnailPath: string | null
  markdownPath: string
  readingTime: number
}

interface BlogManifest {
  generatedAt: string
  entries: BlogEntry[]
}

interface BlogSettings {
  id: string
  blog_slug: string
  is_published: number
  custom_thumbnail: string | null
  custom_title: string | null
  custom_description: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

// Lazy load manifest to avoid top-level await
let manifestCache: BlogManifest | null = null
async function getManifest(): Promise<BlogManifest | null> {
  if (manifestCache !== null) return manifestCache
  try {
    const module = await import('../../../../src/data/blog-manifest.json')
    manifestCache = module.default || module
    return manifestCache
  } catch {
    return null
  }
}

// GET /api/admin/blog/:slug - Get blog with full settings
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as UserData
  const slug = params.slug as string

  // Check admin
  if (!user?.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blogManifest = await getManifest()

  // If no manifest, return 404
  if (!blogManifest?.entries) {
    return Response.json({ error: 'Blog not found' }, { status: 404 })
  }

  // Find the blog entry
  const entry = blogManifest.entries.find((e) => e.slug === slug)
  if (!entry) {
    return Response.json({ error: 'Blog not found' }, { status: 404 })
  }

  // Get settings from database
  const settings = await env.DB.prepare('SELECT * FROM blog_settings WHERE blog_slug = ?')
    .bind(slug)
    .first<BlogSettings>()

  return Response.json({
    slug: entry.slug,
    number: entry.number,
    title: settings?.custom_title || entry.title,
    originalTitle: entry.title,
    date: entry.date,
    excerpt: settings?.custom_description || entry.excerpt,
    originalExcerpt: entry.excerpt,
    thumbnailPath: settings?.custom_thumbnail || entry.thumbnailPath,
    originalThumbnailPath: entry.thumbnailPath,
    markdownPath: entry.markdownPath,
    readingTime: entry.readingTime,
    isPublished: settings?.is_published !== 0,
    sortOrder: settings?.sort_order ?? null,
    settings: settings
      ? {
          id: settings.id,
          customTitle: settings.custom_title,
          customDescription: settings.custom_description,
          customThumbnail: settings.custom_thumbnail,
          sortOrder: settings.sort_order,
          createdAt: settings.created_at,
          updatedAt: settings.updated_at,
        }
      : null,
  })
}

// DELETE /api/admin/blog/:slug - Reset blog to defaults (remove settings)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as UserData
  const slug = params.slug as string

  // Check admin
  if (!user?.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete settings to reset to defaults
  await env.DB.prepare('DELETE FROM blog_settings WHERE blog_slug = ?').bind(slug).run()

  return Response.json({ success: true, message: 'Blog reset to defaults' })
}
