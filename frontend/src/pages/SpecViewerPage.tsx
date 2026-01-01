import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  Lock,
  Cpu,
  Battery,
  Wifi,
  Box,
  DollarSign,
  ArrowLeft,
  Ruler,
} from 'lucide-react'
import type { Project, ProjectSpec, FinalSpec } from '@/db/schema'

async function fetchProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`)
  if (!response.ok) throw new Error('Failed to fetch project')
  const data = await response.json()
  return data.project
}

interface SectionProps {
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  children: React.ReactNode
}

function Section({ title, icon: Icon, children }: SectionProps) {
  return (
    <div className="bg-surface-900 border border-surface-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
        <h3 className="text-lg font-semibold text-steel">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export function SpecViewerPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-400">Failed to load project</div>
      </div>
    )
  }

  const spec = project.spec as ProjectSpec
  const finalSpec = spec?.finalSpec as FinalSpec | null

  if (!finalSpec?.locked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-steel-dim mb-4">This specification is not yet complete.</p>
          <button
            onClick={() => navigate(`/project/${id}`)}
            className="px-6 py-2 bg-copper-gradient text-ash font-semibold"
          >
            Continue Editing
          </button>
        </div>
      </div>
    )
  }

  const totalBOM = finalSpec.estimatedBOM.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  )

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-steel-dim hover:text-steel transition-colors"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold text-steel tracking-tight">{finalSpec.name}</h1>
        </div>
        <div className="flex items-center gap-1 text-emerald-400 text-sm">
          <Lock className="w-4 h-4" strokeWidth={1.5} />
          <span>Locked {new Date(finalSpec.lockedAt).toLocaleDateString()}</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Summary */}
          <div className="bg-copper/10 border border-copper/30 p-6">
            <p className="text-steel text-lg">{finalSpec.summary}</p>
          </div>

          {/* Blueprint Image */}
          {spec.selectedBlueprint !== null && spec.blueprints[spec.selectedBlueprint] && (
            <div className="bg-surface-900 border border-surface-700 p-4">
              <img
                src={spec.blueprints[spec.selectedBlueprint].url}
                alt="Product Blueprint"
                className="w-full max-h-96 object-contain"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PCB & Enclosure */}
            <Section title="Dimensions" icon={Ruler}>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-steel-dim block mb-1">PCB Size</span>
                  <span className="text-steel font-mono">
                    {finalSpec.pcbSize.width} × {finalSpec.pcbSize.height} {finalSpec.pcbSize.unit}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-steel-dim block mb-1">Enclosure</span>
                  <span className="text-steel">{finalSpec.enclosure.style}</span>
                  <span className="text-steel-dim text-sm block">
                    {finalSpec.enclosure.width} × {finalSpec.enclosure.height} × {finalSpec.enclosure.depth} mm
                  </span>
                </div>
              </div>
            </Section>

            {/* Power */}
            <Section title="Power" icon={Battery}>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-steel-dim">Source</span>
                  <span className="text-steel">{finalSpec.power.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-steel-dim">Voltage</span>
                  <span className="text-steel font-mono">{finalSpec.power.voltage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-steel-dim">Current</span>
                  <span className="text-steel font-mono">{finalSpec.power.current}</span>
                </div>
                {finalSpec.power.batteryLife && (
                  <div className="flex justify-between">
                    <span className="text-steel-dim">Battery Life</span>
                    <span className="text-steel">{finalSpec.power.batteryLife}</span>
                  </div>
                )}
              </div>
            </Section>

            {/* Communication */}
            <Section title="Communication" icon={Wifi}>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-steel-dim">Type</span>
                  <span className="text-steel">{finalSpec.communication.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-steel-dim">Protocol</span>
                  <span className="text-steel">{finalSpec.communication.protocol}</span>
                </div>
              </div>
            </Section>

            {/* I/O */}
            <Section title="Inputs & Outputs" icon={Cpu}>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-steel-dim block mb-2">Inputs</span>
                  <ul className="space-y-1">
                    {finalSpec.inputs.map((input, i) => (
                      <li key={i} className="text-steel text-sm">
                        • {input.type} ×{input.count}
                        {input.notes && (
                          <span className="text-steel-dim"> — {input.notes}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-sm text-steel-dim block mb-2">Outputs</span>
                  <ul className="space-y-1">
                    {finalSpec.outputs.map((output, i) => (
                      <li key={i} className="text-steel text-sm">
                        • {output.type} ×{output.count}
                        {output.notes && (
                          <span className="text-steel-dim"> — {output.notes}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>
          </div>

          {/* BOM */}
          <Section title="Estimated Bill of Materials" icon={DollarSign}>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-steel-dim border-b border-surface-700">
                  <th className="pb-2">Item</th>
                  <th className="pb-2 text-center">Qty</th>
                  <th className="pb-2 text-right">Unit Cost</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {finalSpec.estimatedBOM.map((item, i) => (
                  <tr key={i} className="border-b border-surface-800 text-sm">
                    <td className="py-2 text-steel">{item.item}</td>
                    <td className="py-2 text-center text-steel-dim">{item.quantity}</td>
                    <td className="py-2 text-right font-mono text-steel-dim">
                      ${item.unitCost.toFixed(2)}
                    </td>
                    <td className="py-2 text-right font-mono text-steel">
                      ${(item.quantity * item.unitCost).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold">
                  <td colSpan={3} className="pt-4 text-steel">
                    Estimated Total
                  </td>
                  <td className="pt-4 text-right font-mono text-copper">
                    ${totalBOM.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Decisions Made */}
          {spec.decisions.length > 0 && (
            <Section title="Design Decisions" icon={Box}>
              <ul className="space-y-2">
                {spec.decisions.map((d, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-steel-dim">{d.question}</span>
                    <span className="text-copper ml-2">{d.answer}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
