import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import type { RejectionDisplayProps } from './types'

export function RejectionDisplay({ reason, suggestedRevisions, onAcceptRevision }: RejectionDisplayProps) {
  const navigate = useNavigate()

  const handleRequestFeature = () => {
    const subject = encodeURIComponent('Component Request - PHAESTUS')
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to request support for a component that isn't currently available.\n\nRejection reason:\n${reason}\n\nThank you!`
    )
    window.open(`mailto:contact@phaestus.app?subject=${subject}&body=${body}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/30 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-4">
          <AlertTriangle className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-lg font-semibold">Project Cannot Be Built As Specified</span>
        </div>
        <p className="text-steel mb-4">{reason}</p>

        {suggestedRevisions && (
          <div className="bg-surface-800 border border-surface-600 p-4 mb-4">
            <h4 className="text-copper font-medium mb-2">{suggestedRevisions.summary}</h4>
            <ul className="text-steel-dim text-sm space-y-1 mb-4">
              {suggestedRevisions.changes.map((change, i) => (
                <li key={i}>• {change}</li>
              ))}
            </ul>
            <div className="bg-surface-900 border border-surface-700 p-3 mb-4">
              <span className="text-xs text-steel-dim font-mono block mb-1">
                REVISED SPECIFICATION
              </span>
              <p className="text-steel text-sm">{suggestedRevisions.revisedDescription}</p>
            </div>
            {onAcceptRevision && (
              <button
                onClick={() => onAcceptRevision(suggestedRevisions.revisedDescription)}
                className="w-full py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
              >
                Use Revised Specification
              </button>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/new')}
            className="px-6 py-2 bg-surface-700 text-steel hover:bg-surface-600 transition-colors"
          >
            Start New Project
          </button>
          <button
            onClick={handleRequestFeature}
            className="px-6 py-2 bg-copper/20 text-copper border border-copper/30 hover:bg-copper/30 transition-colors"
          >
            Request Component
          </button>
        </div>
      </div>
    </div>
  )
}
