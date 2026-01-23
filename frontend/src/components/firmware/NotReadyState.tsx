/**
 * NotReadyState - Displayed when firmware stage prerequisites are not met
 */

import { Code, ArrowRight } from 'lucide-react'

interface NotReadyStateProps {
  title?: string
  description?: string
}

export function NotReadyState({
  title = 'Firmware Development',
  description = 'Complete the enclosure stage first. Firmware will be generated based on your hardware configuration and pin assignments.',
}: NotReadyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <Code className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold text-steel mb-2">{title}</h2>
        <p className="text-steel-dim mb-4">{description}</p>
        <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
          <span>Generate Enclosure</span>
          <ArrowRight className="w-4 h-4" />
          <span>Write Firmware</span>
        </div>
      </div>
    </div>
  )
}
