/**
 * Firmware Generate Node
 *
 * Generates ESP32-C6 firmware code for hardware projects.
 * Creates a complete PlatformIO project with all necessary files.
 *
 * All context comes from @variables in the system prompt:
 * - @projectName: Product name
 * - @description: User's project description
 * - @finalSpec: Final specification with inputs/outputs/communication/power
 * - @pcb.placedBlocks: Placed blocks for component info
 * - @pcb.netList: GPIO assignments
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

// Input is empty - all context comes from @variables in system prompt
export const FirmwareGenerateInputSchema = z.object({})
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
  _input: FirmwareGenerateInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FirmwareGenerateOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Generate the complete PlatformIO firmware project based on the context provided. Return a JSON object with a "files" array containing all necessary source files.`

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
  contextTypes: ['projectState'], // Enables @projectName, @description, @finalSpec, @pcb.*
  invoke: invokeFirmwareGenerate,
}

// Register the node
registerNode(firmwareGenerateNode)
