/**
 * LLM Helper Utilities
 *
 * Standardized patterns for LLM calls with JSON extraction.
 */

import { llm, type ChatMessage } from '../../llm'

export interface LlmCallOptions {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  projectId: string
}

export interface LlmCallResult<T> {
  success: boolean
  data?: T
  error?: string
  rawContent?: string
}

/**
 * Make an LLM call and extract JSON from the response.
 * Handles the common pattern of system + user prompt with JSON extraction.
 */
export async function callLlmWithJson<T>(options: LlmCallOptions): Promise<LlmCallResult<T>> {
  const { systemPrompt, userPrompt, temperature = 0.3, maxTokens, projectId } = options

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  try {
    const response = await llm.chat({
      messages,
      temperature,
      maxTokens,
      projectId,
    })

    const jsonMatch = response.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        success: false,
        error: 'No JSON in response',
        rawContent: response.content,
      }
    }

    const data = JSON.parse(jsonMatch[0]) as T
    return { success: true, data, rawContent: response.content }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Make an LLM call and extract code from the response.
 * Handles code blocks with optional language specification.
 */
export async function callLlmWithCode(options: LlmCallOptions): Promise<LlmCallResult<string>> {
  const { systemPrompt, userPrompt, temperature = 0.3, maxTokens, projectId } = options

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  try {
    const response = await llm.chat({
      messages,
      temperature,
      maxTokens,
      projectId,
    })

    // Extract code from markdown code block
    const codeMatch = response.content.match(/```(?:\w+)?\s*([\s\S]*?)```/)
    const code = codeMatch?.[1]?.trim() || response.content

    return { success: true, data: code, rawContent: response.content }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
