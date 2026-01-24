/**
 * Export Stage State Schema
 *
 * State for the export stage subgraph. Handles gerber merging,
 * BOM generation, and ZIP packaging for manufacturing.
 */

import { StateSchema, MessagesValue, ReducedValue } from '@langchain/langgraph'
import { z } from 'zod'
import {
  StageSchema,
  StageStatusSchema,
  ProjectSummarySchema,
  DebugInfoSchema,
  createDebugStep as baseCreateDebugStep,
  createInitialDebugInfo,
  type DebugStep,
  type DebugInfo,
} from './orchestrator'

// =============================================================================
// Export-Specific Schemas
// =============================================================================

export const GerberLayerSchema = z.enum([
  'F_Cu',
  'In1_Cu',
  'In2_Cu',
  'B_Cu',
  'F_SilkS',
  'B_SilkS',
  'F_Mask',
  'B_Mask',
  'Edge_Cuts',
  'VScore',
  'RoutedEdges',
])

export type GerberLayer = z.infer<typeof GerberLayerSchema>

export const MergedGerberArtifactsSchema = z.object({
  topCopper: z.string(),
  innerCopper1: z.string(),
  innerCopper2: z.string(),
  bottomCopper: z.string(),
  topSilk: z.string(),
  bottomSilk: z.string(),
  topMask: z.string(),
  bottomMask: z.string(),
  edgeCuts: z.string(),
  drill: z.string(),
})

export type MergedGerberArtifacts = z.infer<typeof MergedGerberArtifactsSchema>

export const PanelGerberArtifactsSchema = MergedGerberArtifactsSchema.extend({
  vScore: z.string(),
  routedEdges: z.string(),
})

export type PanelGerberArtifacts = z.infer<typeof PanelGerberArtifactsSchema>

export const BOMEntrySchema = z.object({
  reference: z.string(),
  value: z.string(),
  footprint: z.string(),
  quantity: z.number(),
  manufacturer: z.string().optional(),
  mpn: z.string().optional(),
  lcscPartNumber: z.string().optional(),
  nofit: z.boolean().default(false),
})

export type BOMEntry = z.infer<typeof BOMEntrySchema>

export const CentroidEntrySchema = z.object({
  reference: z.string(),
  value: z.string(),
  footprint: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  side: z.enum(['top', 'bottom']),
})

export type CentroidEntry = z.infer<typeof CentroidEntrySchema>

export const ExportArtifactSchema = z.object({
  name: z.string(),
  type: z.enum(['gerber', 'bom', 'centroid', 'design_doc', 'firmware', 'enclosure', 'zip']),
  url: z.string(),
  size: z.number().optional(),
  generatedAt: z.string(),
})

export type ExportArtifact = z.infer<typeof ExportArtifactSchema>

export const ExportNodeSchema = z.enum(['gerber_merge', 'bom_generation', 'zip_packaging'])

export type ExportNode = z.infer<typeof ExportNodeSchema>

export const ExportRouteSchema = z.enum([
  'merge_gerbers',
  'generate_bom',
  'package_zip',
  'complete',
])

export type ExportRoute = z.infer<typeof ExportRouteSchema>

// =============================================================================
// Export State Schema
// =============================================================================

/**
 * Export Stage State
 *
 * Contains all fields needed for manufacturing export:
 * - Gerber merging status
 * - BOM generation
 * - Pick and place (centroid) data
 * - Final ZIP packaging
 */
