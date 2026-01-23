/**
 * EnclosureStepIndicator - Visual step indicator for enclosure workflow
 */

import { clsx } from 'clsx'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface EnclosureStepIndicatorProps {
  step: number
  label: string
  active: boolean
  complete: boolean
}

export function EnclosureStepIndicator({
  step,
  label,
  active,
  complete,
}: EnclosureStepIndicatorProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
        active && 'bg-copper/20 text-copper',
        complete && 'bg-emerald-500/20 text-emerald-400',
        !active && !complete && 'text-steel-dim'
      )}
    >
      {complete ? (
        <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
      ) : active ? (
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
      ) : (
        <span className="w-4 h-4 flex items-center justify-center text-xs">{step}</span>
      )}
      <span>{label}</span>
    </div>
  )
}
