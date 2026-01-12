import { clsx } from 'clsx'
import type { FeasibilityResultsProps } from './types'

export function FeasibilityResults({ feasibility, onContinue }: FeasibilityResultsProps) {
  const categories = [
    { key: 'communication', label: 'Communication', data: feasibility.communication },
    { key: 'processing', label: 'Processing', data: feasibility.processing },
    { key: 'power', label: 'Power', data: feasibility.power },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-steel">Feasibility Analysis</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-steel-dim">Score:</span>
            <span
              className={clsx(
                'text-xl font-bold',
                feasibility.overallScore >= 80 && 'text-emerald-400',
                feasibility.overallScore >= 60 &&
                  feasibility.overallScore < 80 &&
                  'text-yellow-400',
                feasibility.overallScore < 60 && 'text-red-400'
              )}
            >
              {feasibility.overallScore}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {categories.map(({ key, label, data }) => (
            <div key={key} className="bg-surface-800 border border-surface-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-steel">{label}</span>
                <span className="text-xs text-steel-dim">{data.confidence}%</span>
              </div>
              <p className="text-sm text-copper mb-1">
                {'type' in data
                  ? data.type
                  : 'level' in data
                    ? data.level
                    : data.options?.join(', ')}
              </p>
              <p className="text-xs text-steel-dim">{data.notes}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface-800 border border-surface-700 p-4">
            <span className="text-sm font-medium text-steel block mb-2">Inputs</span>
            <ul className="text-sm text-steel-dim space-y-1">
              {feasibility.inputs.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-800 border border-surface-700 p-4">
            <span className="text-sm font-medium text-steel block mb-2">Outputs</span>
            <ul className="text-sm text-steel-dim space-y-1">
              {feasibility.outputs.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
        >
          Continue to Refinement
        </button>
      </div>
    </div>
  )
}
