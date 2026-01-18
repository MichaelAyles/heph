/**
 * Blog Post Page
 *
 * Displays a single blog post with full HTML content.
 * Public access - no authentication required.
 */

import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  ArrowLeft,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface BlogPost {
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

// =============================================================================
// API
// =============================================================================

async function fetchBlogPost(slug: string): Promise<BlogPost> {
  const response = await fetch(`/api/blog/${slug}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Blog post not found')
    }
    throw new Error('Failed to fetch blog post')
  }
  return response.json()
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

function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-2xl font-semibold text-steel mb-4">Post Not Found</h2>
      <p className="text-steel-dim mb-6">
        The blog post you're looking for doesn't exist or has been removed.
      </p>
      <Link
        to="/blog"
        className="px-4 py-2 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
      >
        Back to Blog
      </Link>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: () => fetchBlogPost(slug!),
    enabled: !!slug,
  })

  const formattedDate = post?.date
    ? formatDate(post.date)
    : ''

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="border-b border-surface-700 bg-surface-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-copper-gradient rounded flex items-center justify-center">
                  <span className="text-ash font-bold text-sm">P</span>
                </div>
                <span className="text-lg font-bold text-steel">PHAESTUS</span>
              </Link>
              <span className="text-surface-500">|</span>
              <Link to="/blog" className="text-lg font-semibold text-steel hover:text-copper transition-colors">
                Dev Blog
              </Link>
            </div>
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-copper hover:text-copper-light transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Back Link */}
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-steel-dim hover:text-copper transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Blog
        </Link>

        {isLoading && <LoadingState />}

        {error && <NotFoundState />}

        {!isLoading && !error && post && (
          <>
            {/* Post Header */}
            <header className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-steel mb-4 leading-tight">
                {post.title}
              </h1>
              <div className="flex items-center gap-6 text-sm text-steel-dim">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                  <span>{formattedDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" strokeWidth={1.5} />
                  <span>{post.readingTime} min read</span>
                </div>
              </div>
            </header>

            {/* Post Content */}
            <article
              className="prose prose-invert prose-copper max-w-none
                prose-headings:text-steel prose-headings:font-semibold
                prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-steel-dim prose-p:leading-relaxed
                prose-a:text-copper prose-a:no-underline hover:prose-a:underline
                prose-strong:text-steel
                prose-code:text-copper prose-code:bg-surface-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-surface-900 prose-pre:border prose-pre:border-surface-700
                prose-img:rounded prose-img:border prose-img:border-surface-700
                prose-ul:text-steel-dim prose-ol:text-steel-dim
                prose-li:marker:text-copper
                prose-blockquote:border-l-copper prose-blockquote:text-steel-dim"
              dangerouslySetInnerHTML={{ __html: post.htmlContent }}
            />

            {/* Navigation */}
            <nav className="mt-12 pt-8 border-t border-surface-700">
              <div className="flex items-center justify-between">
                {post.nextSlug ? (
                  <button
                    onClick={() => navigate(`/blog/${post.nextSlug}`)}
                    className="flex items-center gap-2 text-steel-dim hover:text-copper transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
                    <span>Older Post</span>
                  </button>
                ) : (
                  <div />
                )}

                <Link
                  to="/blog"
                  className="text-sm text-steel-dim hover:text-steel transition-colors"
                >
                  All Posts
                </Link>

                {post.prevSlug ? (
                  <button
                    onClick={() => navigate(`/blog/${post.prevSlug}`)}
                    className="flex items-center gap-2 text-steel-dim hover:text-copper transition-colors"
                  >
                    <span>Newer Post</span>
                    <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </nav>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-700 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-8">
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

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString
    }
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

export default BlogPostPage
