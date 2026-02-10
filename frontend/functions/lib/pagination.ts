/**
 * Pagination parameter validation
 * Centralizes limit/offset clamping for API endpoints
 */

export function clampPagination(
  rawLimit: string | null,
  rawOffset: string | null,
  defaultLimit = 50,
  maxLimit = 250
): { limit: number; offset: number } {
  const parsedLimit = parseInt(rawLimit || '', 10)
  const parsedOffset = parseInt(rawOffset || '', 10)

  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, maxLimit)
      : defaultLimit

  const offset =
    Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0

  return { limit, offset }
}
