/**
 * Blog Settings Modal
 *
 * Modal for editing blog settings (title, description, thumbnail, visibility)
 */

import { useState, useEffect } from 'react'
import { X, RotateCcw, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface BlogSettingsModalProps {
  blog: {
    slug: string
    title: string
    originalTitle: string
    excerpt: string
    originalExcerpt: string
    thumbnailPath: string | null
    originalThumbnailPath: string | null
    isPublished: boolean
    sortOrder: number | null
  }
  onClose: () => void
}

interface UpdateBlogSettings {
  slug: string
  isPublished?: boolean
  customTitle?: string | null
  customDescription?: string | null
  customThumbnail?: string | null
  sortOrder?: number | null
}

async function updateBlogSettings(settings: UpdateBlogSettings): Promise<void> {
  const response = await fetch('/api/admin/blog', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    throw new Error('Failed to update blog settings')
  }
}

async function resetBlogSettings(slug: string): Promise<void> {
  const response = await fetch(`/api/admin/blog/${slug}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to reset blog settings')
  }
}

export function BlogSettingsModal({ blog, onClose }: BlogSettingsModalProps) {
  const queryClient = useQueryClient()

  const [title, setTitle] = useState(blog.title)
  const [description, setDescription] = useState(blog.excerpt)
  const [thumbnail, setThumbnail] = useState(blog.thumbnailPath || '')
  const [isPublished, setIsPublished] = useState(blog.isPublished)
  const [sortOrder, setSortOrder] = useState(blog.sortOrder?.toString() || '')

  // Track if values differ from original
  const hasCustomTitle = title !== blog.originalTitle
  const hasCustomDescription = description !== blog.originalExcerpt
  const hasCustomThumbnail = thumbnail !== (blog.originalThumbnailPath || '')

  const updateMutation = useMutation({
    mutationFn: updateBlogSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-list'] })
      onClose()
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetBlogSettings(blog.slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-list'] })
      onClose()
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      slug: blog.slug,
      isPublished,
      customTitle: hasCustomTitle ? title : null,
      customDescription: hasCustomDescription ? description : null,
      customThumbnail: hasCustomThumbnail ? thumbnail : null,
      sortOrder: sortOrder ? parseInt(sortOrder, 10) : null,
    })
  }

  const handleReset = () => {
    if (confirm('Reset all settings to defaults? This will restore the original title, description, and thumbnail.')) {
      resetMutation.mutate()
    }
  }

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const isLoading = updateMutation.isPending || resetMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ash/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-900 border border-surface-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-steel">Edit Blog Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-steel-dim hover:text-steel transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Slug (read-only) */}
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-2">
              Slug
            </label>
            <div className="px-3 py-2 bg-surface-800 border border-surface-700 text-steel-dim font-mono text-sm">
              {blog.slug}
            </div>
          </div>

          {/* Published Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-steel">Published</label>
            <button
              onClick={() => setIsPublished(!isPublished)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isPublished ? 'bg-copper' : 'bg-surface-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  isPublished ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-2">
              Custom Title
              {hasCustomTitle && (
                <span className="ml-2 text-xs text-copper">(modified)</span>
              )}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={blog.originalTitle}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
            {hasCustomTitle && (
              <button
                onClick={() => setTitle(blog.originalTitle)}
                className="mt-1 text-xs text-steel-dim hover:text-copper"
              >
                Reset to original
              </button>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-2">
              Custom Description
              {hasCustomDescription && (
                <span className="ml-2 text-xs text-copper">(modified)</span>
              )}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={blog.originalExcerpt}
              rows={3}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50 resize-none"
            />
            {hasCustomDescription && (
              <button
                onClick={() => setDescription(blog.originalExcerpt)}
                className="mt-1 text-xs text-steel-dim hover:text-copper"
              >
                Reset to original
              </button>
            )}
          </div>

          {/* Thumbnail */}
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-2">
              Custom Thumbnail URL
              {hasCustomThumbnail && (
                <span className="ml-2 text-xs text-copper">(modified)</span>
              )}
            </label>
            <input
              type="text"
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder={blog.originalThumbnailPath || 'No thumbnail'}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
            {thumbnail && (
              <div className="mt-2">
                <img
                  src={thumbnail}
                  alt="Thumbnail preview"
                  className="h-20 w-auto object-cover border border-surface-700"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            )}
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-2">
              Sort Order
              <span className="ml-2 text-xs text-surface-500">(lower = first)</span>
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Auto (by date)"
              className="w-32 px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-700">
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-steel-dim hover:text-steel transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
            Reset All
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-steel-dim hover:text-steel transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-copper-gradient text-ash font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BlogSettingsModal
