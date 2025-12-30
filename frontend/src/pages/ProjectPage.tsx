import { useParams, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  Cpu,
  Layers,
  Box,
  Code,
  FileText,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { clsx } from 'clsx'

interface PipelineStage {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  status: 'pending' | 'active' | 'complete' | 'error'
}

export function ProjectPage() {
  const { id } = useParams()
  const location = useLocation()
  const initialDescription = (location.state as { description?: string })?.description || ''

  const [stages, setStages] = useState<PipelineStage[]>([
    { id: 'requirements', name: 'Requirements', icon: FileText, status: 'active' },
    { id: 'blocks', name: 'Block Selection', icon: Layers, status: 'pending' },
    { id: 'schematic', name: 'Schematic', icon: Cpu, status: 'pending' },
    { id: 'pcb', name: 'PCB Layout', icon: Layers, status: 'pending' },
    { id: 'enclosure', name: 'Enclosure', icon: Box, status: 'pending' },
    { id: 'firmware', name: 'Firmware', icon: Code, status: 'pending' },
  ])

  const [streamingText, setStreamingText] = useState('')

  // Simulate streaming analysis
  useEffect(() => {
    if (!initialDescription) return

    const analysisText = `> Analyzing specification: "${initialDescription}"

REQUIREMENTS EXTRACTION
───────────────────────

Functional:
  • Monitor environmental conditions
  • Wireless connectivity for alerts
  • Battery-powered operation

Hardware Components:
  • ESP32-C6 MCU (WiFi + BLE)
  • Environmental sensor (BME280 or SHT40)
  • LiPo battery with charging circuit
  • Status LED for visual feedback

Form Factor:
  • Compact handheld design
  • Weatherproof enclosure recommended

STATUS: Proceeding to block selection...`

    let index = 0
    const interval = setInterval(() => {
      if (index < analysisText.length) {
        setStreamingText(analysisText.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
        // Move to next stage
        setStages((prev) =>
          prev.map((s) =>
            s.id === 'requirements'
              ? { ...s, status: 'complete' }
              : s.id === 'blocks'
                ? { ...s, status: 'active' }
                : s
          )
        )
      }
    }, 15)

    return () => clearInterval(interval)
  }, [initialDescription])

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">PROJECT</h1>
          <span className="font-mono text-xs text-steel-dim">{id?.slice(0, 8)}</span>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Pipeline Sidebar */}
        <aside className="w-56 border-r border-surface-700 p-4">
          <h2 className="text-xs font-mono text-steel-dim mb-4 tracking-wide">PIPELINE</h2>
          <div className="space-y-1">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  stage.status === 'active' && 'bg-copper/10 text-copper border-l-2 border-copper',
                  stage.status === 'complete' && 'text-emerald-400',
                  stage.status === 'pending' && 'text-steel-dim',
                  stage.status === 'error' && 'text-red-400'
                )}
              >
                <StageIcon stage={stage} />
                <span className="flex-1 font-medium">{stage.name}</span>
                {index < stages.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-surface-600" strokeWidth={1.5} />
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl">
            {/* Streaming Output */}
            <div className="bg-surface-900 border border-surface-700 p-6">
              <div className="flex items-center gap-2 text-copper mb-4">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                <span className="text-xs font-mono tracking-wide">FORGING...</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm text-steel leading-relaxed">
                {streamingText}
                <span className="animate-pulse text-copper">█</span>
              </pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function StageIcon({ stage }: { stage: PipelineStage }) {
  if (stage.status === 'complete') {
    return <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
  }
  if (stage.status === 'active') {
    return <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
  }
  return <Circle className="w-4 h-4" strokeWidth={1.5} />
}
