import type { Env } from '../../env'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface User {
  id: string
  username: string
  displayName: string | null
}

interface UsageStats {
  model: string
  requestCount: number
  totalTokens: number
  totalCost: number
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User

  // Get current user's usage by model
  const userUsage = await env.DB.prepare(
    `
    SELECT
      model,
      COUNT(*) as request_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM llm_requests
    WHERE user_id = ? AND status = 'success'
    GROUP BY model
    ORDER BY total_cost DESC
  `
  )
    .bind(user.id)
    .all()

  // Get all users' usage by model (all time)
  const allUsage = await env.DB.prepare(
    `
    SELECT
      model,
      COUNT(*) as request_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM llm_requests
    WHERE status = 'success'
    GROUP BY model
    ORDER BY total_cost DESC
  `
  ).all()

  // Get totals
  const userTotals = await env.DB.prepare(
    `
    SELECT
      COUNT(*) as request_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM llm_requests
    WHERE user_id = ? AND status = 'success'
  `
  )
    .bind(user.id)
    .first()

  const allTotals = await env.DB.prepare(
    `
    SELECT
      COUNT(*) as request_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM llm_requests
    WHERE status = 'success'
  `
  ).first()

  const formatUsage = (rows: unknown[]): UsageStats[] =>
    rows.map((row: unknown) => {
      const r = row as Record<string, unknown>
      return {
        model: r.model as string,
        requestCount: (r.request_count as number) || 0,
        totalTokens: (r.total_tokens as number) || 0,
        totalCost: (r.total_cost as number) || 0,
      }
    })

  return Response.json({
    user: {
      byModel: formatUsage(userUsage.results || []),
      totals: {
        requestCount: (userTotals?.request_count as number) || 0,
        totalTokens: (userTotals?.total_tokens as number) || 0,
        totalCost: (userTotals?.total_cost as number) || 0,
      },
    },
    all: {
      byModel: formatUsage(allUsage.results || []),
      totals: {
        requestCount: (allTotals?.request_count as number) || 0,
        totalTokens: (allTotals?.total_tokens as number) || 0,
        totalCost: (allTotals?.total_cost as number) || 0,
      },
    },
  })
}
