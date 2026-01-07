/**
 * Enclosure Comparison Component
 *
 * Displays side-by-side comparison of blueprint and generated enclosure render
 * with visual validation scores and feedback options.
 */

import { clsx } from 'clsx'
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, ThumbsUp } from 'lucide-react'
import type { VisualValidationResult } from '@/prompts/enclosure-validation'

interface EnclosureComparisonProps {
  blueprintUrl: string
  renderBase64: string | null
  validationResult: VisualValidationResult | null
  isValidating: boolean
  onAccept: () => void
  onRegenerate: (feedback: string) => void
}

/**
 * Score category labels for display
 */
const SCORE_LABELS: Record<keyof VisualValidationResult['scores'], string> = {
  formFactor: 'Form Factor',
  featurePlacement: 'Feature Placement',
  visualStyle: 'Visual Style',
  assembly: 'Assembly',
}

/**
 * Get color class based on score value
 */
function getScoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

/**
 * Get background color class based on score value
 */
function getScoreBgClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500/20'
  if (score >= 60) return 'bg-yellow-500/20'
  return 'bg-red-500/20'
}

export function EnclosureComparison({
  blueprintUrl,
  renderBase64,
  validationResult,
  isValidating,
  onAccept,
  onRegenerate,
}: EnclosureComparisonProps) {
  return (
    <div className="space-y-4">
      {/* Side-by-side images */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Blueprint (Design Intent) */}
        <div className="border border-surface-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-surface-800 border-b border-surface-700">
            <h4 className="text-sm font-medium text-steel">Design Intent (Blueprint)</h4>
          </div>
          <div className="aspect-square bg-surface-900 flex items-center justify-center">
            <img
              src={blueprintUrl}
              alt="Blueprint"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>

        {/* Right: Generated Render */}
        <div className="border border-surface-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-surface-800 border-b border-surface-700">
            <h4 className="text-sm font-medium text-steel">Generated Enclosure</h4>
          </div>
          <div className="aspect-square bg-surface-900 flex items-center justify-center">
            {renderBase64 ? (
              <img
                src={`data:image/png;base64,${renderBase64}`}
                alt="Generated enclosure"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-steel-dim">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Rendering...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Results */}
      {isValidating && (
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-700">
          <div className="flex items-center gap-2 text-steel">
            <Loader2 className="w-4 h-4 animate-spin text-copper" />
            <span>Comparing render to blueprint...</span>
          </div>
        </div>
      )}

      {validationResult && !isValidating && (
        <div className="bg-surface-800 rounded-lg border border-surface-700 overflow-hidden">
          {/* Header with overall score */}
          <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-medium text-steel">Comparison Results</h4>
              {validationResult.matches ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Good Match</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Needs Improvement</span>
                </div>
              )}
            </div>
            <div
              className={clsx(
                'px-3 py-1 rounded-full text-sm font-medium',
                getScoreBgClass(validationResult.overallScore),
                getScoreColorClass(validationResult.overallScore)
              )}
            >
              {validationResult.overallScore}% Match
            </div>
          </div>

          {/* Score breakdown */}
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {(Object.entries(validationResult.scores) as [keyof typeof validationResult.scores, number][]).map(
                ([key, score]) => (
                  <div
                    key={key}
                    className="bg-surface-900 rounded-lg p-3 text-center"
                  >
                    <div className="text-xs text-steel-dim mb-1">
                      {SCORE_LABELS[key]}
                    </div>
                    <div
                      className={clsx(
                        'text-xl font-semibold',
                        getScoreColorClass(score)
                      )}
                    >
                      {score}%
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Issues list */}
            {validationResult.issues.length > 0 && (
              <div className="mb-4">
                <h5 className="text-xs text-steel-dim uppercase tracking-wider mb-2">
                  Issues Found
                </h5>
                <ul className="space-y-1.5">
                  {validationResult.issues.map((issue, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-steel bg-surface-900 px-3 py-2 rounded"
                    >
                      <span
                        className={clsx(
                          'px-1.5 py-0.5 rounded text-xs font-medium shrink-0 uppercase',
                          issue.category === 'formFactor' && 'bg-purple-500/20 text-purple-400',
                          issue.category === 'featurePlacement' && 'bg-blue-500/20 text-blue-400',
                          issue.category === 'visualStyle' && 'bg-pink-500/20 text-pink-400',
                          issue.category === 'assembly' && 'bg-orange-500/20 text-orange-400'
                        )}
                      >
                        {issue.category.slice(0, 6)}
                      </span>
                      <span className="text-steel-dim">{issue.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fix instructions */}
            {validationResult.fixInstructions &&
              validationResult.fixInstructions !== 'No specific fix instructions provided' && (
                <div className="mb-4 p-3 bg-surface-900 rounded-lg border border-surface-700">
                  <h5 className="text-xs text-steel-dim uppercase tracking-wider mb-2">
                    Suggested Fix
                  </h5>
                  <p className="text-sm text-steel">{validationResult.fixInstructions}</p>
                </div>
              )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={onAccept}
                className="flex-1 px-4 py-2.5 bg-copper text-surface-900 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-copper-light transition-colors"
              >
                <ThumbsUp className="w-4 h-4" />
                Accept Design
              </button>
              <button
                onClick={() => onRegenerate(validationResult.fixInstructions)}
                className="flex-1 px-4 py-2.5 bg-surface-700 text-steel rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-surface-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate with Fixes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EnclosureComparison
