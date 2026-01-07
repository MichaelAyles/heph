/**
 * Gemini API utility functions
 */

// =============================================================================
// MESSAGE CONTENT TYPES (matching frontend llm.ts types)
// =============================================================================

interface ImageContent {
  type: 'image'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  data: string // base64 encoded
}

interface TextContent {
  type: 'text'
  text: string
}

type MessageContent = string | (TextContent | ImageContent)[]

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: MessageContent
}

// Gemini API types
interface GeminiTextPart {
  text: string
}

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string
    data: string
  }
}

type GeminiPart = GeminiTextPart | GeminiInlineDataPart

interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

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
      const systemText = typeof msg.content === 'string'
        ? msg.content
        : msg.content.filter(p => p.type === 'text').map(p => (p as TextContent).text).join('\n')
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
