import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface BlogPost {
  id: string
  title: string
  excerpt: string
  content: string
  date: string
  readTime: string
  author: string
}

const BLOG_POSTS: BlogPost[] = [
  {
    id: 'iterative-design-feedback',
    title: 'Iterate on Your Hardware Designs with AI-Powered Feedback',
    excerpt:
      'New blueprint regeneration lets you refine product renders with natural language feedback. Say goodbye to starting over.',
    date: '2026-01-02',
    readTime: '3 min',
    author: 'PHAESTUS Team',
    content: `
When designing hardware, iteration is everything. The first concept is rarely the final one. That's why we've just shipped a feature that makes refining your product designs faster than ever.

## The Problem with Traditional Render Iteration

Previously, if you wanted to change something about a generated product render, you had two options: accept it as-is, or regenerate all four variations and hope one matches your vision better. Neither was ideal.

## Enter Feedback-Driven Regeneration

Now when you click on any of the four generated blueprints, you'll see a detail view with a simple text box. Want the corners more rounded? A different color? An external antenna? Just type it.

Hit "Regenerate with Changes" and we'll create a new render that incorporates your feedback while preserving what you liked about the original. The new image replaces the one you were editing - no need to regenerate the other three.

## How It Works

Under the hood, we're appending your feedback to the original image generation prompt. The AI understands context, so saying "make it blue" or "add visible mounting points" just works.

When you're happy with a design, click "I'm Happy - Continue" to lock it in and proceed to final specification generation.

## What's Next

This is just the beginning of our iterative design tools. We're working on:

- **Multi-image comparison**: Side-by-side before/after views
- **Style transfer**: Apply the aesthetic of one design to another
- **Component highlighting**: Click on a feature to specifically modify it

## Try It Now

The feature is live at [phaestus.app](https://phaestus.app). Start a new project, describe your hardware idea, and experience the new design iteration flow.

Hardware design shouldn't require CAD expertise. With PHAESTUS, your words shape the product.
    `,
  },
  {
    id: 'from-idea-to-hardware',
    title: 'From Idea to Manufacturable Hardware in Minutes',
    excerpt:
      'PHAESTUS transforms natural language into complete hardware packages: schematics, PCBs, enclosures, and firmware scaffolding.',
    date: '2025-12-15',
    readTime: '5 min',
    author: 'PHAESTUS Team',
    content: `
Building custom hardware has always been a bottleneck for makers, startups, and engineers. You have an idea - maybe a smart sensor, a custom controller, or an IoT device - but getting from concept to manufacturable design requires expertise in electronics, mechanical engineering, and firmware development.

## The Traditional Path

The typical journey looks something like this:

1. **Concept sketches** - Days of research and planning
2. **Schematic design** - Weeks learning KiCad or Eagle
3. **PCB layout** - More weeks, plus costly mistakes
4. **Enclosure design** - Fusion 360 or OpenSCAD learning curve
5. **Firmware setup** - Boilerplate code and pin mapping
6. **BOM creation** - Hunting for parts and pricing

By the time you have everything, months have passed and motivation has often waned.

## The PHAESTUS Path

We've collapsed this entire workflow into a conversation:

> "I want to build a temperature and humidity monitor with WiFi, a small OLED display, and battery power. It should fit in a compact handheld enclosure."

From this single description, PHAESTUS:

1. **Analyzes feasibility** - Checks component availability, power requirements, and complexity
2. **Asks clarifying questions** - Only what's needed to lock down the design
3. **Generates product renders** - Four distinct visual concepts to choose from
4. **Creates complete outputs** - Schematics, PCB files, enclosure STLs, firmware starter code, and BOM

## Pre-Validated Building Blocks

We don't generate circuits from scratch. PHAESTUS uses a library of 21 pre-validated circuit blocks - power supplies, sensor interfaces, communication modules, displays, and more. Each has been tested and proven.

Your project becomes an assembly of these reliable blocks, wired together based on your requirements. The result is a design that works, not a theoretical schematic that might work.

## What Can You Build?

PHAESTUS excels at:

- **IoT devices** - Sensors, monitors, controllers with WiFi/BLE
- **Data loggers** - Temperature, humidity, motion, environmental sensing
- **Custom controllers** - Motor drivers, relay boards, automation
- **Display devices** - OLED, LCD, e-ink based information displays
- **Wearables** - Compact battery-powered devices

We currently don't support FPGAs, high-voltage systems, safety-critical applications, or medical devices. These require specialized expertise beyond AI assistance.

## The Tech Stack

PHAESTUS runs entirely on Cloudflare's edge network:

- **D1 SQLite** for project storage
- **R2** for generated assets
- **Gemini 3.0** for AI analysis and generation
- **React + TypeScript** for the interface

Everything is designed for speed. Feasibility analysis takes seconds. Blueprint generation runs in parallel. Your complete package is ready in minutes, not months.

## Start Building

Visit [phaestus.app](https://phaestus.app), describe what you want to create, and watch your idea take shape. Hardware design is finally accessible to everyone.
    `,
  },
]

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function BlogPostCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group cursor-pointer bg-surface-900 border border-surface-700 p-6 hover:border-copper/50 transition-colors"
    >
      <div className="flex items-center gap-4 text-sm text-steel-dim mb-4">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" strokeWidth={1.5} />
          {formatDate(post.date)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" strokeWidth={1.5} />
          {post.readTime}
        </span>
      </div>

      <h2 className="text-xl font-semibold text-steel mb-3 group-hover:text-copper transition-colors">
        {post.title}
      </h2>

      <p className="text-steel-dim leading-relaxed mb-4">{post.excerpt}</p>

      <div className="flex items-center gap-2 text-copper text-sm font-medium">
        Read more
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
      </div>
    </article>
  )
}

