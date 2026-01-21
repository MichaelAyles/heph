/**
 * ChatContainer Component
 *
 * Main chat wrapper that manages state and composes chat subcomponents.
 */

import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { useChatStore } from '../../stores/chat'
import { ChatHistory } from './ChatHistory'
import { ChatInput } from './ChatInput'

export function ChatContainer() {
  const navigate = useNavigate()
  const {
    messages,
    isLoading,
    error,
    latestRoute,
    projectId,
    sendMessage,
    clearChat,
    setError,
  } = useChatStore()

  // Navigate to project workspace when project is created
  useEffect(() => {
    if (latestRoute === 'PROCEED' && projectId) {
      // Small delay to let user see the success message
      const timer = setTimeout(() => {
        navigate(`/project/${projectId}/spec`)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [latestRoute, projectId, navigate])

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">PHAESTUS</h1>
          <p className="text-sm text-zinc-500">AI Hardware Design Assistant</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RotateCcw className="h-4 w-4" />
            New Chat
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-900/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Project created banner */}
      {latestRoute === 'PROCEED' && projectId && (
        <div className="flex items-center justify-center gap-2 border-b border-green-900/50 bg-green-900/20 px-4 py-2 text-sm text-green-400">
          <span>Project created! Redirecting to workspace...</span>
        </div>
      )}

      {/* Chat history */}
      <ChatHistory messages={messages} isLoading={isLoading} />

      {/* Input */}
      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  )
}
