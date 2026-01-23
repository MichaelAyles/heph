/**
 * GenerateStep - Initial enclosure generation step with validation status
 */

import { clsx } from 'clsx'
import { Wand2, Loader2, XCircle } from 'lucide-react'
import type { GenerateStepProps } from './types'
import { MAX_VALIDATION_ITERATIONS } from './types'

export function GenerateStep({
  pcbWidth,
  pcbHeight,
  wasmLoaded,
  isGenerating,
  validationStatus,
  validationIteration,
  validationIssues,
  renderError,
  onGenerate,
}: GenerateStepProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <div className="w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mx-auto mb-4">
          <Wand2 className="w-8 h-8 text-copper" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-semibold text-steel mb-2">Generate Enclosure</h3>
        <p className="text-steel-dim mb-6">
          The AI will generate a parametric OpenSCAD enclosure based on your PCB dimensions (
          {pcbWidth}mm x {pcbHeight}mm) and component placement.
        </p>

        {!wasmLoaded && (
          <p className="text-xs text-surface-500 mb-4">
            <Loader2 className="w-3 h-3 inline-block animate-spin mr-1" />
            Loading OpenSCAD engine...
          </p>
        )}

        {/* Validation Status During Generation */}
        {isGenerating && validationStatus && (
          <div className="mb-6 p-4 bg-surface-800 rounded-lg border border-surface-700">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-copper animate-spin" />
              <span className="text-sm text-steel font-medium">{validationStatus}</span>
            </div>
            {validationIteration > 0 && (
              <div className="flex gap-1 justify-center mt-2">
                {Array.from({ length: MAX_VALIDATION_ITERATIONS }).map((_, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-2 h-2 rounded-full transition-colors',
                      i < validationIteration ? 'bg-copper' : 'bg-surface-600'
                    )}
                  />
                ))}
              </div>
            )}
            {validationIssues.length > 0 && (
              <div className="mt-3 text-left text-xs space-y-1 max-h-32 overflow-y-auto">
                {validationIssues.slice(0, 5).map((issue, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'flex items-start gap-2 p-2 rounded',
                      issue.severity === 'critical' && 'bg-red-500/10 text-red-400',
                      issue.severity === 'warning' && 'bg-yellow-500/10 text-yellow-400',
                      issue.severity === 'suggestion' && 'bg-blue-500/10 text-blue-400'
                    )}
                  >
                    <span className="uppercase font-semibold shrink-0">
                      {issue.severity.slice(0, 4)}
                    </span>
                    <span className="text-steel-dim">{issue.description}</span>
                  </div>
                ))}
                {validationIssues.length > 5 && (
                  <p className="text-surface-500">+{validationIssues.length - 5} more issues</p>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={clsx(
            'px-6 py-3 rounded-lg font-medium transition-all',
            isGenerating
              ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
              : 'bg-copper text-surface-900 hover:bg-copper-light'
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 inline-block animate-spin mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 inline-block mr-2" />
              Generate Enclosure
            </>
          )}
        </button>

        {renderError && (
          <p className="mt-4 text-red-400 text-sm">
            <XCircle className="w-4 h-4 inline-block mr-1" />
            {renderError}
          </p>
        )}
      </div>
    </div>
  )
}
