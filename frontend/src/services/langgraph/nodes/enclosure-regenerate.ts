/**
 * Enclosure Regenerate Node
 *
 * Regenerates OpenSCAD code based on user feedback.
 * Used for iterative refinement of enclosure designs.
 *
 * Context from @variables (via projectState):
 * - @projectName: Product name
 * - @description: User's project description
 * - @pcb.boardSize: Board dimensions
 * - @finalSpec: Final specification with inputs/outputs
 *
 * Runtime inputs (must be passed):
 * - currentCode: Current OpenSCAD code to modify
 * - feedback: User feedback for changes
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureRegenerateInputSchema = z.object({
  // Runtime inputs - current code and feedback are passed at invocation time
  currentCode: z.string().min(1, 'Current OpenSCAD code is required'),
  feedback: z.string().min(1, 'Feedback is required'),
})
export type EnclosureRegenerateInput = z.infer<typeof EnclosureRegenerateInputSchema>

export const EnclosureRegenerateOutputSchema = z.object({
  openScadCode: z.string(),
  changesApplied: z.array(z.string()),
  designNotes: z.string().optional(),
})
export type EnclosureRegenerateOutput = z.infer<typeof EnclosureRegenerateOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureRegenerate(
  input: EnclosureRegenerateInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureRegenerateOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Build user prompt with current code and feedback
  const userPrompt = `Modify the following OpenSCAD enclosure code based on the user's feedback.

User Feedback:
${input.feedback}

Current OpenSCAD Code:
\`\`\`openscad
${input.currentCode}
\`\`\`

Output the modified code in a single code block. After the code, briefly explain what changes were made.`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract OpenSCAD code from response
  let openScadCode = response.content
  const codeBlockMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    openScadCode = codeBlockMatch[1].trim()
  }

  // Parse changes applied from the feedback
  const changesApplied = [input.feedback]

  // Try to extract design notes
  let designNotes: string | undefined
  const afterCodeMatch = response.content.match(/```[\s\S]*?```\s*([\s\S]+)$/)
  if (afterCodeMatch) {
    designNotes = afterCodeMatch[1].trim()
  }

  return {
    output: {
      openScadCode,
      changesApplied,
      designNotes,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureRegenerateNode: LangGraphNode<
  typeof EnclosureRegenerateInputSchema,
  typeof EnclosureRegenerateOutputSchema
> = {
  name: 'enclosure_regenerate',
  description: 'Regenerate OpenSCAD based on user feedback',
  type: 'chat',
  multimodal: false,
  inputSchema: EnclosureRegenerateInputSchema,
  outputSchema: EnclosureRegenerateOutputSchema,
  defaultTemperature: 0.3,
  category: 'enclosure',
  contextTypes: ['projectState'], // Enables @projectName, @description, @pcb.boardSize, @finalSpec
  invoke: invokeEnclosureRegenerate,
}

// Register the node
registerNode(enclosureRegenerateNode)
