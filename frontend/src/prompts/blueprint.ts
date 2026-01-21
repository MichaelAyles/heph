/**
 * Blueprint prompt stubs
 * Used to generate product visualization prompts for image generation.
 */

import type { Decision, FeasibilityAnalysis } from '../db/schema'

/**
 * Generate 8 image generation prompts for product blueprints.
 * First 4 are 3D render style, next 4 are product photography style.
 */
export function buildBlueprintPrompts(
  description: string,
  decisions: Decision[],
  feasibility: FeasibilityAnalysis | Record<string, unknown>
): string[] {
  // Extract key features from decisions
  const features = decisions.map((d) => d.answer).join(', ')

  // Extract inputs/outputs from feasibility if available
  const inputs = (feasibility as FeasibilityAnalysis)?.inputs?.items?.join(', ') || 'sensors'
  const outputs = (feasibility as FeasibilityAnalysis)?.outputs?.items?.join(', ') || 'LEDs'

  const baseDescription = `A modern IoT hardware device: ${description}. Features: ${features}. Inputs: ${inputs}. Outputs: ${outputs}.`

  // Style A: 3D Render prompts (adjective-heavy)
  const styleA = [
    `Professional 3D render of ${baseDescription} Sleek minimal enclosure, matte finish, soft studio lighting, product visualization, octane render, 8k, ultra detailed`,
    `Isometric 3D render of ${baseDescription} Clean geometric design, rounded corners, ambient occlusion, product mockup, blender cycles, photorealistic`,
    `Technical 3D render of ${baseDescription} Exploded view showing internal PCB, component callouts, engineering visualization, white background`,
    `Lifestyle 3D render of ${baseDescription} Placed in modern home environment, contextual usage, warm lighting, depth of field, architectural visualization`,
  ]

  // Style B: Product photography prompts (structured)
  const styleB = [
    `Professional product photography of ${baseDescription} Shot on white seamless background, soft box lighting, Canon EOS R5, 100mm macro lens, f/8`,
    `Editorial product photography of ${baseDescription} Dramatic single light source, dark moody background, high contrast, commercial photography`,
    `Flat lay product photography of ${baseDescription} Top-down view with accessories, marble surface, natural light, lifestyle branding`,
    `Detail product photography of ${baseDescription} Extreme close-up of key features, shallow depth of field, studio lighting, macro photography`,
  ]

  return [...styleA, ...styleB]
}
