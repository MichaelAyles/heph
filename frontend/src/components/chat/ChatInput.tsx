/**
 * ChatInput Component
 *
 * Message input with submit button for the chat interface.
 */

import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  placeholder?: string
}

export function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      onSend(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Describe what you want to build..."}
            disabled={isLoading}
            rows={1}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <div className="absolute bottom-2 right-2 text-xs text-zinc-600">
            {message.length}/2000
          </div>
        </div>
        <button
          type="submit"
          disabled={!message.trim() || isLoading}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-600">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  )
}
