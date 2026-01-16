/**
 * Spec Stage Tools
 *
 * Tools for the specification stage: feasibility, questions, blueprints, naming, finalize.
 */

import { llm } from '../../llm'
import { buildFeasibilityPrompt, FEASIBILITY_SYSTEM_PROMPT } from '@/prompts/feasibility'
import { NAMING_SYSTEM_PROMPT, buildNamingPrompt } from '@/prompts/naming'
import type { OrchestratorContext, ToolResult } from '../types'
import type { FinalSpec } from '@/db/schema'

/**
 * Analyze feasibility of the hardware description
 */
export async function analyzeFeasibility(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const description = args.description as string

  const response = await llm.chat({
    messages: [
      { role: 'system', content: FEASIBILITY_SYSTEM_PROMPT },
      { role: 'user', content: buildFeasibilityPrompt(description) },
    ],
    temperature: 0.3,
    projectId: ctx.projectId,
  })

  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON in feasibility response')
  }

  const feasibility = JSON.parse(jsonMatch[0])

  if (ctx.currentSpec) {
    ctx.currentSpec.feasibility = feasibility
    ctx.currentSpec.openQuestions = feasibility.openQuestions || []
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({
      feasibility,
      openQuestions: ctx.currentSpec.openQuestions,
    })
  }

  return {
    success: true,
    manufacturable: feasibility.manufacturable,
    score: feasibility.overallScore,
    openQuestionCount: ctx.currentSpec?.openQuestions?.length || 0,
  }
}

/**
 * Auto-answer open questions (VIBE IT mode)
 */
export async function answerQuestionsAuto(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const questionIds = args.questions as string[]
  const reasoning = args.reasoning as string

  if (!ctx.currentSpec?.openQuestions?.length) {
    return { error: 'No open questions to answer' }
  }

  const decisions = []
  for (const questionId of questionIds) {
    const question = ctx.currentSpec.openQuestions.find((q) => q.id === questionId)
    if (question) {
      // Pick first option as default in VIBE IT mode
      const answer = question.options[0]
      decisions.push({
        questionId,
        question: question.question,
        answer,
        timestamp: new Date().toISOString(),
      })
    }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.decisions = [...(ctx.currentSpec.decisions || []), ...decisions]
    await ctx.setSpec({ decisions: ctx.currentSpec.decisions })
  }

  return { success: true, answeredCount: decisions.length, reasoning }
}

/**
 * Generate blueprint images
 */
export async function generateBlueprints(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const styleHints = args.style_hints as string[]
  const description = ctx.currentSpec?.description || ''
  const blueprints: Array<{ url: string; prompt: string }> = []

  // Generate images in parallel
  const prompts = styleHints.map((style) => `${description} - ${style} style`)

  const results = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const response = await fetch('/api/llm/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!response.ok) throw new Error('Image generation failed')
      const data = await response.json()
      if (!data.imageUrl) throw new Error('No image returned')
      return { url: data.imageUrl, prompt }
    })
  )

  // Collect successful results
  for (const result of results) {
    if (result.status === 'fulfilled') {
      blueprints.push(result.value)
    }
  }

  if (blueprints.length === 0) {
    return { error: 'All image generations failed' }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.blueprints = blueprints
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ blueprints })
  }

  return { success: true, blueprintCount: blueprints.length }
}

/**
 * Select a blueprint
 */
export async function selectBlueprint(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const index = args.index as number
  const reasoning = args.reasoning as string

  if (!ctx.currentSpec?.blueprints || index >= ctx.currentSpec.blueprints.length) {
    return { error: 'Invalid blueprint index' }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.selectedBlueprint = index
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ selectedBlueprint: index })
  }

  return { success: true, selectedIndex: index, reasoning }
}

/**
 * Generate project name options
 */
