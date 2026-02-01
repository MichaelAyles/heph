/**
 * Firmware Modify Node
 *
 * Modifies existing firmware based on chat input.
 * Used for iterative refinement of ESP32-C6 code.
 *
 * Context from @variables (via projectState):
 * - @finalSpec: Final specification with inputs/outputs/communication
 * - @pcb.netList: GPIO assignments for pin references
 *
 * Runtime inputs (must be passed):
 * - currentFiles: Current source files to modify
 * - request: Modification request from user
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

const FirmwareFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  type: z.enum(['cpp', 'h', 'ini', 'json']).optional(),
})

export const FirmwareModifyInputSchema = z.object({
  // Runtime inputs - files and request are passed at invocation time
  currentFiles: z.array(FirmwareFileSchema),
  request: z.string().min(1, 'Modification request is required'),
})
export type FirmwareModifyInput = z.infer<typeof FirmwareModifyInputSchema>

export const FirmwareModifyOutputSchema = z.object({
  files: z.array(FirmwareFileSchema),
  changesApplied: z.array(z.string()),
  notes: z.string().optional(),
})
export type FirmwareModifyOutput = z.infer<typeof FirmwareModifyOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeFirmwareModify(
  input: FirmwareModifyInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FirmwareModifyOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Format current files for the prompt
  const filesText = input.currentFiles
    .map((f) => `### ${f.path}\n\`\`\`${f.language || 'cpp'}\n${f.content}\n\`\`\``)
    .join('\n\n')

  // Build user prompt with files and request
  const userPrompt = `Modify the following firmware files based on the user's request.

User Request:
${input.request}

Current Files:
${filesText}

Return a JSON object with a "files" array containing all modified source files. Include all files, even if unchanged.`

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

  // Generate changes summary
  const changesApplied = generateChangesSummary(input.currentFiles, files, input.request)

  return {
    output: {
      files,
      changesApplied,
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

function generateChangesSummary(
  oldFiles: Array<{ path: string; content: string }>,
  newFiles: Array<{ path: string; content: string }>,
  request: string
): string[] {
  const changes: string[] = []

  // Check for new files
  const oldPaths = new Set(oldFiles.map((f) => f.path))
  const newPaths = new Set(newFiles.map((f) => f.path))

  for (const path of newPaths) {
    if (!oldPaths.has(path)) {
      changes.push(`Added new file: ${path}`)
    }
  }

  for (const path of oldPaths) {
    if (!newPaths.has(path)) {
      changes.push(`Removed file: ${path}`)
    }
  }

  // Check for modified files
  for (const newFile of newFiles) {
    const oldFile = oldFiles.find((f) => f.path === newFile.path)
    if (oldFile && oldFile.content !== newFile.content) {
      changes.push(`Modified: ${newFile.path}`)
    }
  }

  // Add request as context
  if (changes.length === 0) {
    changes.push(`Applied request: ${request.slice(0, 100)}${request.length > 100 ? '...' : ''}`)
  }

  return changes
}

// =============================================================================
// Node Definition
// =============================================================================

export const firmwareModifyNode: LangGraphNode<
  typeof FirmwareModifyInputSchema,
  typeof FirmwareModifyOutputSchema
> = {
  name: 'firmware_modify',
  description: 'Modify firmware based on chat input',
  type: 'chat',
  multimodal: false,
  inputSchema: FirmwareModifyInputSchema,
  outputSchema: FirmwareModifyOutputSchema,
  defaultTemperature: 0.3,
  category: 'firmware',
  contextTypes: ['projectState'], // Enables @finalSpec, @pcb.netList for context
  invoke: invokeFirmwareModify,
}

// Register the node
registerNode(firmwareModifyNode)
