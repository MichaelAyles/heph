/**
 * Blueprint Image Generation Prompt
 *
 * Generates prompts for creating 3D product renders.
 * Used with image generation models.
 */

/**
 * Builds a prompt for generating a simple 3D product render.
 * Returns 4 variations for the user to choose from.
 */
export function buildBlueprintPrompts(
  description: string,
  decisions: { question: string; answer: string }[],
  feasibility: {
    inputs?: { items: string[] }
    outputs?: { items: string[] }
    power?: { options: string[] }
  }
): string[] {
  // Extract key details
  const inputs = feasibility.inputs?.items || []
  const outputs = feasibility.outputs?.items || []

  // Find enclosure decision if made
  const enclosureDecision = decisions.find(d =>
    d.question.toLowerCase().includes('enclosure') ||
    d.question.toLowerCase().includes('form factor') ||
    d.question.toLowerCase().includes('style')
  )
  const enclosureStyle = enclosureDecision?.answer || 'compact handheld device'

  // Find power decision if made
  const powerDecision = decisions.find(d =>
    d.question.toLowerCase().includes('power') ||
    d.question.toLowerCase().includes('battery')
  )
  const powerType = powerDecision?.answer || 'rechargeable battery'

  // Build base description
  const baseDescription = `A ${enclosureStyle} electronic device: ${description}`

  // Features to include
  const features = [
    ...inputs.map(i => i.toLowerCase()),
    ...outputs.map(o => o.toLowerCase()),
    powerType.toLowerCase(),
  ].filter(Boolean).join(', ')

  // Generate 4 variations
  return [
    // Variation 1: Minimal, clean
    `Simple 3D product render of ${baseDescription}. Clean minimal design with smooth matte finish. Features: ${features}. White background, soft studio lighting, product mockup style. No text or labels.`,

    // Variation 2: Rounded, friendly
    `Simple 3D product render of ${baseDescription}. Rounded corners, friendly approachable design. Features: ${features}. Subtle gradient background, professional product photography style. No text or labels.`,

    // Variation 3: Industrial, robust
    `Simple 3D product render of ${baseDescription}. Industrial design with visible mounting points and robust construction. Features: ${features}. Neutral gray background, technical product visualization. No text or labels.`,

    // Variation 4: Sleek, modern
    `Simple 3D product render of ${baseDescription}. Sleek modern design with thin profile and premium finish. Features: ${features}. Dark background with subtle lighting, high-end product shot style. No text or labels.`,
  ]
}

/**
 * Generates a single prompt for a specific style
 */
export function buildSingleBlueprintPrompt(
  description: string,
  style: 'minimal' | 'rounded' | 'industrial' | 'sleek',
  features: string[]
): string {
  const featureList = features.join(', ')

  const styleDescriptions = {
    minimal: 'Clean minimal design with smooth matte finish, white background, soft studio lighting',
    rounded: 'Rounded corners, friendly approachable design, subtle gradient background',
    industrial: 'Industrial design with visible mounting points, robust construction, neutral gray background',
    sleek: 'Sleek modern design with thin profile and premium finish, dark background with subtle lighting',
  }

  return `Simple 3D product render of an electronic device: ${description}. ${styleDescriptions[style]}. Features: ${featureList}. Product mockup style. No text or labels.`
}
