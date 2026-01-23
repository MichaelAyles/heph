/**
 * NotReadyState - Displayed when enclosure stage prerequisites are not met
 */

import { Box, ArrowRight } from 'lucide-react'
import type { NotReadyStateProps } from './types'

export function NotReadyState({
  title = 'Enclosure Design',
  description = 'Complete the PCB stage first. The enclosure will be generated based on your board dimensions and component placement.',
}: NotReadyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <Box className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold text-steel mb-2">{title}</h2>
        <p className="text-steel-dim mb-4">{description}</p>
        <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
          <span>Design PCB</span>
          <ArrowRight className="w-4 h-4" />
          <span>Generate Enclosure</span>
        </div>
      </div>
    </div>
  )
}
