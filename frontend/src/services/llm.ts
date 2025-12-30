/**
 * LLM Service - Unified interface for server-side LLM proxy
 *
 * All LLM requests go through /api/llm/* to keep API keys server-side
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
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

class LLMService {
  /**
   * Send a chat request (non-streaming)
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'LLM request failed')
    }

    return response.json()
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
