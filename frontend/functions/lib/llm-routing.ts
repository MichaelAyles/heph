import type { Env } from '../env'

export interface ActiveModelDefaults {
  textModel: string
  imageModel: string | null
}

export interface RequestedModelResolution {
  model: string
  requestedModel: string | undefined
  wasOverridden: boolean
}

export class ProjectAccessError extends Error {
  code: 'not_found' | 'forbidden'

  constructor(code: 'not_found' | 'forbidden') {
    super(code)
    this.code = code
  }
}

/**
 * Resolve requested model aliases and enforce model override rules.
 * Non-admin users are limited to active default text/image models.
 */
export function resolveRequestedModel(
  requestedModel: string | undefined,
  defaults: ActiveModelDefaults,
  preferredType: 'text' | 'image',
  allowCustomModel: boolean
): RequestedModelResolution {
  const defaultTextModel = defaults.textModel
  const defaultImageModel = defaults.imageModel || defaultTextModel

  if (!requestedModel) {
    return {
      model: preferredType === 'image' ? defaultImageModel : defaultTextModel,
      requestedModel,
      wasOverridden: false,
    }
  }

  if (requestedModel === '__text_model__') {
    return { model: defaultTextModel, requestedModel, wasOverridden: false }
  }

  if (requestedModel === '__image_model__') {
    return { model: defaultImageModel, requestedModel, wasOverridden: false }
  }

  if (allowCustomModel) {
    return { model: requestedModel, requestedModel, wasOverridden: false }
  }

  const allowedModels = new Set([defaultTextModel, defaultImageModel])
  if (allowedModels.has(requestedModel)) {
    return { model: requestedModel, requestedModel, wasOverridden: false }
  }

  return {
    model: preferredType === 'image' ? defaultImageModel : defaultTextModel,
    requestedModel,
    wasOverridden: true,
  }
}

/**
 * Validate optional project ownership for request attribution.
 */
export async function assertProjectAccess(
  env: Env,
  user: { id: string; isAdmin?: boolean },
  projectId?: string
): Promise<string | undefined> {
  if (!projectId) return undefined

  const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
    .bind(projectId)
    .first<{ user_id: string }>()

  if (!project) {
    throw new ProjectAccessError('not_found')
  }

  if (project.user_id !== user.id && !user.isAdmin) {
    throw new ProjectAccessError('forbidden')
  }

  return projectId
}
