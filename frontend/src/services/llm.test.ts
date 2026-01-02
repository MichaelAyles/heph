import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { llm, type ChatOptions, type StreamCallbacks } from './llm'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('llm service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('chat', () => {
    it('should call /api/llm/chat with correct options', async () => {
      const mockResponse = {
        content: 'Hello!',
        model: 'google/gemini-2.0-flash',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const options: ChatOptions = {
        messages: [{ role: 'user', content: 'Hi!' }],
        model: 'google/gemini-2.0-flash',
        temperature: 0.7,
        maxTokens: 1000,
      }

      const result = await llm.chat(options)

      expect(mockFetch).toHaveBeenCalledWith('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })
      expect(result).toEqual(mockResponse)
    })

    it('should throw error on failed request (4xx - no retry)', async () => {
      // 404 errors don't retry (4xx are client errors)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Model not found (404)' }),
      })

      const options: ChatOptions = {
        messages: [{ role: 'user', content: 'Hi!' }],
      }

      await expect(llm.chat(options)).rejects.toThrow('Model not found (404)')
    })

    it('should throw default error when no error message provided (4xx - no retry)', async () => {
      // 400 errors don't retry
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      })

      const options: ChatOptions = {
        messages: [{ role: 'user', content: 'Hi!' }],
      }

      await expect(llm.chat(options)).rejects.toThrow('LLM request failed (400)')
    })

    it('should handle messages with different roles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: 'Response', model: 'test' }),
      })

      const options: ChatOptions = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi!' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ],
      }

      await llm.chat(options)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/llm/chat',
        expect.objectContaining({
          body: JSON.stringify(options),
        })
      )
    })

    it('should include projectId when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: 'Response', model: 'test' }),
      })

      const options: ChatOptions = {
        messages: [{ role: 'user', content: 'Hi!' }],
        projectId: 'project-123',
      }

      await llm.chat(options)

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body)
      expect(body.projectId).toBe('project-123')
    })
  })

  describe('chatStream', () => {
    it('should call /api/llm/stream endpoint', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      const options: ChatOptions = {
        messages: [{ role: 'user', content: 'Hi!' }],
      }

      await llm.chatStream(options, callbacks)

      expect(mockFetch).toHaveBeenCalledWith('/api/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })
    })

    it('should call onError when request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Stream failed' }),
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(expect.any(Error))
      expect((callbacks.onError as any).mock.calls[0][0].message).toBe('Stream failed')
    })

    it('should call onError with default message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect((callbacks.onError as any).mock.calls[0][0].message).toBe('LLM stream failed')
    })

    it('should call onError when no response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(new Error('No response body'))
    })

    it('should call onToken for each token received', async () => {
      const chunks = ['data: {"token":"Hello"}\n', 'data: {"token":" world"}\n', 'data: {"done":true}\n']

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const encoder = new TextEncoder()
            const chunk = encoder.encode(chunks[chunkIndex++])
            return Promise.resolve({ done: false, value: chunk })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onToken).toHaveBeenCalledWith('Hello')
      expect(callbacks.onToken).toHaveBeenCalledWith(' world')
      expect(callbacks.onComplete).toHaveBeenCalled()
    })

    it('should call onComplete with aggregated content', async () => {
      const chunks = [
        'data: {"token":"Hello"}\n',
        'data: {"token":" "}\n',
        'data: {"token":"world"}\n',
        'data: {"done":true,"content":"Hello world"}\n',
      ]

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const encoder = new TextEncoder()
            const chunk = encoder.encode(chunks[chunkIndex++])
            return Promise.resolve({ done: false, value: chunk })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [], model: 'test-model' }, callbacks)

      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: 'Hello world',
        model: 'test-model',
      })
    })

    it('should handle stream errors', async () => {
      const chunks = ['data: {"error":"Rate limit exceeded"}\n']

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const encoder = new TextEncoder()
            const chunk = encoder.encode(chunks[chunkIndex++])
            return Promise.resolve({ done: false, value: chunk })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(new Error('Rate limit exceeded'))
    })

    it('should skip malformed JSON lines', async () => {
      const chunks = [
        'data: {"token":"Hello"}\n',
        'data: not-valid-json\n',
        'data: {"done":true}\n',
      ]

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const encoder = new TextEncoder()
            const chunk = encoder.encode(chunks[chunkIndex++])
            return Promise.resolve({ done: false, value: chunk })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onToken).toHaveBeenCalledWith('Hello')
      expect(callbacks.onComplete).toHaveBeenCalled()
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('should complete with accumulated content when stream ends without done event', async () => {
      const chunks = ['data: {"token":"Hello"}\n', 'data: {"token":" world"}\n']

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const encoder = new TextEncoder()
            const chunk = encoder.encode(chunks[chunkIndex++])
            return Promise.resolve({ done: false, value: chunk })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [], model: 'my-model' }, callbacks)

      expect(callbacks.onComplete).toHaveBeenCalledWith({
        content: 'Hello world',
        model: 'my-model',
      })
    })

    it('should handle read errors', async () => {
      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('Stream read error')),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(new Error('Stream read error'))
    })

    it('should handle non-Error objects in catch', async () => {
      const mockReader = {
        read: vi.fn().mockRejectedValue('string error'),
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })

      const callbacks: StreamCallbacks = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      }

      await llm.chatStream({ messages: [] }, callbacks)

      expect(callbacks.onError).toHaveBeenCalledWith(new Error('string error'))
    })
  })
})
