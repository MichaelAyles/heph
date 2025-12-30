/**
 * LLM Pricing - Cost calculation for various models
 * Prices are in USD per million tokens
 */

interface ModelPricing {
  promptPer1M: number
  completionPer1M: number
}

// Pricing data from OpenRouter (approximate, as of late 2024)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini models
  'google/gemini-2.0-flash-001': { promptPer1M: 0.1, completionPer1M: 0.4 },
  'google/gemini-2.0-flash': { promptPer1M: 0.1, completionPer1M: 0.4 },
  'google/gemini-2.5-flash-preview': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'google/gemini-3-flash-preview': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'google/gemini-2.5-flash-image': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'google/gemini-pro': { promptPer1M: 0.5, completionPer1M: 1.5 },
  'google/gemini-pro-1.5': { promptPer1M: 1.25, completionPer1M: 5.0 },

  // Claude models
  'anthropic/claude-3-haiku': { promptPer1M: 0.25, completionPer1M: 1.25 },
  'anthropic/claude-3-sonnet': { promptPer1M: 3.0, completionPer1M: 15.0 },
  'anthropic/claude-3-opus': { promptPer1M: 15.0, completionPer1M: 75.0 },
  'anthropic/claude-3.5-sonnet': { promptPer1M: 3.0, completionPer1M: 15.0 },

  // OpenAI models
  'openai/gpt-4o': { promptPer1M: 2.5, completionPer1M: 10.0 },
  'openai/gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'openai/gpt-4-turbo': { promptPer1M: 10.0, completionPer1M: 30.0 },

  // Default fallback (estimate)
  'default': { promptPer1M: 0.5, completionPer1M: 1.5 },
}

/**
 * Calculate cost for an LLM request
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Try exact match first, then prefix match for versioned models
  let pricing = MODEL_PRICING[model]

  if (!pricing) {
    // Try prefix matching (e.g., "google/gemini-2.0-flash-001:free" -> "google/gemini-2.0-flash-001")
    const baseModel = model.split(':')[0]
    pricing = MODEL_PRICING[baseModel]
  }

  if (!pricing) {
    // Try vendor prefix match
    for (const [key, value] of Object.entries(MODEL_PRICING)) {
      if (model.startsWith(key.split('/')[0] + '/')) {
        pricing = value
        break
      }
    }
  }

  if (!pricing) {
    pricing = MODEL_PRICING['default']
  }

  const promptCost = (promptTokens / 1_000_000) * pricing.promptPer1M
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPer1M

  return promptCost + completionCost
}

/**
 * Estimate cost for image generation
 * Most image models charge per image, not per token
 */
export function calculateImageCost(model: string): number {
  // Approximate costs per image
  if (model.includes('gemini')) {
    return 0.002 // ~$0.002 per image for Gemini
  }
  if (model.includes('dall-e-3')) {
    return 0.04 // $0.04 per image for DALL-E 3
  }
  if (model.includes('dall-e-2')) {
    return 0.02
  }
  if (model.includes('stable-diffusion')) {
    return 0.002
  }
  return 0.01 // Default estimate
}
