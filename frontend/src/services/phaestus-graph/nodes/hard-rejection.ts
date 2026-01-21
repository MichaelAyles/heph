/**
 * Hard Rejection Node
 *
 * Pattern-based matching against DB criteria for instant rejection.
 * No LLM call needed - just regex matching.
 */

import type { PhaestusState } from '../state'
import { setRoute, addMessage } from '../state'
import type { HardRejectionCriteria } from '../../../db/schema'
import type { D1Database } from '../types'

export interface HardRejectionResult {
  rejected: boolean
  reason: string | null
  category: string | null
}

/**
 * Check user request against hard rejection criteria
 */
export function checkHardRejection(
  request: string,
  criteria: HardRejectionCriteria[]
): HardRejectionResult {
  const normalizedRequest = request.toLowerCase()

  for (const criterion of criteria) {
    if (!criterion.isActive) continue

    try {
      const regex = new RegExp(criterion.pattern, 'i')
      if (regex.test(normalizedRequest)) {
        return {
          rejected: true,
          reason: criterion.reason,
          category: criterion.category,
        }
      }
    } catch {
      // Invalid regex pattern - skip
      console.warn(`Invalid rejection pattern: ${criterion.pattern}`)
    }
  }

  return { rejected: false, reason: null, category: null }
}

/**
 * Hard rejection node - pattern match against criteria
 * Returns updated state if rejected, or passes through
 */
export async function hardRejectionNode(
  state: PhaestusState,
  criteria: HardRejectionCriteria[]
): Promise<PhaestusState> {
  const result = checkHardRejection(state.userRequest, criteria)

  if (result.rejected) {
    // Create rejection message
    const rejectionMessage = formatRejectionMessage(
      result.reason!,
      result.category!
    )

    // Update state with rejection
    let newState = setRoute(state, 'REJECT')
    newState = addMessage(newState, 'assistant', rejectionMessage)

    return newState
  }

  // Not rejected - pass through unchanged
  return state
}

/**
 * Format a user-friendly rejection message
 */
function formatRejectionMessage(reason: string, category: string): string {
  const categoryLabels: Record<string, string> = {
    safety: '⚠️ Safety Concern',
    capability: '🔧 Capability Limitation',
    legal: '⚖️ Regulatory Restriction',
  }

  const categoryLabel = categoryLabels[category] || '❌ Cannot Build'

  return `**${categoryLabel}**

${reason}

If you believe this is an error, or if you'd like to discuss alternative approaches, please let me know. I'm happy to help find a solution that works within our capabilities.`
}

/**
 * For server-side use: fetch criteria from database and check
 */
export async function checkHardRejectionFromDb(
  request: string,
  db: D1Database
): Promise<HardRejectionResult> {
  const stmt = db.prepare(
    'SELECT * FROM hard_rejection_criteria WHERE is_active = 1'
  )
  const result = await stmt.all<{
    id: number
    pattern: string
    reason: string
    category: string
    is_active: number
    created_at: string
  }>()

  const criteria: HardRejectionCriteria[] = (result.results ?? []).map((row) => ({
    id: row.id,
    pattern: row.pattern,
    reason: row.reason,
    category: row.category as 'safety' | 'capability' | 'legal',
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }))

  return checkHardRejection(request, criteria)
}
