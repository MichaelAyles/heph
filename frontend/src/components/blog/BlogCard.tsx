/**
 * Blog Card Component
 *
 * Displays a blog post preview with thumbnail, title, date, and excerpt.
 */

import { Link } from 'react-router-dom'
import { Calendar, Clock, ChevronRight, FileText } from 'lucide-react'

export interface BlogCardProps {
  slug: string
  title: string
  date: string
  excerpt: string
  thumbnailPath: string | null
  readingTime: number
}

export function BlogCard({
  slug,
  title,
  date,
  excerpt,
  thumbnailPath,
  readingTime,
}: BlogCardProps) {
  const formattedDate = formatDate(date)

  return (
    <Link
      to={`/blog/${slug}`}
      className="group bg-surface-900 border border-surface-700 hover:border-copper/50 transition-all overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-surface-800 relative overflow-hidden">
        {thumbnailPath ? (
          <img
            src={thumbnailPath}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileText className="w-12 h-12 text-surface-600" strokeWidth={1} />
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-ash/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
          <span className="flex items-center gap-1 text-copper text-sm font-medium">
            Read More <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-steel group-hover:text-copper transition-colors mb-2 line-clamp-2">
          {title}
        </h3>
        <p className="text-sm text-steel-dim line-clamp-2 mb-3">{excerpt}</p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{readingTime} min read</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function formatDate(dateString: string): string {
  try {
    // Handle various date formats
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

export default BlogCard
