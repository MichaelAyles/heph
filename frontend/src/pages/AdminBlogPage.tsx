/**
 * Admin Blog Page
 *
 * Manage blog visibility and customization.
 * Admin only - requires authentication and admin privileges.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Search,
  Eye,
  EyeOff,
  Edit,
  ExternalLink,
  Filter,
  FileText,
  Clock,
  Calendar,
} from 'lucide-react'
import { BlogSettingsModal } from '@/components/admin/BlogSettingsModal'

// =============================================================================
// TYPES
// =============================================================================

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

interface AdminBlogListResponse {
  blogs: AdminBlogEntry[]
  total: number
  generatedAt: string | null
}

type FilterType = 'all' | 'published' | 'hidden'

// =============================================================================
// API
// =============================================================================

async function fetchAdminBlogs(): Promise<AdminBlogListResponse> {
  const response = await fetch('/api/admin/blog')
  if (!response.ok) {
    throw new Error('Failed to fetch blogs')
  }
  return response.json()
}

async function toggleBlogPublished(slug: string, isPublished: boolean): Promise<void> {
  const response = await fetch('/api/admin/blog', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, isPublished }),
  })
  if (!response.ok) {
    throw new Error('Failed to update blog')
  }
}

// =============================================================================
// COMPONENTS
// =============================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-4">
        <FileText className="w-10 h-10 text-surface-500" strokeWidth={1} />
      </div>
      <h2 className="text-xl font-semibold text-steel mb-2">No Blogs Found</h2>
      <p className="text-steel-dim max-w-md">
        Run <code className="text-copper">pnpm build:blogs</code> to generate the blog manifest.
      </p>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AdminBlogPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [editingBlog, setEditingBlog] = useState<AdminBlogEntry | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-blog-list'],
    queryFn: fetchAdminBlogs,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ slug, isPublished }: { slug: string; isPublished: boolean }) =>
      toggleBlogPublished(slug, isPublished),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-list'] })
    },
  })

  // Filter blogs
  const filteredBlogs = data?.blogs.filter((blog) => {
    // Search filter
    const matchesSearch =
      blog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      blog.slug.toLowerCase().includes(searchQuery.toLowerCase())

    // Published filter
    const matchesFilter =
      filter === 'all' ||
      (filter === 'published' && blog.isPublished) ||
      (filter === 'hidden' && !blog.isPublished)

    return matchesSearch && matchesFilter
  })

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-700 bg-surface-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-steel">Blog Management</h1>
            <p className="text-sm text-steel-dim mt-1">
              {data?.total || 0} blog posts
              {data?.generatedAt && (
                <span className="ml-2">
                  (generated {new Date(data.generatedAt).toLocaleDateString()})
                </span>
              )}
            </p>
          </div>
          <a
            href="/blog"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm text-steel-dim hover:text-copper transition-colors"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
            View Public Blog
          </a>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-700">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500"
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Search blogs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-800 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-500" strokeWidth={1.5} />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="px-3 py-2 text-sm bg-surface-800 border border-surface-700 text-steel focus:outline-none focus:border-copper/50"
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <LoadingState />}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-400">Failed to load blogs</p>
          </div>
        )}

        {!isLoading && !error && filteredBlogs?.length === 0 && <EmptyState />}

        {!isLoading && !error && filteredBlogs && filteredBlogs.length > 0 && (
          <div className="divide-y divide-surface-700">
            {filteredBlogs.map((blog) => (
              <div key={blog.slug} className="px-6 py-4 hover:bg-surface-900/50 transition-colors">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-24 h-16 flex-shrink-0 bg-surface-800 overflow-hidden">
                    {blog.thumbnailPath ? (
                      <img
                        src={blog.thumbnailPath}
                        alt={blog.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <FileText className="w-6 h-6 text-surface-600" strokeWidth={1} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-steel truncate">
                          {blog.title}
                          {blog.hasOverrides && (
                            <span className="ml-2 text-xs text-copper">(customized)</span>
                          )}
                        </h3>
                        <p className="text-sm text-steel-dim truncate mt-0.5">{blog.excerpt}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Toggle visibility */}
                        <button
                          onClick={() =>
                            toggleMutation.mutate({
                              slug: blog.slug,
                              isPublished: !blog.isPublished,
                            })
                          }
                          disabled={toggleMutation.isPending}
                          className={`p-2 rounded transition-colors ${
                            blog.isPublished
                              ? 'text-emerald-400 hover:bg-emerald-400/10'
                              : 'text-surface-500 hover:bg-surface-700'
                          }`}
                          title={
                            blog.isPublished
                              ? 'Published (click to hide)'
                              : 'Hidden (click to publish)'
                          }
                        >
                          {blog.isPublished ? (
                            <Eye className="w-4 h-4" strokeWidth={1.5} />
                          ) : (
                            <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => setEditingBlog(blog)}
                          className="p-2 text-steel-dim hover:text-copper hover:bg-copper/10 rounded transition-colors"
                          title="Edit settings"
                        >
                          <Edit className="w-4 h-4" strokeWidth={1.5} />
                        </button>

                        {/* View */}
                        <a
                          href={`/blog/${blog.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-steel-dim hover:text-steel hover:bg-surface-700 rounded transition-colors"
                          title="View blog post"
                        >
                          <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                        </a>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                      <span className="font-mono">{blog.slug}</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" strokeWidth={1.5} />
                        {blog.date}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" strokeWidth={1.5} />
                        {blog.readingTime} min read
                      </div>
                      {blog.sortOrder !== null && (
                        <span className="text-copper">Order: {blog.sortOrder}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingBlog && <BlogSettingsModal blog={editingBlog} onClose={() => setEditingBlog(null)} />}
    </div>
  )
}

export default AdminBlogPage
