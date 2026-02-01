/**
 * Enclosure Fix Node
 *
 * Auto-fixes validation issues in OpenSCAD code.
 * Takes the original code and validation issues, returns fixed code.
 *
 * Context from @variables (via projectState):
 * - @pcb.boardSize: Board dimensions for constraint fixes
 *
 * Runtime inputs (must be passed):
 * - openScadCode: Code to fix (not yet saved to spec)
 * - issues: Validation issues to fix
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

const ValidationIssueSchema = z.object({
  severity: z.enum(['critical', 'warning', 'suggestion']),
  category: z.string(),
  description: z.string(),
  location: z.string().optional(),
  fix: z.string(),
})

export const EnclosureFixInputSchema = z.object({
  // Runtime inputs - code and issues are passed at invocation time
  openScadCode: z.string().min(1, 'OpenSCAD code is required'),
  issues: z.array(ValidationIssueSchema),
})
export type EnclosureFixInput = z.infer<typeof EnclosureFixInputSchema>

export const EnclosureFixOutputSchema = z.object({
  fixedCode: z.string(),
  changesApplied: z.array(z.string()),
  remainingIssues: z.array(z.string()),
})
export type EnclosureFixOutput = z.infer<typeof EnclosureFixOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureFix(
  input: EnclosureFixInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureFixOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Format issues for the prompt
  const issuesText = input.issues
    .map(
      (issue, i) => `${i + 1}. [${issue.severity}] ${issue.category}: ${issue.description}
   Fix: ${issue.fix}${issue.location ? `\n   Location: ${issue.location}` : ''}`
    )
    .join('\n\n')

  // Build user prompt with code and issues
  const userPrompt = `Fix the following issues in the OpenSCAD code:

Issues to fix:
${issuesText}

Current OpenSCAD Code:
\`\`\`openscad
${input.openScadCode}
\`\`\`

Output the fixed code in a single code block.`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.2,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract OpenSCAD code from response
  let fixedCode = response.content
  const codeBlockMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    fixedCode = codeBlockMatch[1].trim()
  }

  // Build changes applied from issues that were marked for fixing
  const changesApplied = input.issues
    .filter((issue) => issue.severity === 'critical' || issue.severity === 'warning')
    .map((issue) => `${issue.category}: ${issue.description}`)

  return {
    output: {
      fixedCode,
      changesApplied,
      remainingIssues: [], // Would need another validation pass to determine
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureFixNode: LangGraphNode<
  typeof EnclosureFixInputSchema,
  typeof EnclosureFixOutputSchema
> = {
  name: 'enclosure_fix',
  description: 'Auto-fix validation issues in OpenSCAD code',
  type: 'chat',
  multimodal: false,
  inputSchema: EnclosureFixInputSchema,
  outputSchema: EnclosureFixOutputSchema,
  defaultTemperature: 0.2,
  category: 'enclosure',
  contextTypes: ['projectState'], // Enables @pcb.boardSize for constraint fixes
  invoke: invokeEnclosureFix,
}

// Register the node
registerNode(enclosureFixNode)
