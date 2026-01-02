/**
 * Gemini API utility functions
 */

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface GeminiContent {
  role: string
  parts: Array<{ text: string }>
}

/**
 * Convert OpenAI-style messages to Gemini format
 * Gemini doesn't support 'system' role, so we convert it to user+model pair
 */
export function convertToGeminiFormat(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini doesn't support system role, prepend as user message with model acknowledgment
      result.unshift({ role: 'user', parts: [{ text: msg.content }] })
      result.splice(1, 0, { role: 'model', parts: [{ text: 'Understood.' }] })
    } else {
      result.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })
    }
  }

  return result
}

/**
 * Estimate token count from text
 * Rough estimate: ~4 characters per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}