function BlogPostView({ post, onBack }: { post: BlogPost; onBack: () => void }) {
  return (
    <article className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-steel-dim hover:text-copper transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
        Back to all posts
      </button>

      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-steel mb-4 leading-tight">{post.title}</h1>

        <div className="flex items-center gap-4 text-sm text-steel-dim">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" strokeWidth={1.5} />
            {formatDate(post.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" strokeWidth={1.5} />
            {post.readTime}
          </span>
          <span className="text-copper">{post.author}</span>
        </div>
      </header>

      <div className="prose prose-invert prose-copper max-w-none">
        {post.content.split('\n\n').map((block, i) => {
          const trimmed = block.trim()
          if (!trimmed) return null

          if (trimmed.startsWith('## ')) {
            return (
              <h2 key={i} className="text-xl font-semibold text-steel mt-8 mb-4">
                {trimmed.slice(3)}
              </h2>
            )
          }

          if (trimmed.startsWith('> ')) {
            return (
              <blockquote
                key={i}
                className="border-l-2 border-copper pl-4 italic text-steel-dim my-6"
              >
                {trimmed.slice(2)}
              </blockquote>
            )
          }

          if (trimmed.startsWith('- **')) {
            // List items
            const items = trimmed.split('\n').filter((line) => line.startsWith('- '))
            return (
              <ul key={i} className="list-disc list-inside space-y-2 my-4 text-steel-dim">
                {items.map((item, j) => {
                  const content = item.slice(2)
                  // Handle bold text
                  const parts = content.split(/\*\*([^*]+)\*\*/)
                  return (
                    <li key={j}>
                      {parts.map((part, k) =>
                        k % 2 === 1 ? (
                          <strong key={k} className="text-steel font-medium">
                            {part}
                          </strong>
                        ) : (
                          part
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }

          if (trimmed.match(/^\d+\.\s/)) {
            // Numbered list
            const items = trimmed.split('\n').filter((line) => line.match(/^\d+\.\s/))
            return (
              <ol key={i} className="list-decimal list-inside space-y-2 my-4 text-steel-dim">
                {items.map((item, j) => {
                  const content = item.replace(/^\d+\.\s/, '')
                  const parts = content.split(/\*\*([^*]+)\*\*/)
                  return (
                    <li key={j}>
                      {parts.map((part, k) =>
                        k % 2 === 1 ? (
                          <strong key={k} className="text-steel font-medium">
                            {part}
                          </strong>
                        ) : (
                          part
                        )
                      )}
                    </li>
                  )
                })}
              </ol>
            )
          }

          // Regular paragraph - handle links and bold
          let content: React.ReactNode = trimmed

          // Handle links [text](url)
          const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
          const parts: React.ReactNode[] = []
          let lastIndex = 0
          let match

          while ((match = linkRegex.exec(trimmed)) !== null) {
            if (match.index > lastIndex) {
              parts.push(trimmed.slice(lastIndex, match.index))
            }
            parts.push(
              <a
                key={match.index}
                href={match[2]}
                className="text-copper hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {match[1]}
              </a>
            )
            lastIndex = match.index + match[0].length
          }

          if (parts.length > 0) {
            if (lastIndex < trimmed.length) {
              parts.push(trimmed.slice(lastIndex))
            }
            content = parts
          }

          return (
            <p key={i} className="text-steel-dim leading-relaxed my-4">
              {content}
            </p>
          )
        })}
      </div>

      <div className="mt-12 pt-8 border-t border-surface-700">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-copper-gradient text-ash font-medium"
        >
          Try PHAESTUS
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </Link>
      </div>
    </article>
  )
}

export function BlogPage() {
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null)

  return (
    <div className="min-h-screen bg-ash">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-ash/80 backdrop-blur-sm border-b border-surface-700">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Phaestus" className="h-8 w-auto" />
            <span className="text-lg font-semibold tracking-tight text-steel">PHAESTUS</span>
          </Link>
          <Link
            to="/"
            className="px-4 py-2 bg-copper-gradient text-ash text-sm font-medium"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          {selectedPost ? (
            <BlogPostView post={selectedPost} onBack={() => setSelectedPost(null)} />
          ) : (
            <>
              <header className="mb-12">
                <h1 className="text-4xl font-bold text-steel mb-4">Blog</h1>
                <p className="text-xl text-steel-dim">
                  Updates, tutorials, and insights from the PHAESTUS team.
                </p>
              </header>

              <div className="space-y-6">
                {BLOG_POSTS.map((post) => (
                  <BlogPostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-surface-700">
        <div className="max-w-6xl mx-auto text-center text-steel-dim text-sm">
          &copy; {new Date().getFullYear()} Phaestus. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
