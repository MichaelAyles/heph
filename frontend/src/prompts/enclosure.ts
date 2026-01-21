/**
 * Enclosure generation prompt stubs
 * Used to generate OpenSCAD enclosure code for hardware projects.
 */

import type { FinalSpec } from '../db/schema'

export interface EnclosureInput {
  projectName: string
  description: string
  boardWidth: number
  boardHeight: number
  boardThickness: number
  wallThickness: number
  features: string[]
}

export interface VisionEnclosureInput {
  pcbWidth: number
  pcbHeight: number
  wallThickness: number
  features: string[]
}

export interface PCBArtifacts {
  boardSize?: { width: number; height: number }
  placedBlocks?: Array<{ blockSlug: string; gridX: number; gridY: number }>
}

export const ENCLOSURE_SYSTEM_PROMPT = `You are an OpenSCAD enclosure designer. Generate clean, parametric OpenSCAD code for 3D-printable enclosures.

Guidelines:
- Use mm as the unit
- Include wall thickness, clearance, and tolerance parameters
- Create mounting posts for PCB
- Add cutouts for connectors and displays
- Use hull() and difference() for smooth shapes
- Add snap-fit features or screw posts for lid attachment

Output only valid OpenSCAD code, no explanations.`

export const ENCLOSURE_VISION_SYSTEM_PROMPT = `You are an OpenSCAD enclosure designer with access to product blueprint images. Analyze the visual design and generate matching OpenSCAD code.

When reviewing the blueprint:
1. Note the overall shape (rectangular, rounded, organic)
2. Identify button, LED, and display positions
3. Consider the intended form factor
4. Match the aesthetic style shown

Output only valid OpenSCAD code that captures the visual design intent.`

export function buildEnclosureInputFromSpec(
  projectName: string,
  description: string,
  pcbArtifacts: PCBArtifacts | null,
  finalSpec?: FinalSpec
): EnclosureInput {
  const boardWidth = pcbArtifacts?.boardSize?.width ?? finalSpec?.pcbSize?.width ?? 50
  const boardHeight = pcbArtifacts?.boardSize?.height ?? finalSpec?.pcbSize?.height ?? 40

  const features = buildFeatureList(finalSpec ?? null)

  return {
    projectName,
    description,
    boardWidth,
    boardHeight,
    boardThickness: 1.6,
    wallThickness: 2,
    features,
  }
}

export function buildFeatureList(spec: FinalSpec | Record<string, unknown> | null): string[] {
  const features: string[] = []

  if (!spec || typeof spec !== 'object') return features

  const finalSpec = spec as FinalSpec

  finalSpec.inputs?.forEach((input) => {
    if (input.type.toLowerCase().includes('button')) features.push(`${input.count} button(s)`)
    if (input.type.toLowerCase().includes('sensor')) features.push('sensor port')
  })

  finalSpec.outputs?.forEach((output) => {
    if (output.type.toLowerCase().includes('led')) features.push('LED window')
    if (output.type.toLowerCase().includes('display')) features.push('display opening')
    if (output.type.toLowerCase().includes('speaker') || output.type.toLowerCase().includes('buzzer')) {
      features.push('speaker grille')
    }
  })

  if (finalSpec.power?.source?.toLowerCase().includes('usb')) {
    features.push('USB-C port cutout')
  }
  if (finalSpec.power?.source?.toLowerCase().includes('battery')) {
    features.push('battery compartment')
  }

  return features
}

export function buildEnclosurePrompt(input: EnclosureInput): string {
  return `Generate OpenSCAD code for a 3D-printable enclosure with these specifications:

Project: ${input.projectName}
Description: ${input.description}

PCB Dimensions: ${input.boardWidth}mm x ${input.boardHeight}mm x ${input.boardThickness}mm
Wall Thickness: ${input.wallThickness}mm

Required Features:
${input.features.map((f) => `- ${f}`).join('\n') || '- Basic enclosure with lid'}

Generate parametric OpenSCAD code with:
1. Base with PCB mounting posts
2. Lid with snap-fit or screw attachment
3. Appropriate cutouts for connectors
4. Clearance of 0.5mm around PCB`
}

export function buildVisionEnclosurePrompt(input: VisionEnclosureInput): string {
  return `Generate OpenSCAD code for a 3D-printable enclosure with these specifications:

PCB Dimensions: ${input.pcbWidth}mm x ${input.pcbHeight}mm
Wall Thickness: ${input.wallThickness}mm

Required Features:
${input.features.map((f) => `- ${f}`).join('\n') || '- Basic enclosure with lid'}

Analyze the product blueprint image and generate matching OpenSCAD code.
Match the visual style shown in the blueprint image. Pay attention to:
- Overall shape and proportions
- Surface details and textures
- Button/indicator placement
- Aesthetic style (industrial, consumer, minimalist, etc.)

Generate parametric OpenSCAD code with:
1. Base with PCB mounting posts
2. Lid with snap-fit or screw attachment
3. Appropriate cutouts for connectors
4. Clearance of 0.5mm around PCB`
}

export function buildEnclosureRegenerationPrompt(
  currentCode: string,
  feedback: string,
  input: EnclosureInput
): string {
  return `Modify this OpenSCAD enclosure based on user feedback:

Current Code:
\`\`\`openscad
${currentCode}
\`\`\`

User Feedback: ${feedback}

Original Specifications:
- Project: ${input.projectName}
- Board: ${input.boardWidth}mm x ${input.boardHeight}mm
- Features: ${input.features.join(', ')}

Generate updated OpenSCAD code that addresses the feedback while maintaining structural integrity.`
}
