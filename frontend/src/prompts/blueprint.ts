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
    communication?: { type: string }
    processing?: { level: string }
  }
): string[] {
  // Find form factor decision if made
  const formFactorDecision = decisions.find(d =>
    d.question.toLowerCase().includes('enclosure') ||
    d.question.toLowerCase().includes('form factor') ||
    d.question.toLowerCase().includes('housing') ||
    d.question.toLowerCase().includes('mount')
  )
  const formFactor = formFactorDecision?.answer

  // Find display decision if made
  const displayDecision = decisions.find(d =>
    d.question.toLowerCase().includes('display') ||
    d.question.toLowerCase().includes('screen') ||
    d.question.toLowerCase().includes('lcd')
  )
  const displayType = displayDecision?.answer

  // Build visual elements list (things you'd actually SEE on the device)
  const visualElements: string[] = []

  // Add display if present
  if (displayType) {
    visualElements.push(displayType.toLowerCase())
  }

  // Add visible outputs (LEDs, screens, etc.)
  const outputs = feasibility.outputs?.items || []
  outputs.forEach(o => {
    const lower = o.toLowerCase()
    if (lower.includes('led') || lower.includes('display') || lower.includes('screen') || lower.includes('button')) {
      visualElements.push(lower)
    }
  })

  // Add visible inputs (buttons, sensors with probes, etc.)
  const inputs = feasibility.inputs?.items || []
  inputs.forEach(i => {
    const lower = i.toLowerCase()
    if (lower.includes('button') || lower.includes('probe') || lower.includes('moisture') || lower.includes('switch')) {
      visualElements.push(lower)
    }
  })

  // Add USB/charging port if battery powered
  const powerOptions = feasibility.power?.options || []
  if (powerOptions.some(p => p.toLowerCase().includes('usb') || p.toLowerCase().includes('battery'))) {
    visualElements.push('USB-C charging port')
  }

  const visualFeatures = visualElements.length > 0
    ? `Visible features: ${[...new Set(visualElements)].join(', ')}.`
    : ''

  // Build the core product description - this is the MOST important part
  const productCore = description

  // Form factor hint
  const formHint = formFactor ? `, ${formFactor.toLowerCase()} style` : ''

  // Generate 4 variations with product description as the focus
  return [
    // Variation 1: Minimal, clean
    `3D product render: ${productCore}. A small consumer electronics device${formHint}. Clean minimal design, smooth white plastic shell, rounded edges. ${visualFeatures} White background, soft studio lighting. No text.`,

    // Variation 2: Compact, friendly
    `3D product render: ${productCore}. Compact handheld gadget${formHint}. Friendly rounded design, matte finish, subtle color accents. ${visualFeatures} Gradient background, product photography style. No text.`,

    // Variation 3: Rugged, outdoor
    `3D product render: ${productCore}. Durable outdoor device${formHint}. Rugged construction, weather-resistant look, dark enclosure with grip texture. ${visualFeatures} Gray background, technical product shot. No text.`,

    // Variation 4: Premium, modern
    `3D product render: ${productCore}. Premium smart device${formHint}. Sleek modern design, thin profile, brushed aluminum accents. ${visualFeatures} Dark background, dramatic lighting. No text.`,
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
