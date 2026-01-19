/**
 * Build-time blog manifest generator
 *
 * Scans /public/blogs/blog[N]/blog.md files and generates a manifest JSON.
 * Only metadata is stored - markdown is fetched and rendered client-side.
 *
 * Run with: pnpm build:blogs
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

const BLOGS_DIR = path.join(__dirname, '../public/blogs')
const OUTPUT_MANIFEST = path.join(__dirname, '../src/data/blog-manifest.json')

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

// Ensure output directory exists
function ensureDirectories() {
  const dataDir = path.dirname(OUTPUT_MANIFEST)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

// Extract title from markdown (first # heading)
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : 'Untitled'
}

// Extract date from markdown (looks for **Date**: or **Date:** pattern)
function extractDate(content: string): string {
  const match = content.match(/\*\*Date\*\*:?\s*(.+)$/m)
  if (match) {
    return match[1].trim()
  }
  // Default to today if no date found
  return new Date().toISOString().split('T')[0]
}

// Find first image - either from markdown or first image file in directory
function findThumbnail(content: string, slug: string, blogDir: string): string | null {
  // First, look for markdown images: ![alt](path)
  const match = content.match(/!\[([^\]]*)\]\(([^)]+)\)/)
  if (match) {
    const imagePath = decodeURIComponent(match[2])
    if (!imagePath.startsWith('http')) {
      // Check if file exists
      const srcPath = path.join(blogDir, imagePath)
      if (fs.existsSync(srcPath)) {
        return `/blogs/${slug}/${imagePath}`
      }
    }
    return imagePath // External URL
  }

  // Fallback: find first image file in directory
  try {
    const files = fs.readdirSync(blogDir)
    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (IMAGE_EXTENSIONS.includes(ext)) {
        return `/blogs/${slug}/${file}`
      }
    }
  } catch {
    // Directory read failed
  }

  return null
}

// Generate excerpt from content (first ~200 chars of non-heading text)
function extractExcerpt(content: string): string {
  const lines = content.split('\n')
  const textLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines, headings, date lines
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('**Date') ||
      trimmed.startsWith('---')
    ) {
      continue
    }
    // Skip image-only lines
    if (/^!\[/.test(trimmed)) continue

    textLines.push(trimmed)
    if (textLines.join(' ').length > 200) break
  }

  const text = textLines.join(' ')
  if (text.length > 200) {
    return text.slice(0, 197) + '...'
  }
  return text
}

// Calculate reading time (rough estimate: 200 words per minute)
function calculateReadingTime(content: string): number {
  const words = content.split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

// Parse blog number from directory name (e.g., "blog0001" -> 1)
function parseBlogNumber(dirName: string): number {
  const match = dirName.match(/blog(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

// Process a single blog directory
function processBlog(dirName: string): BlogEntry | null {
  const blogDir = path.join(BLOGS_DIR, dirName)
  const blogFile = path.join(blogDir, 'blog.md')

  if (!fs.existsSync(blogFile)) {
    console.error(`  Warning: No blog.md found in ${dirName}`)
    return null
  }

  const content = fs.readFileSync(blogFile, 'utf-8')

  const slug = dirName // e.g., "blog0001"
  const number = parseBlogNumber(dirName)

  const title = extractTitle(content)
  const date = extractDate(content)
  const excerpt = extractExcerpt(content)
  const thumbnailPath = findThumbnail(content, slug, blogDir)
  const readingTime = calculateReadingTime(content)
  const markdownPath = `/blogs/${slug}/blog.md`

  return {
    slug,
    number,
    title,
    date,
    excerpt,
    thumbnailPath,
    markdownPath,
    readingTime,
  }
}

// Main build function
function buildManifest() {
  console.log('Building blog manifest...')

  ensureDirectories()

  // Get all blog directories (blog0001, blog0004, etc.)
  const dirs = fs.readdirSync(BLOGS_DIR).filter((f) => {
    const fullPath = path.join(BLOGS_DIR, f)
    return fs.statSync(fullPath).isDirectory() && f.startsWith('blog')
  })

  console.log(`Found ${dirs.length} blog directories`)

  const entries: BlogEntry[] = []

  for (const dir of dirs) {
    try {
      const entry = processBlog(dir)
      if (entry) {
        entries.push(entry)
        console.log(`  Processed: ${dir} -> "${entry.title}"`)
      }
    } catch (error) {
      console.error(`  Error processing ${dir}:`, error)
    }
  }

  // Sort by number descending (newest first)
  entries.sort((a, b) => b.number - a.number)

  const manifest: BlogManifest = {
    generatedAt: new Date().toISOString(),
    entries,
  }

  // Write manifest
  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2))

  console.log(`\nManifest written to ${OUTPUT_MANIFEST}`)
  console.log(`Total blogs: ${entries.length}`)
}

// Run
buildManifest()
