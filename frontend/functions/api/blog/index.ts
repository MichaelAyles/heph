/**
 * Public Blog List API
 *
 * GET /api/blog - List published blogs
 * Merges static manifest with database settings for visibility/customization
 */

import type { Env } from '../../env'

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
  blog_slug: string
  is_published: number
  custom_thumbnail: string | null
  custom_title: string | null
  custom_description: string | null
  sort_order: number | null
}

interface PublicBlogEntry {
  slug: string
  number: number
  title: string
  date: string
  excerpt: string
  thumbnailPath: string | null
  readingTime: number
}

// Lazy load manifest to avoid top-level await
let manifestCache: BlogManifest | null = null
async function getManifest(): Promise<BlogManifest | null> {
  if (manifestCache !== null) return manifestCache
  try {
    const module = await import('../../../src/data/blog-manifest.json')
    manifestCache = module.default || module
    return manifestCache
  } catch {
    return null
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const blogManifest = await getManifest()

  // If no manifest, return empty list
  if (!blogManifest?.entries) {
    return Response.json({ blogs: [], total: 0 })
  }

  // Get all blog settings from database
  const settingsResult = await env.DB.prepare(
    'SELECT blog_slug, is_published, custom_thumbnail, custom_title, custom_description, sort_order FROM blog_settings'
  ).all<BlogSettings>()

  const settingsMap = new Map<string, BlogSettings>()
  for (const setting of settingsResult.results || []) {
    settingsMap.set(setting.blog_slug, setting)
  }

  // Merge manifest entries with settings
  const blogs: PublicBlogEntry[] = []

  for (const entry of blogManifest.entries) {
    const settings = settingsMap.get(entry.slug)

    // Check if unpublished (default is published if no setting exists)
    if (settings?.is_published === 0) {
      continue
    }

    blogs.push({
      slug: entry.slug,
      number: entry.number,
      title: settings?.custom_title || entry.title,
      date: entry.date,
      excerpt: settings?.custom_description || entry.excerpt,
      thumbnailPath: settings?.custom_thumbnail || entry.thumbnailPath,
      readingTime: entry.readingTime,
    })
  }

  // Sort by sort_order if set, otherwise by number (descending)
  blogs.sort((a, b) => {
    const settingsA = settingsMap.get(a.slug)
    const settingsB = settingsMap.get(b.slug)

    // If both have sort_order, use that
    if (settingsA?.sort_order != null && settingsB?.sort_order != null) {
      return settingsA.sort_order - settingsB.sort_order
    }
    // If only one has sort_order, it comes first
    if (settingsA?.sort_order != null) return -1
    if (settingsB?.sort_order != null) return 1

    // Default: by number descending (newest first)
    return b.number - a.number
  })

  return Response.json({
    blogs,
    total: blogs.length,
  })
}
