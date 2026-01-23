/**
 * Shared types for spec step components
 */

export interface SuggestedRevisions {
  summary: string
  changes: string[]
  revisedDescription: string
}

/** Check if a blueprint URL is valid (not a placeholder) */
export function isValidBlueprintUrl(url: string | undefined): boolean {
  if (!url) return false
  // Valid URLs start with http or /api and don't contain "placeholder"
  const isValidPrefix = url.startsWith('http') || url.startsWith('/api')
  const isPlaceholder = url.includes('placeholder')
  return isValidPrefix && !isPlaceholder
}

/** Generate an image from a prompt */
export async function generateImage(prompt: string): Promise<string> {
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

export const IMAGE_TIMEOUT_MS = 60000

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}
