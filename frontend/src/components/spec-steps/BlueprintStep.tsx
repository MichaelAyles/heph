/**
 * BlueprintStep - Generates 8 product blueprint images
 *
 * Uses the LangGraph blueprint node via /api/langgraph/invoke/blueprint
 * Single invocation generates all variations - one debug breakpoint for all 8 images
 */

import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { isValidBlueprintUrl, withTimeout, IMAGE_TIMEOUT_MS } from './types'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import { useAuthStore } from '../../stores/auth'
import type { Project, ProjectSpec } from '../../db/schema'

interface BlueprintStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (blueprints: { url: string; prompt: string }[]) => void
  onCancel?: () => void
}

interface BlueprintImage {
  imageUrl: string
  prompt: string
  style: string
  variation: number
}

interface BlueprintResponse {
  output: {
    images: BlueprintImage[]
    imageUrl?: string
    prompt?: string
    style?: string
  }
  nodeId: string
  debug: {
    nodeName: string
    durationMs: number
  }
}

async function invokeBlueprints(
  projectId: string,
  count: number = 8
): Promise<{ url: string; prompt: string }[]> {
  // Single invocation generates all variations
  const data = await invokeLangGraphNode({
    nodeName: 'blueprint',
    input: { count },
    projectId,
  })

  const output = data.output as BlueprintResponse['output']

  // Map images array to expected format
  return output.images.map((img) => ({
    url: img.imageUrl,
    prompt: img.prompt,
  }))
}

export function BlueprintStep({ project, spec: _spec, onComplete, onCancel }: BlueprintStepProps) {
  // Note: spec is available but we get data from @projectState dynamic context instead
  void _spec
  const { user } = useAuthStore()
  const isDebugMode = user?.controlMode === 'debug_it'

  const [generating, setGenerating] = useState(true)
  const [blueprints, setBlueprints] = useState<{ url: string; prompt: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hasStarted) return

    setHasStarted(true)

    // Single invocation generates all 8 images
    // In debug mode, user sees one breakpoint and approves all 8 at once
    const timeout = isDebugMode ? IMAGE_TIMEOUT_MS * 8 : IMAGE_TIMEOUT_MS * 8 // 8x timeout for all images

    withTimeout(
      invokeBlueprints(project.id, 8),
      timeout,
      'Image generation timed out',
      { skipTimeout: isDebugMode } // No timeout in debug mode - user controls timing
    )
      .then((results) => {
        setBlueprints(results)
        setGenerating(false)
        if (results.length > 0) {
          onComplete(results)
        }
      })
      .catch((err) => {
        if (err instanceof BreakpointCancelledError) {
          setCancelled(true)
          setGenerating(false)
          onCancel?.()
          return
        }
        setError(err.message)
        setGenerating(false)
      })
  }, [hasStarted, project.id, isDebugMode, onCancel, onComplete])
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalImages = 8
  const completedCount = blueprints.length

  // Split blueprints into style groups for display
  const styleA = blueprints.filter((_, i) => i < 4)
  const styleB = blueprints.filter((_, i) => i >= 4)

  if (cancelled) {
    return <div className="text-steel-dim text-sm">Blueprint generation cancelled.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-copper mb-4">
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            <span className="text-sm font-mono">
              GENERATING BLUEPRINTS... ({completedCount}/{totalImages})
            </span>
          </>
        ) : (
          <span className="text-sm font-mono text-emerald-400">
            BLUEPRINTS COMPLETE ({completedCount}/{totalImages})
          </span>
        )}
      </div>

      {/* Style A: 3D Render prompts (1-4) */}
      <div>
        <p className="text-xs text-steel-dim mb-2 font-mono">STYLE A: 3D RENDER</p>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="aspect-square bg-surface-800 border border-surface-700 flex items-center justify-center"
            >
              {generating ? (
                <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
              ) : styleA[index] && isValidBlueprintUrl(styleA[index].url) ? (
                <img
                  src={styleA[index].url}
                  alt={`Blueprint ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : styleA[index] ? (
                <span className="text-steel-dim text-xs">No image</span>
              ) : (
                <XCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Style B: Product Photography prompts (5-8) */}
      <div>
        <p className="text-xs text-steel-dim mb-2 font-mono">STYLE B: PRODUCT PHOTOGRAPHY</p>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="aspect-square bg-surface-800 border border-surface-700 flex items-center justify-center"
            >
              {generating ? (
                <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
              ) : styleB[index] && isValidBlueprintUrl(styleB[index].url) ? (
                <img
                  src={styleB[index].url}
                  alt={`Blueprint ${index + 5}`}
                  className="w-full h-full object-cover"
                />
              ) : styleB[index] ? (
                <span className="text-steel-dim text-xs">No image</span>
              ) : (
                <XCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm">
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
