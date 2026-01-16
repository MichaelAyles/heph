/**
 * Enclosure Stage Tools
 *
 * Tools for enclosure generation and review.
 */

import { llm } from '../../llm'
import {
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
  ENCLOSURE_SYSTEM_PROMPT,
} from '@/prompts/enclosure'
import { ENCLOSURE_REVIEW_PROMPT } from '@/prompts/review'
import { extractEnclosureDimensions, extractEnclosureFeatures } from '../helpers/code-parsing'
import type { OrchestratorContext, ToolResult } from '../types'

/**
 * Generate enclosure OpenSCAD code
 */
export async function generateEnclosure(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const style = args.style as string
  const wallThickness = args.wall_thickness as number | undefined
  const cornerRadius = args.corner_radius as number | undefined
  const feedback = args.feedback as string | undefined

  if (!ctx.currentSpec?.finalSpec || !ctx.currentSpec?.pcb) {
    return { error: 'Spec and PCB must be complete before enclosure generation' }
  }

  const input = buildEnclosureInputFromSpec(
    ctx.currentSpec.finalSpec.name,
    ctx.currentSpec.finalSpec.summary,
    ctx.currentSpec.pcb,
    ctx.currentSpec.finalSpec
  )

  // Override style if provided
  if (style) {
    input.style.type = style as 'box' | 'rounded_box' | 'handheld' | 'wall_mount' | 'desktop'
  }
  if (wallThickness) input.style.wallThickness = wallThickness
  if (cornerRadius) input.style.cornerRadius = cornerRadius

  // Build prompt, including feedback if this is a revision
  let userPrompt = buildEnclosurePrompt(input)
  if (feedback) {
    userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${feedback}`
  }

  const response = await llm.chat({
    messages: [
      { role: 'system', content: ENCLOSURE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 4096,
    projectId: ctx.projectId,
  })

  // Extract OpenSCAD code
  const codeMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/) || [
    null,
    response.content,
  ]
  const openScadCode = codeMatch[1]?.trim() || response.content

  if (ctx.currentSpec) {
    ctx.currentSpec.enclosure = {
      openScadCode,
      iterations: [],
    }
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ enclosure: ctx.currentSpec.enclosure })
  }

  // Return FULL code to orchestrator - it needs this to reason about the design
  // With 1M context window, this is useful, not wasteful (~2-5K tokens)
  const dimensions = extractEnclosureDimensions(openScadCode)
  const features = extractEnclosureFeatures(openScadCode)

  return {
    success: true,
    code: openScadCode, // FULL CODE - orchestrator sees everything
    codeLength: openScadCode.length,
    dimensions,
    features,
    isRevision: !!feedback,
  }
}

/**
 * Review enclosure against specification
 */
export async function reviewEnclosure(
  ctx: OrchestratorContext,
  _args: Record<string, unknown>
): Promise<ToolResult> {
  const code = ctx.currentSpec?.enclosure?.openScadCode
  if (!code) {
    return { error: 'No enclosure code to review' }
  }

  const spec = ctx.currentSpec?.finalSpec
  if (!spec) {
    return { error: 'No specification to review against' }
  }

  // Build context for the analyst
  const reviewContext = `## Project Specification
Name: ${spec.name}
Summary: ${spec.summary}

## Inputs
${JSON.stringify(spec.inputs, null, 2)}

## Outputs
${JSON.stringify(spec.outputs, null, 2)}

## Power
${JSON.stringify(spec.power, null, 2)}

## Enclosure Requirements
${JSON.stringify(spec.enclosure, null, 2)}

## PCB Dimensions
${JSON.stringify(ctx.currentSpec?.pcb?.boardSize || {}, null, 2)}

## OpenSCAD Code to Review
\`\`\`openscad
${code}
\`\`\`
`

  const response = await llm.chat({
    messages: [
      { role: 'system', content: ENCLOSURE_REVIEW_PROMPT },
      { role: 'user', content: reviewContext },
    ],
    temperature: 0.2, // Lower temp for more consistent analysis
    maxTokens: 2048,
    projectId: ctx.projectId,
  })

  // Parse the review response
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const review = JSON.parse(jsonMatch[0])
      return {
        success: true,
        score: review.score || 0,
        verdict: review.verdict || 'revise',
        issues: review.issues || [],
        positives: review.positives || [],
        summary: review.summary || 'Review completed',
      }
    }
  } catch {
    // If JSON parse fails, try to extract key info
  }

  return {
    success: true,
    score: 70,
    verdict: 'revise',
    issues: [{ severity: 'warning', description: 'Could not parse review response' }],
    summary: response.content.slice(0, 200),
  }
}
