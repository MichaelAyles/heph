/**
 * LLM Wrapper for LangGraph Nodes
 *
 * Adapts the existing llm.ts service for use in LangGraph nodes.
 * Keeps all existing functionality: retry logic, server-side API keys, streaming.
 */

import {
  llm,
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
  type ToolChatOptions,
  type ToolChatResponse,
  type ToolDefinition,
  type ToolCall,
} from '../llm'

// Re-export types for convenience
export type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ToolChatOptions,
  ToolChatResponse,
  ToolDefinition,
  ToolCall,
}

/**
 * LLM adapter that wraps our custom LLM service for use in LangGraph nodes.
 *
 * This keeps our existing:
 * - Retry logic with exponential backoff
 * - Server-side API key handling
 * - Streaming support
 * - Tool calling support
 */
export const llmAdapter = {
  /**
   * Simple chat completion (used by most tool implementations)
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    return llm.chat(options)
  },

  /**
   * Chat with tool calling support
   */
  async chatWithTools(options: ToolChatOptions): Promise<ToolChatResponse> {
    return llm.chatWithTools(options)
  },

  /**
   * Build messages array with system prompt and user content
   */
  buildMessages(
    systemPrompt: string,
    userContent: string,
    previousMessages?: ChatMessage[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

    if (previousMessages) {
      messages.push(...previousMessages)
    }

    messages.push({ role: 'user', content: userContent })
    return messages
  },

  /**
   * Extract JSON from LLM response content using regex.
   * Returns null if no valid JSON found.
   */
  parseJson<T>(content: string): T | null {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    try {
      return JSON.parse(jsonMatch[0]) as T
    } catch {
      return null
    }
  },

  /**
   * Extract JSON array from LLM response content.
   * Returns null if no valid JSON array found.
   */
  parseJsonArray<T>(content: string): T[] | null {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return null

    try {
      return JSON.parse(jsonMatch[0]) as T[]
    } catch {
      return null
    }
  },

  /**
   * Extract code block from LLM response.
   * Supports optional language specification (e.g., ```openscad)
   */
  extractCodeBlock(content: string, language?: string): string | null {
    const pattern = language
      ? new RegExp(`\`\`\`(?:${language})?\\s*([\\s\\S]*?)\`\`\``)
      : /```(?:\w+)?\s*([\s\S]*?)```/

    const match = content.match(pattern)
    return match ? match[1].trim() : null
  },

  /**
   * Extract multiple code blocks from LLM response.
   * Returns array of { language, code } objects.
   */
  extractAllCodeBlocks(content: string): Array<{ language: string | null; code: string }> {
    const blocks: Array<{ language: string | null; code: string }> = []
    const pattern = /```(\w+)?\s*([\s\S]*?)```/g
    let match

    while ((match = pattern.exec(content)) !== null) {
      blocks.push({
        language: match[1] || null,
        code: match[2].trim(),
      })
    }

    return blocks
  },
}

/**
 * Helper to create a chat request for a specific prompt template
 */
export function createChatRequest(
  systemPrompt: string,
  userPrompt: string,
  options?: Partial<Omit<ChatOptions, 'messages'>>
): ChatOptions {
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? 4096,
    projectId: options?.projectId,
    model: options?.model,
  }
}
