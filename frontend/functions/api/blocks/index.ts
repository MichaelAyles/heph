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

  let query = 'SELECT * FROM pcb_blocks WHERE is_active = 1'
  const params: string[] = []

  if (category && category !== 'all') {
    query += ' AND category = ?'
    params.push(category)
  }

  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }

  query += ' ORDER BY category, name'

  const result = await env.DB.prepare(query).bind(...params).all()

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
  }))

  return Response.json({ blocks, total: blocks.length })
}
