import { Cpu, ArrowRight } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'

export function PCBStageView() {
  const { project } = useWorkspaceContext()

  const specComplete = project?.status === 'complete'

  if (!specComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Cpu className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">PCB Design</h2>
          <p className="text-steel-dim mb-4">
            Complete the spec stage first to begin PCB design. The AI will select
            circuit blocks and create your schematic automatically.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Complete Spec</span>
            <ArrowRight className="w-4 h-4" />
            <span>Design PCB</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-steel mb-1">PCB Design</h2>
        <p className="text-steel-dim text-sm">
          Select and place circuit blocks to build your schematic
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left: Block Placement / Schematic */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-700">
            <h3 className="text-sm font-medium text-steel">Schematic</h3>
          </div>
          <div className="flex-1 flex items-center justify-center text-steel-dim">
            <p className="text-sm">KiCanvas viewer will be integrated here</p>
          </div>
        </div>

        {/* Right: 3D Preview */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-700">
            <h3 className="text-sm font-medium text-steel">3D Preview</h3>
          </div>
          <div className="flex-1 flex items-center justify-center text-steel-dim">
            <p className="text-sm">3D PCB preview will be rendered here</p>
          </div>
        </div>
      </div>
    </div>
  )
}
