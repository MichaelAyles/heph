/**
 * Public Blog Page
 *
 * Displays the list of published blog posts.
 * Public access - no authentication required.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, FileText, ExternalLink, Rss } from 'lucide-react'
import { BlogCard, type BlogCardProps } from '@/components/blog/BlogCard'

// =============================================================================
// TYPES
// =============================================================================

interface BlogListResponse {
  blogs: BlogCardProps[]
  total: number
}

// =============================================================================
// API
// =============================================================================

async function fetchBlogs(): Promise<BlogListResponse> {
  const response = await fetch('/api/blog')
  if (!response.ok) {
    throw new Error('Failed to fetch blogs')
  }
  return response.json()
}

// =============================================================================
// COMPONENTS
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-4">
        <FileText className="w-10 h-10 text-surface-500" strokeWidth={1} />
      </div>
      <h2 className="text-xl font-semibold text-steel mb-2">No Blog Posts Yet</h2>
      <p className="text-steel-dim max-w-md">
        Check back soon for updates on PHAESTUS development.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BlogPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['blog-list'],
    queryFn: fetchBlogs,
  })

  // Filter blogs by search query
  const filteredBlogs = data?.blogs.filter(
    (blog) =>
      blog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blog.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="border-b border-surface-700 bg-surface-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <img src="/logo.png" alt="Phaestus" className="h-8 w-auto" />
                <span className="text-lg font-bold text-steel">PHAESTUS</span>
              </Link>
              <span className="text-surface-500">|</span>
              <h1 className="text-lg font-semibold text-steel">Dev Blog</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/gallery"
                className="text-sm text-steel-dim hover:text-steel transition-colors"
              >
                Gallery
              </Link>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-copper hover:text-copper-light transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-surface-900 border-b border-surface-700">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h2 className="text-3xl font-bold text-steel mb-3">Development Blog</h2>
          <p className="text-lg text-steel-dim mb-6 max-w-2xl">
            Follow along with the development of PHAESTUS - insights, challenges, and
            technical deep-dives into building an AI-powered hardware design platform.
          </p>

          {/* Stats */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 text-copper">
              <FileText className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-2xl font-bold">{data?.total || 0}</span>
              <span className="text-steel-dim text-sm">Posts</span>
            </div>
            <div className="flex items-center gap-2 text-copper">
              <Rss className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-steel-dim text-sm">Regular Updates</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500"
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-900 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
          </div>
        </div>

        {/* Blog Grid */}
        {isLoading && <LoadingState />}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-400">Failed to load blog posts</p>
          </div>
        )}

        {!isLoading && !error && filteredBlogs?.length === 0 && <EmptyState />}

        {!isLoading && !error && filteredBlogs && filteredBlogs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBlogs.map((blog) => (
              <BlogCard key={blog.slug} {...blog} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-700 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-surface-500">
              <span>Built with PHAESTUS</span>
              <a
                href="https://github.com/MichaelAyles/heph"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-steel transition-colors"
              >
                <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                GitHub
              </a>
            </div>
            <Link
              to="/login"
              className="px-4 py-2 bg-copper-gradient text-ash font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start Building
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default BlogPage
