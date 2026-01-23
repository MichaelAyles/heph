/**
 * SelectionStep - Blueprint selection with feedback and regeneration
 */

import { useState } from 'react'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'
import { isValidBlueprintUrl } from './types'

interface SelectionStepProps {
  blueprints: { url: string; prompt: string }[]
  onSelect: (index: number) => void
  onRegenerate: (index: number, feedback: string) => Promise<void>
}

export function SelectionStep({ blueprints, onSelect, onRegenerate }: SelectionStepProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)

  const handleRegenerate = async () => {
    if (selected === null || !feedback.trim()) return

    setIsRegenerating(true)
    try {
      await onRegenerate(selected, feedback.trim())
      setFeedback('')
      setSelected(null)
    } finally {
      setIsRegenerating(false)
    }
  }

  if (selected !== null) {
    const bp = blueprints[selected]

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-steel-dim hover:text-steel text-sm flex items-center gap-1"
        >
          ← Back to all designs
        </button>

        <div className="bg-surface-900 border border-surface-700 p-4">
          {isValidBlueprintUrl(bp.url) ? (
            <img
              src={bp.url}
              alt={`Design ${selected + 1}`}
              className="w-full max-h-96 object-contain mb-4"
            />
          ) : (
            <div className="w-full h-48 bg-surface-800 flex items-center justify-center mb-4">
              <span className="text-steel-dim text-sm">Image not available</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-steel-dim mb-2 tracking-wide">
                WANT TO CHANGE ANYTHING?
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g., Make it more rounded, add a visible antenna, change to blue color..."
                className="w-full px-4 py-3 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim text-sm focus:outline-none focus:border-copper resize-none"
                rows={3}
                disabled={isRegenerating}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRegenerate}
                disabled={!feedback.trim() || isRegenerating}
                className={clsx(
                  'flex-1 py-3 font-medium transition-all flex items-center justify-center gap-2',
                  feedback.trim() && !isRegenerating
                    ? 'bg-surface-700 text-steel hover:bg-surface-600'
                    : 'bg-surface-800 text-steel-dim cursor-not-allowed'
                )}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    Regenerating...
                  </>
                ) : (
                  'Regenerate with Changes'
                )}
              </button>

              <button
                onClick={() => onSelect(selected)}
                disabled={isRegenerating}
                className="flex-1 py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                I'm Happy - Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-steel mb-4">Click a design to review or customize it:</p>

      <div className="grid grid-cols-2 gap-4">
        {blueprints.map((bp, index) => (
          <button
            key={index}
            onClick={() => setSelected(index)}
            className="aspect-square border-2 border-surface-600 hover:border-copper/50 transition-all overflow-hidden"
          >
            {isValidBlueprintUrl(bp.url) ? (
              <img
                src={bp.url}
                alt={`Design ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-surface-800 flex items-center justify-center">
                <span className="text-steel-dim text-sm">No image</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
