/**
 * ChatMessage Component
 *
 * Renders a single chat message bubble (user or assistant).
 */

import { clsx } from 'clsx'
import type { ChatMessage as ChatMessageType } from '../../stores/chat'
import { CapabilityCard } from './CapabilityCard'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={clsx(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={clsx(
          'max-w-[80%] rounded-lg px-4 py-3',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-100'
        )}
      >
        {/* Message content */}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content.split('\n').map((line, i) => {
            // Handle markdown-style bold
            const parts = line.split(/(\*\*[^*]+\*\*)/g)
            return (
              <p key={i} className={i > 0 ? 'mt-2' : ''}>
                {parts.map((part, j) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return (
                      <strong key={j} className="font-semibold">
                        {part.slice(2, -2)}
                      </strong>
                    )
                  }
                  return <span key={j}>{part}</span>
                })}
              </p>
            )
          })}
        </div>

        {/* Capability assessment card */}
        {message.assessment && (
          <div className="mt-3 border-t border-zinc-700 pt-3">
            <CapabilityCard assessment={message.assessment} route={message.route} />
          </div>
        )}

        {/* Timestamp */}
        <div
          className={clsx(
            'mt-2 text-xs',
            isUser ? 'text-blue-200' : 'text-zinc-500'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
