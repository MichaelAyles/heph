import type { Env } from '../../env'
import { safeJsonParse } from '../../lib/json'

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

  const row = await env.DB.prepare('SELECT * FROM pcb_blocks WHERE slug = ? AND is_active = 1')
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
    taps: safeJsonParse(row.taps as string, []),
    i2cAddresses: safeJsonParse(row.i2c_addresses as string | null, null),
    spiCs: row.spi_cs,
    power: safeJsonParse(row.power as string | null, { currentMaxMa: 0 }),
    components: safeJsonParse(row.components as string | null, []),
    isValidated: row.is_validated === 1,
    // New fields for PCB merging
    edges: safeJsonParse(row.edges as string | null, undefined),
    files: safeJsonParse(row.files as string | null, undefined),
    netMappings: safeJsonParse(row.net_mappings as string | null, undefined),
    // Full block definition with LCSC part numbers
    definition: safeJsonParse(row.definition as string | null, undefined),
  }

  return Response.json({ block })
}
