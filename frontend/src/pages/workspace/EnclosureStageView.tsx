import { Box, ArrowRight } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'

export function EnclosureStageView() {
  const { project } = useWorkspaceContext()

  const pcbComplete = project?.spec?.stages?.pcb?.status === 'complete'

  if (!pcbComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Box className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Enclosure Design</h2>
          <p className="text-steel-dim mb-4">
            Complete the PCB stage first. The enclosure will be generated based on
            your board dimensions and component placement.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Design PCB</span>
            <ArrowRight className="w-4 h-4" />
            <span>Generate Enclosure</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-steel mb-1">Enclosure Design</h2>
        <p className="text-steel-dim text-sm">
          AI-generated parametric enclosure with 3D preview
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left: OpenSCAD Editor */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-700">
            <h3 className="text-sm font-medium text-steel">OpenSCAD Code</h3>
          </div>
          <div className="flex-1 flex items-center justify-center text-steel-dim">
            <p className="text-sm">Monaco editor with OpenSCAD syntax highlighting</p>
          </div>
        </div>

        {/* Right: 3D Preview */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-700">
            <h3 className="text-sm font-medium text-steel">3D Preview</h3>
          </div>
          <div className="flex-1 flex items-center justify-center text-steel-dim">
            <p className="text-sm">STL viewer with orbit controls</p>
          </div>
        </div>
      </div>
    </div>
  )
}
