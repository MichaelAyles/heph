/**
 * NotReadyState - Displayed when export stage is not ready
 */

import { Download, ArrowRight } from 'lucide-react'

export function NotReadyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <Download className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold text-steel mb-2">Export & Manufacture</h2>
        <p className="text-steel-dim mb-4">
          Complete all stages to export your design files. You'll be able to download Gerbers, STL
          files, firmware binaries, and BOM.
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
