/**
 * Cloudflare Pages Functions Environment
 */

export interface Env {
  // D1 Database
  DB: D1Database

  // R2 Storage
  STORAGE: R2Bucket

  // Environment variables
  ENVIRONMENT: string

  // Secrets (set via wrangler secret put or .dev.vars)
  OPENROUTER_API_KEY: string
  TEXT_MODEL_SLUG?: string
  IMAGE_MODEL_SLUG?: string

  // WorkOS OAuth
  WORKOS_CLIENT_ID: string
  WORKOS_API_KEY: string

  // KiCad microservice URL
  KICAD_SERVICE_URL?: string

  // PlatformIO compile service URL
  PLATFORMIO_SERVICE_URL?: string

  // Shared bearer token for internal microservice calls
  INTERNAL_SERVICE_TOKEN?: string
}

// Extend the context with our typed env
export interface AppContext {
  env: Env
  user?: {
    id: string
    username: string
    displayName: string | null
    isAdmin: boolean
  }
}

// Helper type for Pages Functions
export type PagesFunction<E = Env> = (
  context: EventContext<E, string, Record<string, unknown>>
) => Response | Promise<Response>
