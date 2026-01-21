/**
 * CapabilityCard Component
 *
 * Shows capability assessment results inline in chat messages.
 */

import { clsx } from 'clsx'
import type { CapabilityAssessment, ChatRoute } from '../../db/schema'

interface CapabilityCardProps {
  assessment: CapabilityAssessment
  route?: ChatRoute
}

export function CapabilityCard({ assessment, route }: CapabilityCardProps) {
  const confidencePercent = Math.round(assessment.confidence * 100)

  const routeColors: Record<string, string> = {
    PROCEED: 'border-green-500 bg-green-500/10',
    CLARIFY: 'border-yellow-500 bg-yellow-500/10',
    REJECT: 'border-red-500 bg-red-500/10',
  }

  const routeIcons: Record<string, string> = {
    PROCEED: '✓',
    CLARIFY: '?',
    REJECT: '✗',
  }

  return (
    <div
      className={clsx(
        'rounded-md border p-3',
        route ? routeColors[route] : 'border-zinc-600 bg-zinc-700/50'
      )}
    >
      {/* Header with route and confidence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {route && (
            <span
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold',
                route === 'PROCEED' && 'bg-green-500 text-white',
                route === 'CLARIFY' && 'bg-yellow-500 text-black',
                route === 'REJECT' && 'bg-red-500 text-white'
              )}
            >
              {routeIcons[route]}
            </span>
          )}
          <span className="text-sm font-medium">
            {assessment.canBuild ? 'Can Build' : 'Cannot Build'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-20 rounded-full bg-zinc-600">
            <div
              className={clsx(
                'h-full rounded-full',
                confidencePercent >= 70 && 'bg-green-500',
                confidencePercent >= 40 && confidencePercent < 70 && 'bg-yellow-500',
                confidencePercent < 40 && 'bg-red-500'
              )}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400">{confidencePercent}%</span>
        </div>
      </div>

      {/* Missing capabilities */}
      {assessment.missingCapabilities.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-medium text-zinc-400">Missing:</span>
          <ul className="mt-1 space-y-0.5">
            {assessment.missingCapabilities.map((cap, i) => (
              <li key={i} className="text-xs text-zinc-300">
                • {cap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Alternatives */}
      {assessment.suggestedAlternatives.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-medium text-zinc-400">Alternatives:</span>
          <ul className="mt-1 space-y-0.5">
            {assessment.suggestedAlternatives.map((alt, i) => (
              <li key={i} className="text-xs text-zinc-300">
                • {alt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
