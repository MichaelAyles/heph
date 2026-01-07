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
  const formFactorDecision = decisions.find(
    (d) =>
      d.question.toLowerCase().includes('enclosure') ||
      d.question.toLowerCase().includes('form factor') ||
      d.question.toLowerCase().includes('housing') ||
      d.question.toLowerCase().includes('mount')
  )
  const formFactor = formFactorDecision?.answer

  // Find display decision if made
  const displayDecision = decisions.find(
    (d) =>
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
  outputs.forEach((o) => {
    const lower = o.toLowerCase()
    if (
      lower.includes('led') ||
      lower.includes('display') ||
      lower.includes('screen') ||
      lower.includes('button')
    ) {
      visualElements.push(lower)
    }
  })

  // Add visible inputs (buttons, sensors with probes, etc.)
  const inputs = feasibility.inputs?.items || []
  inputs.forEach((i) => {
    const lower = i.toLowerCase()
    if (
      lower.includes('button') ||
      lower.includes('probe') ||
      lower.includes('moisture') ||
      lower.includes('switch')
    ) {
      visualElements.push(lower)
    }
  })

  // Add USB/charging port if battery powered
  const powerOptions = feasibility.power?.options || []
  if (
    powerOptions.some((p) => p.toLowerCase().includes('usb') || p.toLowerCase().includes('battery'))
  ) {
    visualElements.push('USB-C charging port')
  }

  const visualFeatures =
    visualElements.length > 0 ? `Visible features: ${[...new Set(visualElements)].join(', ')}.` : ''

  // Build the core product description - this is the MOST important part
  const productCore = description

  // Form factor hint
  const formHint = formFactor ? `, ${formFactor.toLowerCase()} style` : ''

  // Generate 4 variations with product description as the focus (Style A: adjective-heavy)
  const styleA = [
    // Variation 1: Minimal, clean
    `3D product render: ${productCore}. A small consumer electronics device${formHint}. Clean minimal design, smooth solid white plastic shell, rounded edges, completely opaque enclosure. ${visualFeatures} White background, soft studio lighting. No text, no transparent parts, no clear windows.`,

    // Variation 2: Compact, friendly
    `3D product render: ${productCore}. Compact handheld gadget${formHint}. Friendly rounded design, solid matte finish, subtle color accents, opaque plastic housing. ${visualFeatures} Gradient background, product photography style. No text, no transparent elements.`,

    // Variation 3: Rugged, outdoor
    `3D product render: ${productCore}. Durable outdoor device${formHint}. Rugged construction, weather-resistant look, solid dark enclosure with grip texture. ${visualFeatures} Gray background, technical product shot. No text, no clear panels.`,

    // Variation 4: Premium, modern
    `3D product render: ${productCore}. Premium smart device${formHint}. Sleek modern design, thin profile, solid brushed aluminum accents. ${visualFeatures} Dark background, dramatic lighting. No text, no transparent windows.`,
  ]

  // Style B: Structured professional photography style
  // Map form factor to descriptive text
  const formFactorMap: Record<string, string> = {
    handheld: 'handheld device, ergonomic grip, portable size',
    desktop: 'desktop device, sits on a table or desk',
    'wall mount': 'wall-mounted unit, flat back, mounting hardware',
    'wall-mounted': 'wall-mounted unit, flat back, mounting hardware',
    wearable: 'wearable device, small and lightweight, strap or clip',
    industrial: 'industrial enclosure, rugged, possibly rack-mounted',
    portable: 'portable device, compact and lightweight',
  }

  // Find matching form factor description
  let formFactorDesc = 'compact consumer electronics device'
  if (formFactor) {
    const lowerForm = formFactor.toLowerCase()
    for (const [key, value] of Object.entries(formFactorMap)) {
      if (lowerForm.includes(key)) {
        formFactorDesc = value
        break
      }
    }
  }

  // Build base prompt for Style B
  const basePromptB = `Product concept render: ${productCore}

Style: Professional product photography, clean white background, soft studio lighting
Form factor: ${formFactorDesc}
Features: ${visualElements.length > 0 ? [...new Set(visualElements)].join(', ') : 'clean interface, minimal controls'}
Materials: Modern consumer electronics aesthetic, solid opaque matte plastic or metal finish, no transparent or clear parts
View: 3/4 perspective showing the device's main interface and form

High quality, photorealistic product render, no text or labels, no clear windows or transparent panels`

  // Style B: 4 variations with simple suffix
  const styleB = [
    basePromptB,
    `${basePromptB}\n\nVariation 2: Explore a slightly different design approach.`,
    `${basePromptB}\n\nVariation 3: Explore a slightly different design approach.`,
    `${basePromptB}\n\nVariation 4: Explore a slightly different design approach.`,
  ]

  // Return all 8 prompts: 4 from Style A, then 4 from Style B
  return [...styleA, ...styleB]
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
    minimal:
      'Clean minimal design with smooth matte finish, white background, soft studio lighting',
    rounded: 'Rounded corners, friendly approachable design, subtle gradient background',
    industrial:
      'Industrial design with visible mounting points, robust construction, neutral gray background',
    sleek:
      'Sleek modern design with thin profile and premium finish, dark background with subtle lighting',
  }

  return `Simple 3D product render of an electronic device: ${description}. ${styleDescriptions[style]}. Features: ${featureList}. Product mockup style. No text or labels.`
}
