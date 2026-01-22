/**
 * Shared Message Types for LLM Communication
 *
 * These types are used by both frontend services and backend functions.
 * IMPORTANT: Functions code must use relative imports (not @/ aliases).
 */

// =============================================================================
// Core Message Content Types (for vision/multimodal support)
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

// =============================================================================
// Tool Calling Types
// =============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: string[]
  items?: ToolParameter
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

// =============================================================================
// OpenAI/OpenRouter Format Types
// =============================================================================

export interface OpenAITextContent {
  type: 'text'
  text: string
}

export interface OpenAIImageContent {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type OpenAIContent = string | (OpenAITextContent | OpenAIImageContent)[]

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system'
  content: OpenAIContent
}

// =============================================================================
// Gemini Format Types
// =============================================================================

export interface GeminiTextPart {
  text: string
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string
    data: string
  }
}

export type GeminiPart = GeminiTextPart | GeminiInlineDataPart

export interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

// =============================================================================
// Request/Response Types
// =============================================================================

export interface ChatRequest {
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
// Common Function Types
// =============================================================================

export interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

export interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}
