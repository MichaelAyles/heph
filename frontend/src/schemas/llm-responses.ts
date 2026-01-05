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

export const FeasibilityCategorySchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.string(),
})

export const FeasibilityResponseSchema = z.object({
  manufacturable: z.boolean(),
  rejectionReason: z.string().optional(),
  suggestedRevisions: z.array(z.string()).optional(),
  communication: FeasibilityCategorySchema.optional(),
  processing: FeasibilityCategorySchema.optional(),
  power: FeasibilityCategorySchema.optional(),
  inputs: FeasibilityCategorySchema.optional(),
  outputs: FeasibilityCategorySchema.optional(),
  overallScore: z.number().min(0).max(100).optional(),
  openQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()).optional(),
        category: z.string().optional(),
        impact: z.string().optional(),
      })
    )
    .optional(),
})

export type FeasibilityResponse = z.infer<typeof FeasibilityResponseSchema>

// =============================================================================
// Refinement Schemas
// =============================================================================

export const RefinementResponseSchema = z.object({
  decisions: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.string(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  openQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()).optional(),
        category: z.string().optional(),
        impact: z.string().optional(),
      })
    )
    .optional(),
  complete: z.boolean().optional(),
})

export type RefinementResponse = z.infer<typeof RefinementResponseSchema>

// =============================================================================
// Final Spec Schemas
// =============================================================================

export const FinalSpecResponseSchema = z.object({
  projectName: z.string(),
  summary: z.string(),
  microcontroller: z.string(),
  connectivity: z.array(z.string()).optional(),
  power: z
    .object({
      source: z.string(),
      voltage: z.string().optional(),
      features: z.array(z.string()).optional(),
    })
    .optional(),
  inputs: z
    .array(
      z.object({
        type: z.string(),
        count: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  outputs: z
    .array(
      z.object({
        type: z.string(),
        count: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  enclosure: z
    .object({
      style: z.string(),
      material: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      depth: z.number().optional(),
    })
    .optional(),
  estimatedBOM: z
    .array(
      z.object({
        item: z.string(),
        quantity: z.number(),
        unitCost: z.number(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  totalCost: z.number().optional(),
  manufacturingNotes: z.array(z.string()).optional(),
})

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
      config: z.record(z.unknown()).optional(),
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
