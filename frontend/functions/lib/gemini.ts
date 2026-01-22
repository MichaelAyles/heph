/**
 * Gemini API utility functions
 */

import type {
  ChatMessage,
  MessageContent,
  GeminiPart,
  GeminiContent,
} from './message-types'

/**
 * Build Gemini parts from message content
 */
function buildGeminiParts(content: MessageContent): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }]
  }

  return content.map((part) => {
    if (part.type === 'image') {
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      }
    }
    return { text: part.text }
  })
}

/**
 * Convert OpenAI-style messages to Gemini format
 * Gemini doesn't support 'system' role, so we convert it to user+model pair
 * Supports multimodal content (text + images)
 */
export function convertToGeminiFormat(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini doesn't support system role, prepend as user message with model acknowledgment
      // System messages are always text-only
      const systemText =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((p) => p.type === 'text')
              .map((p) => (p as TextContent).text)
              .join('\n')
      result.unshift({ role: 'user', parts: [{ text: systemText }] })
      result.splice(1, 0, { role: 'model', parts: [{ text: 'Understood.' }] })
    } else {
      result.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: buildGeminiParts(msg.content),
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
