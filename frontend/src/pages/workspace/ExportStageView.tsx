import { Download, FileText, Cpu, Box, Code, Package, ArrowRight } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'

export function ExportStageView() {
  const { project } = useWorkspaceContext()

  const firmwareComplete = project?.spec?.stages?.firmware?.status === 'complete'

  if (!firmwareComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Download className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Export & Manufacture</h2>
          <p className="text-steel-dim mb-4">
            Complete all stages to export your design files. You'll be able to download
            Gerbers, STL files, firmware binaries, and BOM.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Complete All Stages</span>
            <ArrowRight className="w-4 h-4" />
            <span>Export Files</span>
          </div>
        </div>
      </div>
    )
  }

  const exportItems = [
    {
      icon: FileText,
      title: 'Specification PDF',
      description: 'Complete project specification with requirements and BOM',
      filename: 'spec.pdf',
      ready: true,
    },
    {
      icon: Cpu,
      title: 'PCB Gerbers',
      description: 'Manufacturing files for PCB fabrication',
      filename: 'gerbers.zip',
      ready: !!project?.spec?.pcb?.pcbLayoutUrl,
    },
    {
      icon: Box,
      title: 'Enclosure STL',
      description: '3D printable enclosure models',
      filename: 'enclosure.zip',
      ready: !!project?.spec?.enclosure?.stlUrl,
    },
    {
      icon: Code,
      title: 'Firmware Binary',
      description: 'Compiled ESP32-C6 firmware (.bin)',
      filename: 'firmware.bin',
      ready: !!project?.spec?.firmware?.binaryUrl,
    },
    {
      icon: Package,
      title: 'Complete Package',
      description: 'All files in a single download',
      filename: 'project.zip',
      ready: true,
    },
  ]

  return (
    <div className="flex-1 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-steel mb-1">Export & Manufacture</h2>
        <p className="text-steel-dim text-sm">
          Download design files to manufacture your hardware
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        {exportItems.map((item) => (
          <div
            key={item.filename}
            className="bg-surface-900 rounded-lg border border-surface-700 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-steel mb-0.5">{item.title}</h3>
                <p className="text-xs text-steel-dim mb-3">{item.description}</p>
                {item.ready ? (
                  <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-ash bg-copper hover:bg-copper-light rounded transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    {item.filename}
                  </button>
                ) : (
                  <span className="text-xs text-surface-500">Not yet available</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
