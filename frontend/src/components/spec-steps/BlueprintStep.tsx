import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { buildBlueprintPrompts } from '@/prompts/blueprint'
import type { BlueprintStepProps } from './types'

const IMAGE_TIMEOUT_MS = 60000 // 60 seconds per image

async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('/api/llm/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error('Image generation failed')
  const data = await response.json()
  if (!data.imageUrl) throw new Error('No image returned')
  return data.imageUrl
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export function BlueprintStep({ project: _project, spec, onComplete }: BlueprintStepProps) {
  // 8 images: 4 Style A (adjective-heavy) + 4 Style B (structured photography)
  const [generating, setGenerating] = useState<boolean[]>([
    true, true, true, true, true, true, true, true,
  ])
  const [blueprints, setBlueprints] = useState<({ url: string; prompt: string } | null)[]>([
    null, null, null, null, null, null, null, null,
  ])
  const [errors, setErrors] = useState<string[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)

  useEffect(() => {
    if (hasStarted) return // Already started generation

    setHasStarted(true)

    const prompts = buildBlueprintPrompts(
      spec.description,
      spec.decisions || [],
      spec.feasibility || {}
    )

    // Generate all images in parallel with timeout
    prompts.forEach((prompt, index) => {
      withTimeout(generateImage(prompt), IMAGE_TIMEOUT_MS, 'Image generation timed out after 60s')
        .then((url) => {
          setBlueprints((prev) => {
            const updated = [...prev]
            updated[index] = { url, prompt }
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
    })
  }, [hasStarted, spec.description, spec.decisions, spec.feasibility])

  // Check if all done
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
              ) : blueprints[index] ? (
                <img
                  src={blueprints[index].url}
                  alt={`Blueprint ${index + 1}`}
                  className="w-full h-full object-cover"
                />
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
              ) : blueprints[index] ? (
                <img
                  src={blueprints[index].url}
                  alt={`Blueprint ${index + 1}`}
                  className="w-full h-full object-cover"
                />
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
