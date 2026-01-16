/**
 * Firmware Stage Tools
 *
 * Tools for firmware generation and review.
 */

import { llm } from '../../llm'
import {
  buildFirmwarePrompt,
  buildFirmwareInputFromSpec,
  FIRMWARE_SYSTEM_PROMPT,
} from '@/prompts/firmware'
import { FIRMWARE_REVIEW_PROMPT } from '@/prompts/review'
import type { OrchestratorContext, ToolResult } from '../types'
import type { FirmwareFile } from '@/db/schema'

const validLanguages = ['cpp', 'c', 'h', 'json'] as const

function toFirmwareFile(f: { path: string; content: string; language?: string }): FirmwareFile {
  return {
    path: f.path,
    content: f.content,
    language: validLanguages.includes(f.language as (typeof validLanguages)[number])
      ? (f.language as FirmwareFile['language'])
      : 'cpp',
  }
}

/**
 * Generate firmware code
 */
export async function generateFirmware(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const enableWifi = args.enable_wifi as boolean | undefined
  const enableBle = args.enable_ble as boolean | undefined
  const enableOta = args.enable_ota as boolean | undefined
  const enableDeepSleep = args.enable_deep_sleep as boolean | undefined
  const feedback = args.feedback as string | undefined

  if (!ctx.currentSpec?.finalSpec || !ctx.currentSpec?.pcb) {
    return { error: 'Spec and PCB must be complete before firmware generation' }
  }

  const input = buildFirmwareInputFromSpec(
    ctx.currentSpec.finalSpec.name,
    ctx.currentSpec.finalSpec.summary,
    ctx.currentSpec.finalSpec,
    ctx.currentSpec.pcb
  )

  // Override preferences if provided
  if (enableWifi !== undefined) input.preferences.useWiFi = enableWifi
  if (enableBle !== undefined) input.preferences.useBLE = enableBle
  if (enableOta !== undefined) input.preferences.useOTA = enableOta
  if (enableDeepSleep !== undefined) input.power.deepSleepEnabled = enableDeepSleep

  // Build prompt, including feedback if this is a revision
  let userPrompt = buildFirmwarePrompt(input)
  if (feedback) {
    userPrompt += `\n\n## PREVIOUS REVIEW FEEDBACK - Address these issues:\n${feedback}`
  }

  const response = await llm.chat({
    messages: [
      { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 8192,
    projectId: ctx.projectId,
  })

  // Parse firmware files from JSON response
  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  let files: FirmwareFile[] = []

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const rawFiles = parsed.files || []
      files = rawFiles.map(toFirmwareFile)
    } catch {
      // If JSON parse fails, create a single main.cpp file
      files = [{ path: 'src/main.cpp', content: response.content, language: 'cpp' }]
    }
  } else {
    files = [{ path: 'src/main.cpp', content: response.content, language: 'cpp' }]
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.firmware = {
      files,
      buildStatus: 'pending',
    }
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ firmware: ctx.currentSpec.firmware })
  }

  // Return FULL files to orchestrator - it needs to see the code
  // With 1M context window, this is useful (~3-8K tokens)
  return {
    success: true,
    files, // FULL FILES - orchestrator sees all code
    fileCount: files.length,
    fileNames: files.map((f) => f.path),
    isRevision: !!feedback,
  }
}

/**
 * Review firmware against specification
 */
export async function reviewFirmware(
  ctx: OrchestratorContext,
  _args: Record<string, unknown>
): Promise<ToolResult> {
  const files = ctx.currentSpec?.firmware?.files
  if (!files || files.length === 0) {
    return { error: 'No firmware code to review' }
  }

  const spec = ctx.currentSpec?.finalSpec
  if (!spec) {
    return { error: 'No specification to review against' }
  }

  // Build context for the analyst
  const filesContent = files
    .map((f) => `### ${f.path}\n\`\`\`${f.language || 'cpp'}\n${f.content}\n\`\`\``)
    .join('\n\n')

  const reviewContext = `## Project Specification
Name: ${spec.name}
Summary: ${spec.summary}

## Inputs
${JSON.stringify(spec.inputs, null, 2)}

## Outputs
${JSON.stringify(spec.outputs, null, 2)}

## Power
${JSON.stringify(spec.power, null, 2)}

## Communication
${JSON.stringify(spec.communication, null, 2)}

## PCB Pin Assignments
${JSON.stringify(ctx.currentSpec?.pcb?.netList || {}, null, 2)}

## Firmware Files to Review
${filesContent}
`

  const response = await llm.chat({
    messages: [
      { role: 'system', content: FIRMWARE_REVIEW_PROMPT },
      { role: 'user', content: reviewContext },
    ],
    temperature: 0.2,
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
        missingFeatures: review.missingFeatures || [],
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
