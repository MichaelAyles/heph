/**
 * Admin Blog List API
 *
 * GET /api/admin/blog - List all blogs with settings (admin only)
 * PATCH /api/admin/blog - Update blog settings
 */

import type { Env, UserData } from '../../../env'

interface BlogEntry {
  slug: string
  number: number
  title: string
  date: string
  excerpt: string
  thumbnailPath: string | null
  htmlContent: string
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

interface AdminBlogEntry {
  slug: string
  number: number
  title: string
  originalTitle: string
  date: string
  excerpt: string
  originalExcerpt: string
  thumbnailPath: string | null
  originalThumbnailPath: string | null
  readingTime: number
  isPublished: boolean
  sortOrder: number | null
  hasOverrides: boolean
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

// GET /api/admin/blog - List all blogs with settings
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as UserData

  // Check admin
  if (!user?.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blogManifest = await getManifest()

  // If no manifest, return empty list
  if (!blogManifest?.entries) {
    return Response.json({ blogs: [], total: 0, generatedAt: null })
  }

  // Get all blog settings from database
  const settingsResult = await env.DB.prepare(
    'SELECT * FROM blog_settings'
  ).all<BlogSettings>()

  const settingsMap = new Map<string, BlogSettings>()
  for (const setting of settingsResult.results || []) {
    settingsMap.set(setting.blog_slug, setting)
  }

  // Merge manifest entries with settings
  const blogs: AdminBlogEntry[] = []

  for (const entry of blogManifest.entries) {
    const settings = settingsMap.get(entry.slug)

    const hasOverrides = !!(
      settings?.custom_title ||
      settings?.custom_description ||
      settings?.custom_thumbnail ||
      settings?.sort_order != null
    )

    blogs.push({
      slug: entry.slug,
      number: entry.number,
      title: settings?.custom_title || entry.title,
      originalTitle: entry.title,
      date: entry.date,
      excerpt: settings?.custom_description || entry.excerpt,
      originalExcerpt: entry.excerpt,
      thumbnailPath: settings?.custom_thumbnail || entry.thumbnailPath,
      originalThumbnailPath: entry.thumbnailPath,
      readingTime: entry.readingTime,
      isPublished: settings?.is_published !== 0,
      sortOrder: settings?.sort_order ?? null,
      hasOverrides,
    })
  }

  // Sort by number descending (newest first)
  blogs.sort((a, b) => b.number - a.number)

  return Response.json({
    blogs,
    total: blogs.length,
    generatedAt: blogManifest.generatedAt,
  })
}

// PATCH /api/admin/blog - Update blog settings
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as UserData

  // Check admin
  if (!user?.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json<{
    slug: string
    isPublished?: boolean
    customTitle?: string | null
    customDescription?: string | null
    customThumbnail?: string | null
    sortOrder?: number | null
  }>()

  if (!body.slug) {
    return Response.json({ error: 'slug is required' }, { status: 400 })
  }

  // Check if settings exist
  const existing = await env.DB.prepare(
    'SELECT id FROM blog_settings WHERE blog_slug = ?'
  )
    .bind(body.slug)
    .first<{ id: string }>()

  if (existing) {
    // Update existing settings
    await env.DB.prepare(
      `UPDATE blog_settings SET
        is_published = COALESCE(?, is_published),
        custom_title = ?,
        custom_description = ?,
        custom_thumbnail = ?,
        sort_order = ?,
        updated_at = datetime('now')
       WHERE blog_slug = ?`
    )
      .bind(
        body.isPublished !== undefined ? (body.isPublished ? 1 : 0) : null,
        body.customTitle ?? null,
        body.customDescription ?? null,
        body.customThumbnail ?? null,
        body.sortOrder ?? null,
        body.slug
      )
      .run()
  } else {
    // Insert new settings
    await env.DB.prepare(
      `INSERT INTO blog_settings (blog_slug, is_published, custom_title, custom_description, custom_thumbnail, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.slug,
        body.isPublished !== undefined ? (body.isPublished ? 1 : 0) : 1,
        body.customTitle ?? null,
        body.customDescription ?? null,
        body.customThumbnail ?? null,
        body.sortOrder ?? null
      )
      .run()
  }

  return Response.json({ success: true })
}
