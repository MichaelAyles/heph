/**
 * LLM Service - Unified interface for OpenRouter and Gemini APIs
 *
 * Development: Uses OpenRouter for flexibility
 * Production/Demo: Uses Gemini API directly (hackathon requirement)
 */

export type LLMProvider = 'openrouter' | 'gemini'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatOptions {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
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

// Default models
const DEFAULT_MODELS = {
  openrouter: 'google/gemini-2.0-flash-001',
  gemini: 'gemini-2.0-flash',
} as const

class LLMService {
  private provider: LLMProvider = 'openrouter'
  private openRouterApiKey: string | null = null
  private geminiApiKey: string | null = null

  setProvider(provider: LLMProvider) {
    this.provider = provider
  }

  getProvider(): LLMProvider {
    return this.provider
  }

  setApiKeys(keys: { openRouter?: string; gemini?: string }) {
    if (keys.openRouter) this.openRouterApiKey = keys.openRouter
    if (keys.gemini) this.geminiApiKey = keys.gemini
  }

  private getApiKey(): string {
    const key = this.provider === 'openrouter' ? this.openRouterApiKey : this.geminiApiKey
    if (!key) {
      throw new Error(`No API key configured for ${this.provider}`)
    }
    return key
  }

  private getDefaultModel(): string {
    return DEFAULT_MODELS[this.provider]
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const model = options.model ?? this.getDefaultModel()

    if (this.provider === 'openrouter') {
      return this.chatOpenRouter({ ...options, model })
    } else {
      return this.chatGemini({ ...options, model })
    }
  }

  async chatStream(options: ChatOptions, callbacks: StreamCallbacks): Promise<void> {
    const model = options.model ?? this.getDefaultModel()

    if (this.provider === 'openrouter') {
      return this.chatStreamOpenRouter({ ...options, model }, callbacks)
    } else {
      return this.chatStreamGemini({ ...options, model }, callbacks)
    }
  }

  // OpenRouter implementation
  private async chatOpenRouter(options: ChatOptions & { model: string }): Promise<ChatResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Heph',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error: ${error}`)
    }

    const data = await response.json()
    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  }

  private async chatStreamOpenRouter(
    options: ChatOptions & { model: string },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Heph',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      callbacks.onError(new Error(`OpenRouter API error: ${error}`))
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
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              fullContent += token
              callbacks.onToken(token)
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      callbacks.onComplete({
        content: fullContent,
        model: options.model,
      })
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  // Gemini implementation
  private async chatGemini(options: ChatOptions & { model: string }): Promise<ChatResponse> {
    const contents = this.convertToGeminiFormat(options.messages)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${this.getApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${error}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    return {
      content,
      model: options.model,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    }
  }

  private async chatStreamGemini(
    options: ChatOptions & { model: string },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const contents = this.convertToGeminiFormat(options.messages)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?key=${this.getApiKey()}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      callbacks.onError(new Error(`Gemini API error: ${error}`))
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
            const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
            if (token) {
              fullContent += token
              callbacks.onToken(token)
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      callbacks.onComplete({
        content: fullContent,
        model: options.model,
      })
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private convertToGeminiFormat(
    messages: ChatMessage[]
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    // Gemini uses 'user' and 'model' roles, and system prompts go first as user message
    const result: Array<{ role: string; parts: Array<{ text: string }> }> = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Prepend system message as user message
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
}

// Singleton instance
export const llm = new LLMService()
