/**
 * Centralized Configuration for Backend Functions
 *
 * All external URLs and configuration values should be defined here.
 * This makes it easier to test, change environments, and maintain.
 */

// =============================================================================
// External API URLs
// =============================================================================

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const APP_URL = 'https://phaestus.app'

// =============================================================================
// Default Model Configuration
// =============================================================================

export const DEFAULT_TEXT_MODEL = 'google/gemini-2.0-flash-001'
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.0-flash-exp:free'

// =============================================================================
// Rate Limiting
// =============================================================================

export const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MINUTES: 15,
  LOCKOUT_MINUTES: 30,
}

// =============================================================================
// Request Limits
// =============================================================================

export const REQUEST_LIMITS = {
  MAX_BODY_SIZE: 10 * 1024 * 1024, // 10MB general
  MAX_SPEC_SIZE: 5 * 1024 * 1024,  // 5MB for specs
  MAX_DESCRIPTION_LENGTH: 2000,    // Characters for project descriptions
}

// =============================================================================
// Session Configuration
// =============================================================================

export const SESSION = {
  EXPIRY_DAYS: 7,
  COOKIE_NAME: 'session',
}
