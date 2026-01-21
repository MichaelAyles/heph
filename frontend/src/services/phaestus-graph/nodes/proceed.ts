/**
 * Proceed Node
 *
 * Initialize the project creation flow when capability
 * assessment passes.
 */

import type { PhaestusState } from '../state'
import { addMessage, setProjectId } from '../state'
import type { D1Database } from '../types'

/**
 * Generate success message with next steps
 */
export function generateProceedMessage(state: PhaestusState): string {
  const assessment = state.capabilityAssessment

  const parts: string[] = []

  parts.push(`Great news! I've analyzed your project and I'm confident we can build this.`)
  parts.push('')

  if (assessment) {
    parts.push(`**Assessment:** ${assessment.reasoning}`)
    parts.push('')
    parts.push(`**Confidence:** ${Math.round(assessment.confidence * 100)}%`)
    parts.push('')
  }

  parts.push(`I'll now create a project and guide you through the design process:`)
  parts.push('')
  parts.push(`1. **Specification** - We'll finalize the technical requirements`)
  parts.push(`2. **PCB Design** - Select and place circuit blocks`)
  parts.push(`3. **Enclosure** - Generate a 3D-printable case`)
  parts.push(`4. **Firmware** - Generate ESP32 code`)
  parts.push(`5. **Export** - Get manufacturing files`)
  parts.push('')
  parts.push(`Let me set up your project...`)

  return parts.join('\n')
}

/**
 * Create a new project in the database
 */
export async function createProject(
  state: PhaestusState,
  db: D1Database
): Promise<string> {
  const projectId = crypto.randomUUID()
  const now = new Date().toISOString()

  // Create initial project spec
  const initialSpec = {
    description: state.userRequest,
    feasibility: state.capabilityAssessment ? {
      communication: { type: 'WiFi', confidence: 80, notes: 'ESP32-C6 WiFi 6' },
      processing: { level: 'moderate', confidence: 90, notes: 'ESP32-C6' },
      power: { options: ['USB', 'LiPo'], confidence: 85, notes: 'Multiple options' },
      inputs: { items: [], notes: 'TBD' },
      outputs: { items: [], notes: 'TBD' },
      overallScore: Math.round((state.capabilityAssessment.confidence ?? 0.8) * 100),
      manufacturable: true,
    } : null,
    openQuestions: [],
    decisions: [],
    blueprints: [],
    selectedBlueprint: null,
    finalSpec: null,
    stages: {
      spec: { status: 'in_progress' as const },
      pcb: { status: 'pending' as const },
      enclosure: { status: 'pending' as const },
      firmware: { status: 'pending' as const },
      export: { status: 'pending' as const },
    },
  }

  await db
    .prepare(
      `INSERT INTO projects (id, user_id, name, description, status, spec, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      projectId,
      'system', // Will be updated with actual user ID
      'New Project',
      state.userRequest,
      'analyzing',
      JSON.stringify(initialSpec),
      now,
      now
    )
    .run()

  return projectId
}

/**
 * Proceed node - create project and generate success message
 */
export async function proceedNode(
  state: PhaestusState,
  db?: D1Database
): Promise<PhaestusState> {
  let newState = state

  // Create project if DB is available
  if (db) {
    try {
      const projectId = await createProject(state, db)
      newState = setProjectId(newState, projectId)
    } catch (err) {
      console.error('Failed to create project:', err)
      // Continue without project ID - can be created later
    }
  }

  // Generate success message
  const message = generateProceedMessage(newState)
  newState = addMessage(newState, 'assistant', message)

  return newState
}
