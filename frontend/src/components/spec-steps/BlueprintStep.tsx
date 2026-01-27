/**
 * BlueprintStep - Generates 8 product blueprint images in parallel
 *
 * Uses the LangGraph blueprint node via /api/langgraph/invoke/blueprint
 */

import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { isValidBlueprintUrl, withTimeout, IMAGE_TIMEOUT_MS } from './types'
import type { Project, ProjectSpec } from '../../db/schema'

interface BlueprintStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (blueprints: { url: string; prompt: string }[]) => void
}

interface BlueprintResponse {
  output: {
    imageUrl: string
    prompt: string
    style: string
  }
  nodeId: string
  debug: {
    nodeName: string
    durationMs: number
  }
}

async function invokeBlueprint(
  projectId: string,
  description: string,
  decisions: { questionId: string; question: string; answer: string; timestamp?: string }[],
  feasibility: { inputs?: { items?: string[] }; outputs?: { items?: string[] } } | undefined,
  variation: number
): Promise<{ url: string; prompt: string }> {
  const response = await fetch('/api/langgraph/invoke/blueprint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        description,
        decisions,
        feasibility,
        variation,
      },
      projectId,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Request failed: ${response.status}`)
  }

  const data: BlueprintResponse = await response.json()
  return { url: data.output.imageUrl, prompt: data.output.prompt }
}

export function BlueprintStep({ project, spec, onComplete }: BlueprintStepProps) {
  // 8 images: 4 Style A (adjective-heavy) + 4 Style B (structured photography)
  const [generating, setGenerating] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ])
  const [blueprints, setBlueprints] = useState<({ url: string; prompt: string } | null)[]>([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ])
  const [errors, setErrors] = useState<string[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hasStarted) return

    setHasStarted(true)

    // Generate 8 images in parallel (variations 1-8)
    for (let variation = 1; variation <= 8; variation++) {
      const index = variation - 1

      withTimeout(
        invokeBlueprint(
          project.id,
          spec.description,
          spec.decisions || [],
          spec.feasibility
            ? {
                inputs: { items: spec.feasibility.inputs?.items },
                outputs: { items: spec.feasibility.outputs?.items },
              }
            : undefined,
          variation
        ),
        IMAGE_TIMEOUT_MS,
        'Image generation timed out after 60s'
      )
        .then((result) => {
          setBlueprints((prev) => {
            const updated = [...prev]
            updated[index] = result
            return updated
          })
          setGenerating((prev) => {
            const updated = [...prev]
            updated[index] = false
            return updated
          })
        })
        .catch((err) => {
          setErrors((prev) => [...prev, `Image ${index + 1}: ${err.message}`])
          setGenerating((prev) => {
            const updated = [...prev]
            updated[index] = false
            return updated
          })
        })
    }
  }, [hasStarted, project.id, spec.description, spec.decisions, spec.feasibility])

  useEffect(() => {
    if (hasCompleted) return

    const allDone = generating.every((g) => !g)
    const validBlueprints = blueprints.filter(
      (b): b is { url: string; prompt: string } => b !== null
    )

    if (allDone && validBlueprints.length > 0) {
      setHasCompleted(true)
      onComplete(validBlueprints)
    }
  }, [generating, blueprints, onComplete, hasCompleted])
  /* eslint-enable react-hooks/set-state-in-effect */

  const activeCount = generating.filter(Boolean).length
  const totalImages = 8

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-copper mb-4">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        <span className="text-sm font-mono">
          GENERATING BLUEPRINTS... ({totalImages - activeCount}/{totalImages})
        </span>
      </div>

      {/* Style A: Adjective-heavy prompts (1-4) */}
      <div>
        <p className="text-xs text-steel-dim mb-2 font-mono">STYLE A: 3D RENDER</p>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="aspect-square bg-surface-800 border border-surface-700 flex items-center justify-center"
            >
              {generating[index] ? (
                <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
              ) : blueprints[index] && isValidBlueprintUrl(blueprints[index].url) ? (
                <img
                  src={blueprints[index].url}
                  alt={`Blueprint ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : blueprints[index] ? (
                <span className="text-steel-dim text-xs">No image</span>
              ) : (
                <XCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Style B: Structured photography prompts (5-8) */}
      <div>
        <p className="text-xs text-steel-dim mb-2 font-mono">STYLE B: PRODUCT PHOTOGRAPHY</p>
        <div className="grid grid-cols-4 gap-3">
          {[4, 5, 6, 7].map((index) => (
            <div
              key={index}
              className="aspect-square bg-surface-800 border border-surface-700 flex items-center justify-center"
            >
              {generating[index] ? (
                <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
              ) : blueprints[index] && isValidBlueprintUrl(blueprints[index].url) ? (
                <img
                  src={blueprints[index].url}
                  alt={`Blueprint ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : blueprints[index] ? (
                <span className="text-steel-dim text-xs">No image</span>
              ) : (
                <XCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
              )}
            </div>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="text-red-400 text-sm">
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}
    </div>
  )
}
