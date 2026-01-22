/**
 * JLCPCB Components Service
 *
 * Provides rotation offset lookup for JLCPCB pick-and-place files.
 * Uses database-stored values with fallback patterns.
 */

// =============================================================================
// Types
// =============================================================================

export interface JlcpcbComponent {
  lcscPartNumber: string
  manufacturerPartNumber: string | null
  description: string | null
  footprint: string | null
  rotationOffset: number
  createdAt: string
  updatedAt: string
}

export interface FootprintPattern {
  id: number
  pattern: string
  rotationOffset: number
  priority: number
  comment: string | null
  createdAt: string
}

export interface ComponentsResponse {
  components: JlcpcbComponent[]
  total: number
  limit: number
  offset: number
}

export interface PatternsResponse {
  patterns: FootprintPattern[]
}

// =============================================================================
// API Functions (for use in browser/admin UI)
// =============================================================================

/**
 * Fetch all components from the admin API
 */
export async function fetchComponents(options?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<ComponentsResponse> {
  const params = new URLSearchParams()
  if (options?.search) params.set('search', options.search)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))

  const res = await fetch(`/api/admin/components?${params}`)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to fetch components')
  }
  return res.json()
}

/**
 * Fetch all footprint patterns from the admin API
 */
export async function fetchPatterns(): Promise<PatternsResponse> {
  const res = await fetch('/api/admin/components/patterns')
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to fetch patterns')
  }
  return res.json()
}

/**
 * Create a new component
 */
export async function createComponent(component: {
  lcscPartNumber: string
  manufacturerPartNumber?: string
  description?: string
  footprint?: string
  rotationOffset?: number
}): Promise<JlcpcbComponent> {
  const res = await fetch('/api/admin/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(component),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to create component')
  }
  const data = await res.json()
  return data.component
}

/**
 * Update a component
 */
export async function updateComponent(
  lcsc: string,
  updates: {
    manufacturerPartNumber?: string | null
    description?: string | null
    footprint?: string | null
    rotationOffset?: number
  }
): Promise<JlcpcbComponent> {
  const res = await fetch(`/api/admin/components/${lcsc}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to update component')
  }
  const data = await res.json()
  return data.component
}

/**
 * Delete a component
 */
export async function deleteComponent(lcsc: string): Promise<void> {
  const res = await fetch(`/api/admin/components/${lcsc}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to delete component')
  }
}

/**
 * Create a new footprint pattern
 */
export async function createPattern(pattern: {
  pattern: string
  rotationOffset?: number
  priority?: number
  comment?: string
}): Promise<FootprintPattern> {
  const res = await fetch('/api/admin/components/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pattern),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to create pattern')
  }
  const data = await res.json()
  return data.pattern
}

/**
 * Update a footprint pattern
 */
export async function updatePattern(
  id: number,
  updates: {
    pattern?: string
    rotationOffset?: number
    priority?: number
    comment?: string | null
  }
): Promise<FootprintPattern> {
  const res = await fetch(`/api/admin/components/patterns/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to update pattern')
  }
  const data = await res.json()
  return data.pattern
}

/**
 * Delete a footprint pattern
 */
export async function deletePattern(id: number): Promise<void> {
  const res = await fetch(`/api/admin/components/patterns/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Failed to delete pattern')
  }
}

// =============================================================================
// Rotation Offset Utilities (for use in scripts and services)
// =============================================================================

/**
 * Get rotation offset for a component
 *
 * Priority:
 * 1. LCSC part number exact match
 * 2. Footprint pattern match (highest priority first)
 * 3. Default: 0
 *
 * @param lcscPartNumber - LCSC part number (e.g., "C295747")
 * @param footprint - Footprint name from position file
 * @param components - Pre-loaded component list
 * @param patterns - Pre-loaded pattern list (sorted by priority desc)
 */
export function getRotationOffset(
  lcscPartNumber: string | undefined,
  footprint: string,
  components: JlcpcbComponent[],
  patterns: FootprintPattern[]
): number {
  // First try LCSC part number (most specific)
  if (lcscPartNumber) {
    const component = components.find((c) => c.lcscPartNumber === lcscPartNumber)
    if (component) {
      return component.rotationOffset
    }
  }

  // Then try footprint pattern matching (patterns should be sorted by priority desc)
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern, 'i')
      if (regex.test(footprint)) {
        return pattern.rotationOffset
      }
    } catch {
      // Invalid regex, skip
      continue
    }
  }

  // No offset needed
  return 0
}

/**
 * Apply rotation offset and normalize to 0-360 range
 */
export function applyRotationOffset(kicadRotation: number, offset: number): number {
  let result = kicadRotation + offset
  // Normalize to 0-360
  while (result < 0) result += 360
  while (result >= 360) result -= 360
  return result
}

// =============================================================================
// Script Utilities (for use in CLI scripts)
// =============================================================================

/**
 * Fetch components from the production API (for scripts)
 */
export async function fetchComponentsFromApi(baseUrl = 'https://phaestus.app'): Promise<JlcpcbComponent[]> {
  const res = await fetch(`${baseUrl}/api/admin/components?limit=10000`)
  if (!res.ok) {
    throw new Error(`Failed to fetch components: ${res.status}`)
  }
  const data = await res.json()
  return data.components
}

/**
 * Fetch patterns from the production API (for scripts)
 */
export async function fetchPatternsFromApi(baseUrl = 'https://phaestus.app'): Promise<FootprintPattern[]> {
  const res = await fetch(`${baseUrl}/api/admin/components/patterns`)
  if (!res.ok) {
    throw new Error(`Failed to fetch patterns: ${res.status}`)
  }
  const data = await res.json()
  return data.patterns
}

/**
 * Create a rotation offset lookup function using pre-fetched data
 */
export function createRotationLookup(
  components: JlcpcbComponent[],
  patterns: FootprintPattern[]
): (lcscPartNumber: string | undefined, footprint: string) => number {
  return (lcscPartNumber, footprint) => getRotationOffset(lcscPartNumber, footprint, components, patterns)
}
