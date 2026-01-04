import { Code, ArrowRight, Play, Download } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'

export function FirmwareStageView() {
  const { project } = useWorkspaceContext()

  const enclosureComplete = project?.spec?.stages?.enclosure?.status === 'complete'

  if (!enclosureComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Code className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Firmware Development</h2>
          <p className="text-steel-dim mb-4">
            Complete the enclosure stage first. Firmware will be generated based on
            your hardware configuration and pin assignments.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Generate Enclosure</span>
            <ArrowRight className="w-4 h-4" />
            <span>Write Firmware</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-steel mb-1">Firmware Development</h2>
          <p className="text-steel-dim text-sm">
            Edit, compile, and flash firmware for your ESP32-C6
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors">
            <Play className="w-4 h-4" />
            Build
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ash bg-copper hover:bg-copper-light rounded transition-colors">
            <Download className="w-4 h-4" />
            Download .bin
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[250px_1fr_350px] gap-4 min-h-0">
        {/* Left: File Tree */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-3 py-2 border-b border-surface-700">
            <h3 className="text-xs font-medium text-steel-dim uppercase tracking-wide">Files</h3>
          </div>
          <div className="flex-1 p-2 text-sm text-steel-dim">
            <div className="px-2 py-1 hover:bg-surface-800 rounded cursor-pointer">
              main.cpp
            </div>
            <div className="px-2 py-1 hover:bg-surface-800 rounded cursor-pointer">
              config.h
            </div>
            <div className="px-2 py-1 hover:bg-surface-800 rounded cursor-pointer">
              platformio.ini
            </div>
          </div>
        </div>

        {/* Center: Code Editor */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-700">
            <h3 className="text-sm font-medium text-steel">main.cpp</h3>
          </div>
          <div className="flex-1 flex items-center justify-center text-steel-dim">
            <p className="text-sm">Monaco editor will be integrated here</p>
          </div>
        </div>

        {/* Right: Build Output */}
        <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col">
          <div className="px-3 py-2 border-b border-surface-700">
            <h3 className="text-xs font-medium text-steel-dim uppercase tracking-wide">Build Output</h3>
          </div>
          <div className="flex-1 p-3 font-mono text-xs text-steel-dim bg-surface-950 overflow-auto">
            <p className="text-surface-500">Click "Build" to compile firmware...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
