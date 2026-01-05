/**
 * Public Gallery Project Detail API
 *
 * Returns detailed view of a completed project.
 * No authentication required.
 */

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
  const { id } = params

  // Get the project
  const result = await env.DB.prepare(
    `
    SELECT
      p.id,
      p.name,
      p.description,
      p.status,
      p.spec,
      p.created_at,
      p.updated_at,
      u.username as author_username
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ? AND p.status = 'complete'
    `
  )
    .bind(id)
    .first()

  if (!result) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  // Parse spec
  let spec = null
  try {
    spec = JSON.parse(result.spec as string)
  } catch {
    // Ignore parse errors
  }

  // Build public-safe project response
  const project = {
    id: result.id,
    name: result.name,
    description: result.description,
    status: result.status,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
    authorUsername: result.author_username,
    spec: spec
      ? {
          // Only expose safe fields
          finalSpec: spec.finalSpec,
          blueprints: spec.blueprints,
          selectedBlueprint: spec.selectedBlueprint,
          feasibility: spec.feasibility
            ? {
                overallScore: spec.feasibility.overallScore,
                communication: spec.feasibility.communication,
                processing: spec.feasibility.processing,
                power: spec.feasibility.power,
                inputs: spec.feasibility.inputs,
                outputs: spec.feasibility.outputs,
              }
            : null,
          // PCB info (without full schematic data)
          pcb: spec.pcb
            ? {
                boardSize: spec.pcb.boardSize,
                placedBlocks: spec.pcb.placedBlocks,
              }
            : null,
          // Enclosure info
          enclosure: spec.enclosure
            ? {
                style: spec.enclosure.style,
                stlUrl: spec.enclosure.stlUrl,
              }
            : null,
          // Firmware info (high-level only)
          firmware: spec.firmware
            ? {
                language: spec.firmware.language,
                framework: spec.firmware.framework,
                files: spec.firmware.files?.map((f: { path: string }) => ({ path: f.path })),
              }
            : null,
        }
      : null,
  }

  return Response.json({ project })
}
