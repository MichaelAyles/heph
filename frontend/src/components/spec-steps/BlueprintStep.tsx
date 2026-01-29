/**
 * BlueprintStep - Generates 8 product blueprint images in parallel
 *
 * Uses the LangGraph blueprint node via /api/langgraph/invoke/blueprint
 */

import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { isValidBlueprintUrl, withTimeout, IMAGE_TIMEOUT_MS } from './types'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import type { Project, ProjectSpec } from '../../db/schema'

interface BlueprintStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (blueprints: { url: string; prompt: string }[]) => void
  onCancel?: () => void
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
  const data = await invokeLangGraphNode({
    nodeName: 'blueprint',
    input: {
      description,
      decisions,
      feasibility,
      variation,
    },
    projectId,
  })

  const output = data.output as BlueprintResponse['output']
  return { url: output.imageUrl, prompt: output.prompt }
}

export function BlueprintStep({ project, spec, onComplete, onCancel }: BlueprintStepProps) {
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
  const [cancelled, setCancelled] = useState(false)

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
          if (err instanceof BreakpointCancelledError) {
            setCancelled(true)
            // Stop all pending generations by marking them done
            setGenerating([false, false, false, false, false, false, false, false])
            onCancel?.()
            return
          }
          const errorMsg = `Image ${index + 1}: ${err.message}`
          setErrors((prev) => [...prev, errorMsg])
          setGenerating((prev) => {
            const updated = [...prev]
            updated[index] = false
            return updated
          })
        })
    }
  }, [hasStarted, project.id, spec.description, spec.decisions, spec.feasibility])

  useEffect(() => {
    if (hasCompleted || cancelled) return

    const allDone = generating.every((g) => !g)
    const validBlueprints = blueprints.filter(
      (b): b is { url: string; prompt: string } => b !== null
    )

    if (allDone && validBlueprints.length > 0) {
      setHasCompleted(true)
      onComplete(validBlueprints)
    }
  }, [generating, blueprints, onComplete, hasCompleted, cancelled])
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
