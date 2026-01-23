/**
 * ComparisonModal - Blueprint comparison overlay
 */

import { XCircle } from 'lucide-react'
import { EnclosureComparison } from './EnclosureComparison'
import type { VisualValidationResult } from '@/prompts/enclosure-validation'

interface ComparisonModalProps {
  blueprintUrl: string
  renderScreenshot: string | null
  validationResult: VisualValidationResult | null
  isValidating: boolean
  onClose: () => void
  onAccept: () => void
  onRegenerate: (feedback: string) => void
}

export function ComparisonModal({
  blueprintUrl,
  renderScreenshot,
  validationResult,
  isValidating,
  onClose,
  onAccept,
  onRegenerate,
}: ComparisonModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface-900 rounded-xl border border-surface-700 p-6 max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-steel">Blueprint Comparison</h3>
          <button onClick={onClose} className="text-steel-dim hover:text-steel">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <EnclosureComparison
          blueprintUrl={blueprintUrl}
          renderBase64={renderScreenshot}
          validationResult={validationResult}
          isValidating={isValidating}
          onAccept={onAccept}
          onRegenerate={onRegenerate}
        />
      </div>
    </div>
  )
}
