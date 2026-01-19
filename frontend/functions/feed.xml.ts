/**
 * RSS Feed Generator for PHAESTUS Blog
 *
 * Generates an RSS 2.0 feed from the blog manifest.
 * Served at /feed.xml with caching for efficiency.
 */

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

// Import manifest directly - wrangler will bundle it
import manifest from '../src/data/blog-manifest.json'

const SITE_URL = 'https://phaestus.app'
const FEED_TITLE = 'PHAESTUS Development Blog'
const FEED_DESCRIPTION =
  'Development updates from PHAESTUS - an AI-powered hardware design platform that transforms natural language specifications into manufacturable hardware designs.'
const FEED_LANGUAGE = 'en-us'

/**
 * Convert blog date string to RFC 822 format for RSS
 * Input: "January 19, 2026"
 * Output: "Sun, 19 Jan 2026 00:00:00 GMT"
 */
function toRfc822Date(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toUTCString()
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generate RSS 2.0 XML from blog entries
 */
function generateRss(entries: BlogEntry[]): string {
  const now = new Date().toUTCString()

  const items = entries
    .slice(0, 20) // Limit to 20 most recent entries
    .map((entry) => {
      const link = `${SITE_URL}/blog/${entry.slug}`
      const description = escapeXml(entry.excerpt)
      const pubDate = toRfc822Date(entry.date)

      return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>${FEED_LANGUAGE}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`
}

export const onRequestGet: PagesFunction = async () => {
  const blogManifest = manifest as BlogManifest
  const rss = generateRss(blogManifest.entries)

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  })
}
