/**
 * Zod schemas for LLM response validation
 *
 * These schemas can be used with extractAndValidateJson() from functions/lib/json.ts
 * to safely parse and validate LLM responses.
 *
 * Example usage:
 * ```typescript
 * import { extractAndValidateJson } from '@/../functions/lib/json'
 * import { FeasibilityResponseSchema } from '@/schemas/llm-responses'
 *
 * const result = extractAndValidateJson(response.content, FeasibilityResponseSchema)
 * if (!result.success) {
 *   console.error('Failed to parse response:', result.error)
 *   return
 * }
 * const data = result.data // Fully typed!
 * ```
 */

import { z } from 'zod'

// =============================================================================
// Feasibility Analysis Schemas
// =============================================================================

// Suggested revisions when a project is rejected
export const SuggestedRevisionsSchema = z
  .object({
    summary: z.string(),
    changes: z.array(z.string()),
    revisedDescription: z.string(),
  })
  .optional()

// Open questions from feasibility analysis
export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional().default([]),
  category: z.string().optional(),
  impact: z.string().optional(),
})

// Category schemas for feasibility analysis
const CommunicationCategorySchema = z.object({
  type: z.string(),
  confidence: z.number(),
  notes: z.string(),
})

const ProcessingCategorySchema = z.object({
  level: z.string(),
  confidence: z.number(),
  notes: z.string(),
})

const PowerCategorySchema = z.object({
  options: z.array(z.string()),
  confidence: z.number(),
  notes: z.string(),
})

const ItemsCategorySchema = z.object({
  items: z.array(z.string()),
  confidence: z.number(),
})

// Feasibility response - permissive schema that accepts LLM variations
export const FeasibilityResponseSchema = z
  .object({
    manufacturable: z.boolean(),
    rejectionReason: z.string().optional(),
    suggestedRevisions: SuggestedRevisionsSchema,
    communication: CommunicationCategorySchema.optional(),
    processing: ProcessingCategorySchema.optional(),
    power: PowerCategorySchema.optional(),
    inputs: ItemsCategorySchema.optional(),
    outputs: ItemsCategorySchema.optional(),
    overallScore: z.number().min(0).max(100).optional(),
    openQuestions: z.array(OpenQuestionSchema).optional().default([]),
  })
  .passthrough()

export type FeasibilityResponse = z.infer<typeof FeasibilityResponseSchema>

// =============================================================================
// Refinement Schemas
// =============================================================================

export const RefinementResponseSchema = z
  .object({
    complete: z.boolean().optional(),
    additionalQuestions: z.array(OpenQuestionSchema).optional().default([]),
  })
  .passthrough()

export type RefinementResponse = z.infer<typeof RefinementResponseSchema>

// =============================================================================
// Final Spec Schemas
// =============================================================================

// Final spec - matches FinalSpec interface from schema.ts
// Using permissive schema since LLM may include extra fields
export const FinalSpecResponseSchema = z
  .object({
    name: z.string(),
    summary: z.string(),
  })
  .passthrough()

export type FinalSpecResponse = z.infer<typeof FinalSpecResponseSchema>

// =============================================================================
// Firmware Schemas
// =============================================================================

export const FirmwareFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
})

export const FirmwareProjectSchema = z.object({
  files: z.array(FirmwareFileSchema),
  entryPoint: z.string().optional(),
  buildCommand: z.string().optional(),
  notes: z.string().optional(),
})

export type FirmwareFile = z.infer<typeof FirmwareFileSchema>
export type FirmwareProject = z.infer<typeof FirmwareProjectSchema>

// =============================================================================
// Block Selection Schemas
// =============================================================================

export const BlockSelectionResponseSchema = z.object({
  selectedBlocks: z.array(
    z.object({
      blockId: z.string(),
      quantity: z.number().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      notes: z.string().optional(),
    })
  ),
  reasoning: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

export type BlockSelectionResponse = z.infer<typeof BlockSelectionResponseSchema>

// =============================================================================
// Enclosure Schemas
// =============================================================================

export const EnclosureResponseSchema = z.object({
  openscad: z.string(),
  notes: z.string().optional(),
  warnings: z.array(z.string()).optional(),
})

export type EnclosureResponse = z.infer<typeof EnclosureResponseSchema>
