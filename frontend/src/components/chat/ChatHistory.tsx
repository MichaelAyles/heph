/**
 * ChatHistory Component
 *
 * Scrollable message list for the chat interface.
 */

import { useRef, useEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../stores/chat'
import { ChatMessage } from './ChatMessage'

interface ChatHistoryProps {
  messages: ChatMessageType[]
  isLoading: boolean
}

export function ChatHistory({ messages, isLoading }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-center text-zinc-500">
            <div className="text-4xl mb-4">🔧</div>
            <h2 className="text-xl font-semibold mb-2">Welcome to PHAESTUS</h2>
            <p className="text-sm max-w-md">
              Describe the hardware project you want to build, and I'll help you
              assess its feasibility and guide you through the design process.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-zinc-400">Analyzing...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
