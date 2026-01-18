/**
 * Single Blog API
 *
 * GET /api/blog/:slug - Get a single blog post with full content
 * Returns 404 if blog is not published
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
}

interface FullBlogEntry {
  slug: string
  number: number
  title: string
  date: string
  excerpt: string
  thumbnailPath: string | null
  htmlContent: string
  readingTime: number
  prevSlug: string | null
  nextSlug: string | null
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
  const { env, params } = context
  const slug = params.slug as string

  const blogManifest = await getManifest()

  // If no manifest, return 404
  if (!blogManifest?.entries) {
    return Response.json({ error: 'Blog not found' }, { status: 404 })
  }

  // Find the blog entry
  const entryIndex = blogManifest.entries.findIndex((e) => e.slug === slug)
  if (entryIndex === -1) {
    return Response.json({ error: 'Blog not found' }, { status: 404 })
  }

  const entry = blogManifest.entries[entryIndex]

  // Check if unpublished in database
  const settings = await env.DB.prepare(
    'SELECT is_published, custom_thumbnail, custom_title, custom_description FROM blog_settings WHERE blog_slug = ?'
  )
    .bind(slug)
    .first<BlogSettings>()

  // If explicitly unpublished, return 404
  if (settings?.is_published === 0) {
    return Response.json({ error: 'Blog not found' }, { status: 404 })
  }

  // Find published neighbors for prev/next navigation
  // entries are already sorted by number descending (newest first)
  let prevSlug: string | null = null
  let nextSlug: string | null = null

  // Look for next published blog (older = higher index)
  for (let i = entryIndex + 1; i < blogManifest.entries.length; i++) {
    const neighborSlug = blogManifest.entries[i].slug
    const neighborSettings = await env.DB.prepare(
      'SELECT is_published FROM blog_settings WHERE blog_slug = ?'
    )
      .bind(neighborSlug)
      .first<{ is_published: number }>()

    if (neighborSettings?.is_published !== 0) {
      nextSlug = neighborSlug
      break
    }
  }

  // Look for prev published blog (newer = lower index)
  for (let i = entryIndex - 1; i >= 0; i--) {
    const neighborSlug = blogManifest.entries[i].slug
    const neighborSettings = await env.DB.prepare(
      'SELECT is_published FROM blog_settings WHERE blog_slug = ?'
    )
      .bind(neighborSlug)
      .first<{ is_published: number }>()

    if (neighborSettings?.is_published !== 0) {
      prevSlug = neighborSlug
      break
    }
  }

  const response: FullBlogEntry = {
    slug: entry.slug,
    number: entry.number,
    title: settings?.custom_title || entry.title,
    date: entry.date,
    excerpt: settings?.custom_description || entry.excerpt,
    thumbnailPath: settings?.custom_thumbnail || entry.thumbnailPath,
    htmlContent: entry.htmlContent,
    readingTime: entry.readingTime,
    prevSlug,
    nextSlug,
  }

  return Response.json(response)
}
