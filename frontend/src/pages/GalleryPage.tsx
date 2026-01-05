/**
 * Public Gallery Page
 *
 * Displays completed projects without requiring authentication.
 * Provides read-only access to showcase PHAESTUS-created designs.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  ExternalLink,
  User,
  Calendar,
  Zap,
  Cpu,
  Box,
  Code,
  ChevronRight,
  Search,
  Image as ImageIcon,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface GalleryProject {
  id: string
  name: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  authorUsername: string
  specSummary: string | null
  thumbnailUrl: string | null
}

interface GalleryResponse {
  projects: GalleryProject[]
  total: number
  limit: number
  offset: number
}

// =============================================================================
// API
// =============================================================================

async function fetchGalleryProjects(
  limit: number = 20,
  offset: number = 0
): Promise<GalleryResponse> {
  const response = await fetch(`/api/gallery?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch gallery')
  }
  return response.json()
}

// =============================================================================
// COMPONENTS
// =============================================================================

function ProjectCard({ project }: { project: GalleryProject }) {
  const createdDate = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <Link
      to={`/gallery/${project.id}`}
      className="group bg-surface-900 border border-surface-700 hover:border-copper/50 transition-all overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-surface-800 relative overflow-hidden">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="w-12 h-12 text-surface-600" strokeWidth={1} />
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-ash/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
          <span className="flex items-center gap-1 text-copper text-sm font-medium">
            View Project <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-steel group-hover:text-copper transition-colors mb-1 truncate">
          {project.name}
        </h3>
        <p className="text-sm text-steel-dim line-clamp-2 mb-3">
          {project.specSummary || project.description}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-surface-500">
          <div className="flex items-center gap-1">
            <User className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{project.authorUsername}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{createdDate}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-4">
        <Zap className="w-10 h-10 text-surface-500" strokeWidth={1} />
      </div>
      <h2 className="text-xl font-semibold text-steel mb-2">No Projects Yet</h2>
      <p className="text-steel-dim max-w-md mb-6">
        Be the first to create a hardware design with PHAESTUS. Sign in to start your project.
      </p>
      <Link
        to="/login"
        className="px-6 py-2 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
      >
        Get Started
      </Link>
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

export function GalleryPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['gallery'],
    queryFn: () => fetchGalleryProjects(50, 0),
  })

  // Filter projects by search query
  const filteredProjects = data?.projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.authorUsername.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="border-b border-surface-700 bg-surface-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-copper-gradient rounded flex items-center justify-center">
                  <span className="text-ash font-bold text-sm">P</span>
                </div>
                <span className="text-lg font-bold text-steel">PHAESTUS</span>
              </Link>
              <span className="text-surface-500">|</span>
              <h1 className="text-lg font-semibold text-steel">Gallery</h1>
            </div>
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-copper hover:text-copper-light transition-colors"
            >
              Sign In to Create
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-surface-900 border-b border-surface-700">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h2 className="text-3xl font-bold text-steel mb-3">Hardware Designs by AI</h2>
          <p className="text-lg text-steel-dim mb-6 max-w-2xl">
            Browse projects created with PHAESTUS - from idea to manufacturable design in minutes.
            Each project includes specifications, PCB layouts, enclosures, and firmware.
          </p>

          {/* Stats */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 text-copper">
              <Cpu className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-2xl font-bold">{data?.total || 0}</span>
              <span className="text-steel-dim text-sm">Projects</span>
            </div>
            <div className="flex items-center gap-2 text-copper">
              <Box className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-steel-dim text-sm">Enclosures Included</span>
            </div>
            <div className="flex items-center gap-2 text-copper">
              <Code className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-steel-dim text-sm">Firmware Ready</span>
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
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-900 border border-surface-700 text-steel placeholder-surface-500 focus:outline-none focus:border-copper/50"
            />
          </div>
        </div>

        {/* Projects Grid */}
        {isLoading && <LoadingState />}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-400">Failed to load gallery</p>
          </div>
        )}

        {!isLoading && !error && filteredProjects?.length === 0 && <EmptyState />}

        {!isLoading && !error && filteredProjects && filteredProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
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
              Create Your Design
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default GalleryPage
