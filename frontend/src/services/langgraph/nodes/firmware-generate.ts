/**
 * Firmware Generate Node
 *
 * Generates ESP32-C6 firmware code for hardware projects.
 * Creates a complete PlatformIO project with all necessary files.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  FIRMWARE_SYSTEM_PROMPT,
  buildFirmwarePrompt,
  type FirmwareInput,
} from '../../../prompts/firmware'

// =============================================================================
// Schemas
// =============================================================================

const ComponentSchema = z.object({
  type: z.string(),
  pin: z.string().optional(),
  notes: z.string().optional(),
})

const CommunicationSchema = z.object({
  type: z.string(),
  protocol: z.string().optional(),
})

const PowerSchema = z.object({
  source: z.string(),
  voltage: z.string().optional(),
})

export const FirmwareGenerateInputSchema = z.object({
  projectName: z.string(),
  description: z.string(),
  inputs: z.array(ComponentSchema).default([]),
  outputs: z.array(ComponentSchema).default([]),
  communication: CommunicationSchema.default({ type: 'WiFi' }),
  power: PowerSchema.default({ source: 'USB' }),
  blocks: z.array(z.string()).default([]),
  i2cAddresses: z.record(z.string(), z.number()).optional(),
})
export type FirmwareGenerateInput = z.infer<typeof FirmwareGenerateInputSchema>

const FirmwareFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  type: z.enum(['cpp', 'h', 'ini', 'json']).optional(),
})

export const FirmwareGenerateOutputSchema = z.object({
  files: z.array(FirmwareFileSchema),
  dependencies: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
})
export type FirmwareGenerateOutput = z.infer<typeof FirmwareGenerateOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeFirmwareGenerate(
  input: FirmwareGenerateInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FirmwareGenerateOutput>> {
  // Use override prompt from database if available, otherwise use default
  const systemPrompt = context.systemPromptOverride || FIRMWARE_SYSTEM_PROMPT

  // Build firmware input for prompt
  const firmwareInput: FirmwareInput = {
    projectName: input.projectName,
    description: input.description,
    inputs: input.inputs,
    outputs: input.outputs,
    communication: input.communication,
    power: input.power,
    blocks: input.blocks,
  }

  const userPrompt = buildFirmwarePrompt(firmwareInput)

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract JSON from response
  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  // Validate and transform output
  const files = (parsed.files || []).map(
    (f: { path: string; content: string; language?: string }) => ({
      path: f.path,
      content: f.content,
      language: f.language,
      type: getFileType(f.path),
    })
  )

  // Extract dependencies from platformio.ini if present
  const platformioFile = files.find((f: { path: string }) => f.path.includes('platformio.ini'))
  const dependencies: string[] = []
  if (platformioFile) {
    const libDepsMatch = (platformioFile.content as string).match(
      /lib_deps\s*=\s*([\s\S]*?)(?:\n\[|$)/
    )
    if (libDepsMatch) {
      dependencies.push(
        ...libDepsMatch[1]
          .split('\n')
          .map((d: string) => d.trim())
          .filter((d: string) => d && !d.startsWith('['))
      )
    }
  }

  return {
    output: {
      files,
      dependencies,
      notes: parsed.notes,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

function getFileType(path: string): 'cpp' | 'h' | 'ini' | 'json' | undefined {
  if (path.endsWith('.cpp') || path.endsWith('.c')) return 'cpp'
  if (path.endsWith('.h') || path.endsWith('.hpp')) return 'h'
  if (path.endsWith('.ini')) return 'ini'
  if (path.endsWith('.json')) return 'json'
  return undefined
}

// =============================================================================
// Node Definition
// =============================================================================

export const firmwareGenerateNode: LangGraphNode<
  typeof FirmwareGenerateInputSchema,
  typeof FirmwareGenerateOutputSchema
> = {
  name: 'firmware_generate',
  description: 'Generate ESP32-C6 firmware code for hardware projects',
  type: 'chat',
  multimodal: false,
  inputSchema: FirmwareGenerateInputSchema,
  outputSchema: FirmwareGenerateOutputSchema,
  defaultTemperature: 0.3,
  category: 'firmware',
  invoke: invokeFirmwareGenerate,
}

// Register the node
registerNode(firmwareGenerateNode)
