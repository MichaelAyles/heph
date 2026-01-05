/**
 * Public Gallery Detail Page
 *
 * Displays detailed view of a completed project without requiring authentication.
 */

import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ArrowLeft, User, Calendar, Cpu, Box, Code, Zap, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'

// =============================================================================
// TYPES
// =============================================================================

interface ProjectSpec {
  finalSpec: {
    name: string
    summary: string
    pcbSize: { width: number; height: number }
    power: { source: string; voltage: string }
    outputs: Array<{ type: string; description: string }>
    inputs: Array<{ type: string; description: string }>
    estimatedBOM: Array<{ item: string; quantity: number; unitCost: number }>
  } | null
  blueprints: Array<{ url: string; prompt: string }> | null
  selectedBlueprint: number | null
  feasibility: {
    overallScore: number
    communication: { type: string; notes: string }
    processing: { level: string; notes: string }
    power: { options: string[]; notes: string }
    inputs: { items: string[] }
    outputs: { items: string[] }
  } | null
  pcb: {
    boardSize: { width: number; height: number } | null
    placedBlocks: Array<{ blockSlug: string; gridX: number; gridY: number }> | null
  } | null
  enclosure: {
    style: string | null
    stlUrl: string | null
  } | null
  firmware: {
    language: string | null
    framework: string | null
    files: Array<{ path: string }> | null
  } | null
}

interface GalleryProject {
  id: string
  name: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  authorUsername: string
  spec: ProjectSpec | null
}

// =============================================================================
// API
// =============================================================================

async function fetchGalleryProject(id: string): Promise<{ project: GalleryProject }> {
  const response = await fetch(`/api/gallery/${id}`)
  if (!response.ok) {
    throw new Error('Project not found')
  }
  return response.json()
}

// =============================================================================
// COMPONENTS
// =============================================================================

function SectionCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon: typeof Cpu
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={clsx('bg-surface-900 border border-surface-700 p-6', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
        <h3 className="text-lg font-semibold text-steel">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function SpecificationSection({ spec }: { spec: ProjectSpec }) {
  if (!spec.finalSpec) return null

  const totalCost = spec.finalSpec.estimatedBOM.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  )

  return (
    <SectionCard title="Specification" icon={Zap}>
      <p className="text-steel-dim mb-4">{spec.finalSpec.summary}</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">PCB Size</span>
          <span className="text-steel font-medium">
            {spec.finalSpec.pcbSize.width}mm x {spec.finalSpec.pcbSize.height}mm
          </span>
        </div>
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Power</span>
          <span className="text-steel font-medium">
            {spec.finalSpec.power.source} ({spec.finalSpec.power.voltage})
          </span>
        </div>
      </div>

      {/* I/O */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <h4 className="text-sm font-medium text-steel mb-2">Inputs</h4>
          <ul className="space-y-1">
            {spec.finalSpec.inputs.map((input, i) => (
              <li key={i} className="text-sm text-steel-dim flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0"
                  strokeWidth={1.5}
                />
                {input.type}: {input.description}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-medium text-steel mb-2">Outputs</h4>
          <ul className="space-y-1">
            {spec.finalSpec.outputs.map((output, i) => (
              <li key={i} className="text-sm text-steel-dim flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0"
                  strokeWidth={1.5}
                />
                {output.type}: {output.description}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* BOM */}
      <div>
        <h4 className="text-sm font-medium text-steel mb-2">Bill of Materials</h4>
        <div className="bg-surface-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700">
                <th className="text-left py-2 px-3 text-surface-500 font-medium">Item</th>
                <th className="text-center py-2 px-3 text-surface-500 font-medium">Qty</th>
                <th className="text-right py-2 px-3 text-surface-500 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {spec.finalSpec.estimatedBOM.map((item, i) => (
                <tr key={i} className="border-b border-surface-700 last:border-0">
                  <td className="py-2 px-3 text-steel">{item.item}</td>
                  <td className="py-2 px-3 text-center text-steel-dim">{item.quantity}</td>
                  <td className="py-2 px-3 text-right text-steel-dim">
                    ${(item.quantity * item.unitCost).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-900">
                <td colSpan={2} className="py-2 px-3 text-steel font-medium">
                  Total
                </td>
                <td className="py-2 px-3 text-right text-copper font-bold">
                  ${totalCost.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </SectionCard>
  )
}

function PCBSection({ spec }: { spec: ProjectSpec }) {
  if (!spec.pcb?.placedBlocks?.length) return null

  return (
    <SectionCard title="PCB Design" icon={Cpu}>
      {spec.pcb.boardSize && (
        <div className="bg-surface-800 p-3 mb-4">
          <span className="text-xs text-surface-500 block mb-1">Board Size</span>
          <span className="text-steel font-medium">
            {spec.pcb.boardSize.width}mm x {spec.pcb.boardSize.height}mm
          </span>
        </div>
      )}

      <h4 className="text-sm font-medium text-steel mb-2">Circuit Blocks</h4>
      <div className="flex flex-wrap gap-2">
        {spec.pcb.placedBlocks.map((block, i) => (
          <div
            key={i}
            className="px-3 py-1.5 bg-surface-800 border border-surface-600 text-sm text-steel"
          >
            {block.blockSlug}
            <span className="text-surface-500 ml-2">
              ({block.gridX},{block.gridY})
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function EnclosureSection({ spec }: { spec: ProjectSpec }) {
  if (!spec.enclosure?.style) return null

  return (
    <SectionCard title="Enclosure" icon={Box}>
      <div className="bg-surface-800 p-3 mb-4">
        <span className="text-xs text-surface-500 block mb-1">Style</span>
        <span className="text-steel font-medium capitalize">{spec.enclosure.style}</span>
      </div>
      <p className="text-sm text-steel-dim">
        3D-printable enclosure generated with OpenSCAD. Includes mounting holes and cutouts for
        connectors.
      </p>
    </SectionCard>
  )
}

function FirmwareSection({ spec }: { spec: ProjectSpec }) {
  if (!spec.firmware?.files?.length) return null

  return (
    <SectionCard title="Firmware" icon={Code}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Language</span>
          <span className="text-steel font-medium">{spec.firmware.language || 'C++'}</span>
        </div>
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Framework</span>
          <span className="text-steel font-medium">{spec.firmware.framework || 'PlatformIO'}</span>
        </div>
      </div>

      <h4 className="text-sm font-medium text-steel mb-2">Files</h4>
      <div className="bg-surface-800 p-3 font-mono text-xs text-steel-dim space-y-1">
        {spec.firmware.files.map((file, i) => (
          <div key={i}>{file.path}</div>
        ))}
      </div>
    </SectionCard>
  )
}

function FeasibilitySection({ spec }: { spec: ProjectSpec }) {
  if (!spec.feasibility) return null

  return (
    <SectionCard title="Feasibility Analysis" icon={Zap} className="md:col-span-2">
      <div className="flex items-center gap-4 mb-6">
        <div
          className={clsx(
            'text-4xl font-bold',
            spec.feasibility.overallScore >= 80 && 'text-emerald-400',
            spec.feasibility.overallScore >= 60 &&
              spec.feasibility.overallScore < 80 &&
              'text-yellow-400',
            spec.feasibility.overallScore < 60 && 'text-red-400'
          )}
        >
          {spec.feasibility.overallScore}%
        </div>
        <div className="text-steel-dim">Feasibility Score</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Communication</span>
          <span className="text-steel font-medium">{spec.feasibility.communication.type}</span>
          <p className="text-xs text-steel-dim mt-1">{spec.feasibility.communication.notes}</p>
        </div>
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Processing</span>
          <span className="text-steel font-medium">{spec.feasibility.processing.level}</span>
          <p className="text-xs text-steel-dim mt-1">{spec.feasibility.processing.notes}</p>
        </div>
        <div className="bg-surface-800 p-3">
          <span className="text-xs text-surface-500 block mb-1">Power</span>
          <span className="text-steel font-medium">
            {spec.feasibility.power.options.join(', ')}
          </span>
          <p className="text-xs text-steel-dim mt-1">{spec.feasibility.power.notes}</p>
        </div>
      </div>
    </SectionCard>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function GalleryDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['gallery', id],
    queryFn: () => fetchGalleryProject(id!),
    enabled: !!id,
  })

  const project = data?.project

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ash flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-ash flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-steel mb-2">Project Not Found</h2>
          <p className="text-steel-dim mb-4">This project may have been removed or isn't public.</p>
          <Link to="/gallery" className="text-copper hover:text-copper-light">
            Return to Gallery
          </Link>
        </div>
      </div>
    )
  }

  const createdDate = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const selectedBlueprintUrl =
    project.spec?.blueprints && project.spec.selectedBlueprint !== null
      ? project.spec.blueprints[project.spec.selectedBlueprint]?.url
      : project.spec?.blueprints?.[0]?.url

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="border-b border-surface-700 bg-surface-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/gallery"
                className="flex items-center gap-2 text-steel-dim hover:text-steel transition-colors"
              >
                <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
                Back to Gallery
              </Link>
            </div>
            <Link
              to="/login"
              className="px-4 py-2 bg-copper-gradient text-ash font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Create Your Own
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-surface-900 border-b border-surface-700">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex gap-8">
            {/* Thumbnail */}
            {selectedBlueprintUrl && (
              <div className="w-80 h-60 bg-surface-800 rounded-lg overflow-hidden shrink-0">
                <img
                  src={selectedBlueprintUrl}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-steel mb-2">{project.name}</h1>
              <p className="text-lg text-steel-dim mb-4">{project.description}</p>

              <div className="flex items-center gap-6 text-sm text-surface-500">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" strokeWidth={1.5} />
                  <span>by {project.authorUsername}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.5} />
                  <span>{createdDate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {project.spec && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SpecificationSection spec={project.spec} />
            <PCBSection spec={project.spec} />
            <EnclosureSection spec={project.spec} />
            <FirmwareSection spec={project.spec} />
            <FeasibilitySection spec={project.spec} />
          </div>
        )}

        {/* Blueprints Gallery */}
        {project.spec?.blueprints && project.spec.blueprints.length > 1 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-steel mb-4">Design Concepts</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {project.spec.blueprints.map((bp, i) => (
                <div
                  key={i}
                  className={clsx(
                    'aspect-square bg-surface-800 border-2 overflow-hidden',
                    i === project.spec?.selectedBlueprint ? 'border-copper' : 'border-surface-700'
                  )}
                >
                  <img
                    src={bp.url}
                    alt={`Design ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-surface-700 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <h2 className="text-2xl font-bold text-steel mb-3">Build Your Own Hardware Design</h2>
          <p className="text-steel-dim mb-6 max-w-lg mx-auto">
            PHAESTUS transforms your ideas into complete hardware designs with PCB layouts,
            3D-printable enclosures, and firmware code.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
          >
            <Zap className="w-5 h-5" strokeWidth={1.5} />
            Get Started Free
          </Link>
        </div>
      </footer>
    </div>
  )
}

export default GalleryDetailPage