export const ExportStateSchema = new StateSchema({
  // Inherited from parent
  messages: MessagesValue,
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),
  currentStage: StageSchema.default('export'),
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'complete',
    spec: 'complete',
    pcb: 'complete',
    enclosure: 'complete',
    firmware: 'complete',
    export: 'in_progress',
  }),
  projectId: z.string().nullable().default(null),
  sessionId: z.string().default(''),
  userProjects: z.array(ProjectSummarySchema).default([]),
  error: z.string().nullable().default(null),
  debug: new ReducedValue(DebugInfoSchema, {
    reducer: (current, update) => ({
      ...current,
      ...update,
      steps: [...(current.steps || []), ...(update.steps || [])],
    }),
  }),

  // Export-specific fields
  gerbersMerged: z.boolean().default(false),
  mergedGerbers: MergedGerberArtifactsSchema.nullable().default(null),
  panelGerbers: PanelGerberArtifactsSchema.nullable().default(null),

  bomGenerated: z.boolean().default(false),
  bomEntries: z.array(BOMEntrySchema).default([]),
  centroidEntries: z.array(CentroidEntrySchema).default([]),

  // Design document
  designDocGenerated: z.boolean().default(false),
  designDocUrl: z.string().nullable().default(null),

  // Final package
  zipReady: z.boolean().default(false),
  zipUrl: z.string().nullable().default(null),

  // All generated artifacts
  artifacts: z.array(ExportArtifactSchema).default([]),

  // Internal routing
  exportRoute: ExportRouteSchema.nullable().default(null),
})

// Type helpers
export type ExportState = typeof ExportStateSchema.State
export type ExportStateUpdate = typeof ExportStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a debug step for export stage
 */
export function createExportDebugStep(
  node: ExportNode,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): DebugStep {
  return baseCreateDebugStep(node, input, output, durationMs, 'export')
}

/**
 * Calculate total BOM cost
 */
export function calculateBOMCost(entries: BOMEntry[], prices: Map<string, number>): number {
  let total = 0
  for (const entry of entries) {
    if (!entry.nofit) {
      const price = prices.get(entry.mpn ?? entry.value) ?? 0
      total += price * entry.quantity
    }
  }
  return total
}

/**
 * Count unique parts in BOM
 */
export function countUniqueParts(entries: BOMEntry[]): number {
  const unique = new Set(entries.filter((e) => !e.nofit).map((e) => `${e.value}-${e.footprint}`))
  return unique.size
}

/**
 * Count total components
 */
export function countTotalComponents(entries: BOMEntry[]): number {
  return entries.filter((e) => !e.nofit).reduce((sum, e) => sum + e.quantity, 0)
}

/**
 * Generate LCSC BOM CSV content
 */
export function generateLCSCBOM(entries: BOMEntry[]): string {
  const lines = [
    'Quantity,Manufacture Part Number,Manufacturer,Description,LCSC Part Number,Package,Customer Part Number',
  ]

  // Group by value + footprint
  const grouped = new Map<string, BOMEntry[]>()
  for (const entry of entries) {
    if (entry.nofit) continue
    const key = `${entry.value}-${entry.footprint}`
    const existing = grouped.get(key) ?? []
    grouped.set(key, [...existing, entry])
  }

  for (const [, group] of grouped) {
    const first = group[0]
    const quantity = group.reduce((sum, e) => sum + e.quantity, 0)
    const refs = group.map((e) => e.reference).join(', ')

    lines.push(
      [
        quantity,
        first.mpn ?? '',
        first.manufacturer ?? '',
        first.value,
        first.lcscPartNumber ?? '',
        first.footprint,
        `"${refs}"`,
      ].join(',')
    )
  }

  return lines.join('\n')
}

/**
 * Check if export is complete
 */
export function isExportComplete(state: ExportState): boolean {
  return state.gerbersMerged && state.bomGenerated && state.zipReady
}

/**
 * Get artifact by type
 */
export function getArtifactByType(
  artifacts: ExportArtifact[],
  type: ExportArtifact['type']
): ExportArtifact | undefined {
  return artifacts.find((a) => a.type === type)
}

/**
 * Add or update artifact
 */
export function upsertArtifact(
  artifacts: ExportArtifact[],
  artifact: ExportArtifact
): ExportArtifact[] {
  const index = artifacts.findIndex((a) => a.type === artifact.type && a.name === artifact.name)
  if (index >= 0) {
    return [...artifacts.slice(0, index), artifact, ...artifacts.slice(index + 1)]
  }
  return [...artifacts, artifact]
}

// Re-export shared types and functions
export { createInitialDebugInfo }
export type { DebugStep, DebugInfo }
