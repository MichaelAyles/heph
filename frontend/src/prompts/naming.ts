/**
 * Project Naming Prompts
 *
 * Generates creative, distinctive project names based on the hardware description.
 */

export const NAMING_SYSTEM_PROMPT = `You are a creative product naming specialist. Generate distinctive, memorable names for hardware projects.

## Naming Styles

1. **Descriptive Compound** - Combine function words creatively (AirPulse, LightSync, TempWatch)
2. **Abstract/Evocative** - Names that evoke feeling without being literal (Zephyr, Nimbus, Helix)
3. **Portmanteau** - Blend two relevant words (Plantastic, Humidify, Sensify)
4. **Short & Punchy** - Single memorable words or abbreviations (Blink, Flux, Node)

## Rules

- NO generic prefixes: "Smart", "IoT", "Connected", "Digital", "Auto"
- NO generic suffixes: "Hub", "Station", "System", "Device", "Unit"
- Keep names 1-2 words, max 15 characters
- Names should be pronounceable and memorable
- Each suggestion should be a DIFFERENT style
- Consider the project's primary function and personality

## Output Format

Return JSON array of exactly 4 name options:
{
  "names": [
    { "name": "Zephyr", "style": "abstract", "reasoning": "Evokes air movement for ventilation project" },
    { "name": "BreatheSense", "style": "compound", "reasoning": "Combines breathing and sensing" },
    { "name": "Airity", "style": "portmanteau", "reasoning": "Blend of air and quality" },
    { "name": "Puff", "style": "punchy", "reasoning": "Short, playful, relates to air" }
  ]
}`

export function buildNamingPrompt(
  description: string,
  feasibility: {
    primaryFunction?: string
    matchedComponents?: string[]
  },
  decisions: { question: string; answer: string }[]
): string {
  const components = feasibility.matchedComponents?.join(', ') || 'various sensors'
  const decisionsText = decisions
    .slice(0, 3)
    .map((d) => `- ${d.answer}`)
    .join('\n')

  return `Generate 4 creative name options for this hardware project.

## Project Description
"${description}"

## Key Components
${components}

## Design Choices
${decisionsText || '- Standard configuration'}

## Primary Function
${feasibility.primaryFunction || 'Environmental monitoring and control'}

Generate 4 distinct names using different naming styles. Be creative and avoid generic tech naming patterns.`
}
