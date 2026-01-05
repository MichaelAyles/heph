import type { Env } from '../../env'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context
  const url = new URL(context.request.url)
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  let baseQuery = 'FROM pcb_blocks WHERE is_active = 1'
  const params: (string | number)[] = []

  if (category && category !== 'all') {
    baseQuery += ' AND category = ?'
    params.push(category)
  }

  if (search) {
    // Escape LIKE special characters to prevent injection
    const escapedSearch = search.replace(/[%_\\]/g, '\\$&')
    baseQuery += " AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
    params.push(`%${escapedSearch}%`, `%${escapedSearch}%`)
  }

  // Get total count
  const countResult = await env.DB.prepare(`SELECT COUNT(*) as count ${baseQuery}`)
    .bind(...params)
    .first<{ count: number }>()
  const total = countResult?.count || 0

  // Get paginated results
  const query = `SELECT * ${baseQuery} ORDER BY category, name LIMIT ? OFFSET ?`
  const result = await env.DB.prepare(query)
    .bind(...params, limit, offset)
    .all()

  const blocks = result.results.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    widthUnits: row.width_units,
    heightUnits: row.height_units,
    taps: JSON.parse((row.taps as string) || '[]'),
    i2cAddresses: row.i2c_addresses ? JSON.parse(row.i2c_addresses as string) : null,
    spiCs: row.spi_cs,
    power: row.power ? JSON.parse(row.power as string) : { currentMaxMa: 0 },
    components: row.components ? JSON.parse(row.components as string) : [],
    isValidated: row.is_validated === 1,
    // New fields for PCB merging
    edges: row.edges ? JSON.parse(row.edges as string) : undefined,
    files: row.files ? JSON.parse(row.files as string) : undefined,
    netMappings: row.net_mappings ? JSON.parse(row.net_mappings as string) : undefined,
  }))

  return Response.json({ blocks, total, limit, offset })
}
