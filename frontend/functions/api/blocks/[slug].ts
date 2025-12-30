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
  const { env, params } = context
  const slug = params.slug as string

  const row = await env.DB.prepare(
    'SELECT * FROM pcb_blocks WHERE slug = ? AND is_active = 1'
  )
    .bind(slug)
    .first()

  if (!row) {
    return Response.json({ error: 'Block not found' }, { status: 404 })
  }

  const block = {
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
  }

  return Response.json({ block })
}
