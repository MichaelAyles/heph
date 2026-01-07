/**
 * LLM Service - Unified interface for server-side LLM proxy
 *
 * All LLM requests go through /api/llm/* to keep API keys server-side
 */

// =============================================================================
// MESSAGE CONTENT TYPES (for vision/multimodal support)
// =============================================================================

export interface ImageContent {
  type: 'image'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  data: string // base64 encoded
}

export interface TextContent {
  type: 'text'
  text: string
}

export type MessageContent = string | (TextContent | ImageContent)[]

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: MessageContent
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  projectId?: string
}

export interface ChatResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (response: ChatResponse) => void
  onError: (error: Error) => void
}

// =============================================================================
// TOOL CALLING TYPES
// =============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  enum?: string[]
  items?: { type: string; properties?: Record<string, ToolParameter>; required?: string[] }
  properties?: Record<string, ToolParameter>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolChatOptions {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  model?: string
  temperature?: number
  maxTokens?: number
  projectId?: string
  thinking?: {
    type: 'enabled' | 'disabled'
    budgetTokens?: number
  }
}

export interface ToolChatResponse {
  content: string
  model: string
  toolCalls?: ToolCall[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  thinking?: string
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
}

const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 1000

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on 4xx errors (client errors)
      if (
        lastError.message.includes('400') ||
        lastError.message.includes('401') ||
        lastError.message.includes('403') ||
        lastError.message.includes('404')
      ) {
        throw lastError
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await sleep(initialDelay * Math.pow(2, attempt))
      }
    }
  }

  throw lastError || new Error('Request failed after retries')
}

class LLMService {
  /**
   * Send a chat request (non-streaming) with automatic retry
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    return withRetry(async () => {
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `LLM request failed (${response.status})`)
      }

      return response.json()
    })
  }

  /**
   * Send a chat request with tool calling support
   */
  async chatWithTools(options: ToolChatOptions): Promise<ToolChatResponse> {
    return withRetry(async () => {
      const response = await fetch('/api/llm/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Tool chat request failed (${response.status})`)
      }

      return response.json()
    })
  }

  /**
   * Send a streaming chat request
   */
  async chatStream(options: ChatOptions, callbacks: StreamCallbacks): Promise<void> {
    const response = await fetch('/api/llm/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const error = await response.json()
      callbacks.onError(new Error(error.error || 'LLM stream failed'))
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError(new Error('No response body'))
      return
    }

    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))

        for (const line of lines) {
          const data = line.slice(6)
          try {
            const parsed = JSON.parse(data)

            if (parsed.token) {
              fullContent += parsed.token
              callbacks.onToken(parsed.token)
            }

            if (parsed.done) {
              callbacks.onComplete({
                content: parsed.content || fullContent,
                model: options.model || 'unknown',
              })
              return
            }

            if (parsed.error) {
              callbacks.onError(new Error(parsed.error))
              return
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // If we get here without a done event, still complete
      callbacks.onComplete({
        content: fullContent,
        model: options.model || 'unknown',
      })
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

// Singleton instance
export const llm = new LLMService()

// =============================================================================
// IMAGE UTILITIES
// =============================================================================

/**
 * Fetch an image from a URL and convert it to base64
 * @param url - The URL of the image to fetch
 * @returns Promise resolving to base64-encoded image data (without data URI prefix)
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data URI prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image as base64'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Get the MIME type from a URL or default to png
 */
export function getMimeTypeFromUrl(url: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  const lowercaseUrl = url.toLowerCase()
  if (lowercaseUrl.includes('.jpg') || lowercaseUrl.includes('.jpeg')) {
    return 'image/jpeg'
  }
  if (lowercaseUrl.includes('.webp')) {
    return 'image/webp'
  }
  if (lowercaseUrl.includes('.gif')) {
    return 'image/gif'
  }
  return 'image/png'
}