export async function generateProjectNames(
  ctx: OrchestratorContext,
  _args: Record<string, unknown>
): Promise<ToolResult> {
  if (!ctx.currentSpec) {
    return { error: 'No spec to generate names for' }
  }

  const feasibility = ctx.currentSpec.feasibility || {}
  const decisions = ctx.currentSpec.decisions || []

  const prompt = buildNamingPrompt(
    ctx.currentSpec.description,
    {
      primaryFunction: (feasibility as { primaryFunction?: string }).primaryFunction,
      matchedComponents: (feasibility as { matchedComponents?: string[] }).matchedComponents,
    },
    decisions.map((d) => ({ question: d.question, answer: d.answer }))
  )

  const response = await llm.chat({
    messages: [
      { role: 'system', content: NAMING_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8, // Higher creativity for names
    maxTokens: 1024,
    projectId: ctx.projectId,
  })

  // Parse names from response
  let generatedNames: Array<{ name: string; style: string; reasoning: string }>
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      generatedNames = parsed.names || []
    } else {
      throw new Error('No JSON found')
    }
  } catch {
    // Fallback names if parsing fails
    generatedNames = [
      { name: 'Project Alpha', style: 'abstract', reasoning: 'Default fallback' },
      { name: 'DevBoard One', style: 'compound', reasoning: 'Default fallback' },
      { name: 'Prototype', style: 'punchy', reasoning: 'Default fallback' },
      { name: 'HardwareKit', style: 'descriptive', reasoning: 'Default fallback' },
    ]
  }

  ctx.setGeneratedNames(generatedNames)

  return {
    success: true,
    names: generatedNames,
    message: 'Generated 4 name options. Select one or provide a custom name.',
  }
}

/**
 * Select a project name
 */
export async function selectProjectName(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const index = args.index as number | undefined
  const customName = args.customName as string | undefined
  const reasoning = args.reasoning as string

  if (customName) {
    ctx.setSelectedProjectName(customName)
    return {
      success: true,
      selectedName: customName,
      reasoning: reasoning || 'Custom name provided',
    }
  }

  if (index !== undefined && index >= 0 && index < ctx.generatedNames.length) {
    const selectedName = ctx.generatedNames[index].name
    ctx.setSelectedProjectName(selectedName)
    return {
      success: true,
      selectedName,
      reasoning: reasoning || ctx.generatedNames[index].reasoning,
    }
  }

  return { error: 'Must provide either index (0-3) or customName' }
}

/**
 * Finalize the specification
 */
export async function finalizeSpec(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const confirm = args.confirm as boolean

  if (!confirm) {
    return { error: 'Confirmation required to finalize spec' }
  }

  // Generate final spec from decisions
  // Use selected name from naming step, or fallback to description
  const finalSpec: FinalSpec = {
    name: ctx.selectedProjectName || ctx.currentSpec?.description?.slice(0, 50) || 'Hardware Project',
    summary: ctx.currentSpec?.description || '',
    pcbSize: { width: 50.8, height: 38.1, unit: 'mm' },
    inputs: [],
    outputs: [],
    power: { source: 'USB-C', voltage: '5V', current: '500mA' },
    communication: { type: 'WiFi', protocol: 'HTTP/MQTT' },
    enclosure: { style: 'rounded_box', width: 60, height: 45, depth: 25 },
    estimatedBOM: [],
    locked: true,
    lockedAt: new Date().toISOString(),
  }

  // Extract from decisions
  for (const decision of ctx.currentSpec?.decisions || []) {
    if (!decision.question || !decision.answer) continue
    const q = decision.question.toLowerCase()
    const a = decision.answer.toLowerCase()

    if (q.includes('power')) {
      finalSpec.power.source = decision.answer
    }
    if (q.includes('display')) {
      if (a.includes('oled')) {
        finalSpec.outputs.push({ type: 'OLED Display', count: 1, notes: '0.96" I2C' })
      }
    }
    if (q.includes('led')) {
      const count = parseInt(a) || 4
      finalSpec.outputs.push({ type: 'WS2812B LEDs', count, notes: 'RGB addressable' })
    }
  }

  // Add from feasibility
  if (ctx.currentSpec?.feasibility) {
    for (const input of ctx.currentSpec.feasibility.inputs.items) {
      finalSpec.inputs.push({ type: input, count: 1, notes: '' })
    }
    for (const output of ctx.currentSpec.feasibility.outputs.items) {
      if (!output) continue
      if (!finalSpec.outputs.some((o) => o.type?.toLowerCase().includes(output.toLowerCase()))) {
        finalSpec.outputs.push({ type: output, count: 1, notes: '' })
      }
    }
  }

  if (ctx.currentSpec) {
    ctx.currentSpec.finalSpec = finalSpec
    if (ctx.currentSpec.stages) {
      ctx.currentSpec.stages.spec = { status: 'complete', completedAt: new Date().toISOString() }
    }
    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ finalSpec, stages: ctx.currentSpec.stages })
  }

  return { success: true, specLocked: true }
}
