/**
 * Enclosure Fix Node
 *
 * Auto-fixes validation issues in OpenSCAD code.
 * Takes the original code and validation issues, returns fixed code.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { buildFixPrompt, type ValidationIssue } from '../../../prompts/enclosure-validation'

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
  openScadCode: z.string().min(1, 'OpenSCAD code is required'),
  issues: z.array(ValidationIssueSchema),
  pcbWidth: z.number().positive(),
  pcbHeight: z.number().positive(),
  pcbThickness: z.number().positive().default(1.6),
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
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  // Convert Zod-parsed issues to ValidationIssue type
  const issues: ValidationIssue[] = input.issues.map((issue) => ({
    severity: issue.severity,
    category: issue.category,
    description: issue.description,
    location: issue.location,
    fix: issue.fix,
  }))

  const userPrompt = buildFixPrompt(input.openScadCode, issues, {
    pcbWidth: input.pcbWidth,
    pcbHeight: input.pcbHeight,
  })

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
  const changesApplied = issues
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
  invoke: invokeEnclosureFix,
}

// Register the node
registerNode(enclosureFixNode)
