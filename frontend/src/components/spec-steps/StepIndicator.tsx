/**
 * StepIndicator - Visual progress indicator for spec pipeline steps
 */

import { clsx } from 'clsx'
import { Loader2, CheckCircle2, Circle, XCircle, ChevronRight, Zap, Image, FileCheck } from 'lucide-react'

const STEPS = [
  { id: 'feasibility', name: 'Feasibility', icon: Zap },
  { id: 'refine', name: 'Refine', icon: CheckCircle2 },
  { id: 'blueprints', name: 'Blueprints', icon: Image },
  { id: 'select', name: 'Select', icon: CheckCircle2 },
  { id: 'finalize', name: 'Finalize', icon: FileCheck },
]

interface StepIndicatorProps {
  currentStep: number
  status: string
}

export function StepIndicator({ currentStep, status }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, index) => {
        const isComplete = index < currentStep
        const isCurrent = index === currentStep

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-sm font-medium',
                isComplete && 'text-emerald-400',
                isCurrent && 'text-copper bg-copper/10 border border-copper/30',
                !isComplete && !isCurrent && 'text-steel-dim'
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
              ) : isCurrent ? (
                status === 'rejected' ? (
                  <XCircle className="w-4 h-4 text-red-400" strokeWidth={1.5} />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                )
              ) : (
                <Circle className="w-4 h-4" strokeWidth={1.5} />
              )}
              {step.name}
            </div>
            {index < STEPS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-surface-600 mx-1" strokeWidth={1.5} />
            )}
          </div>
        )
      })}
    </div>
  )
}
