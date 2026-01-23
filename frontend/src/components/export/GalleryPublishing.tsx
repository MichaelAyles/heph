/**
 * GalleryPublishing - Controls for publishing project to gallery
 */

import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { Globe, User, ChevronRight, Loader2 } from 'lucide-react'
import type { VisibilitySettings } from './types'

interface GalleryPublishingProps {
  projectId: string
  visibility: VisibilitySettings | undefined
  isLoading: boolean
  isPending: boolean
  onTogglePublic: () => void
  onToggleShowAuthor: () => void
}

export function GalleryPublishing({
  projectId,
  visibility,
  isLoading,
  isPending,
  onTogglePublic,
  onToggleShowAuthor,
}: GalleryPublishingProps) {
  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
          <Globe className="w-5 h-5 text-copper" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-steel mb-1">Share to Gallery</h3>
          <p className="text-xs text-steel-dim mb-4">
            Make your project visible to the public. Others can view your specifications and
            design concepts.
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-steel-dim">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="space-y-3">
              {/* Publish toggle */}
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
                  <span className="text-sm text-steel">Publish to Gallery</span>
                </div>
                <button
                  onClick={onTogglePublic}
                  disabled={isPending}
                  className={clsx(
                    'relative w-10 h-5 rounded-full transition-colors',
                    visibility?.isPublic ? 'bg-copper' : 'bg-surface-600'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      visibility?.isPublic && 'translate-x-5'
                    )}
                  />
                </button>
              </label>

              {/* Author toggle (only shown when published) */}
              {visibility?.isPublic && (
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
                    <span className="text-sm text-steel">Show my username</span>
                  </div>
                  <button
                    onClick={onToggleShowAuthor}
                    disabled={isPending}
                    className={clsx(
                      'relative w-10 h-5 rounded-full transition-colors',
                      visibility?.showAuthor ? 'bg-copper' : 'bg-surface-600'
                    )}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        visibility?.showAuthor && 'translate-x-5'
                      )}
                    />
                  </button>
                </label>
              )}

              {/* Link to gallery */}
              {visibility?.isPublic && projectId && (
                <Link
                  to={`/gallery/${projectId}`}
                  className="inline-flex items-center gap-1.5 text-xs text-copper hover:text-copper-light transition-colors mt-2"
                >
                  View in Gallery
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
