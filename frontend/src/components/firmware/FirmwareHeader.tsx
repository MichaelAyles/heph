/**
 * FirmwareHeader - Header with generation and modification controls
 */

import { clsx } from 'clsx'
import { Loader2, Check, X, Sparkles, MessageSquare, Send } from 'lucide-react'
import { StageCompleteButton } from '@/components/workspace/StageCompleteButton'
import type { UploadedBinary } from './types'
import type { ProjectSpec } from '@/db/schema'

interface FirmwareHeaderProps {
  spec: ProjectSpec | null
  projectId: string
  uploadedBinary: UploadedBinary | null
  isGenerating: boolean
  generationError: string | null
  showChat: boolean
  chatInput: string
  isModifying: boolean
  hasFirmwareFiles: boolean
  onGenerate: () => void
  onToggleChat: () => void
  onChatInputChange: (value: string) => void
  onModify: () => void
  onComplete: () => void
}

export function FirmwareHeader({
  spec,
  projectId,
  uploadedBinary,
  isGenerating,
  generationError,
  showChat,
  chatInput,
  isModifying,
  hasFirmwareFiles,
  onGenerate,
  onToggleChat,
  onChatInputChange,
  onModify,
  onComplete,
}: FirmwareHeaderProps) {
  return (
    <div className="flex-none flex-shrink-0 px-6 py-4 border-b border-surface-700 bg-surface-900">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-steel mb-0.5">Firmware Development</h2>
          <p className="text-steel-dim text-sm">
            Edit, download, and compile firmware for your ESP32-C6
          </p>
        </div>
        <div className="flex items-center gap-2">
          {uploadedBinary && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 text-sm">
              <Check className="w-4 h-4" />
              {uploadedBinary.name} ({(uploadedBinary.size / 1024).toFixed(1)} KB)
            </div>
          )}
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ash bg-copper hover:bg-copper-light disabled:opacity-50 rounded transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Firmware
              </>
            )}
          </button>
          <button
            onClick={onToggleChat}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded transition-colors',
              showChat
                ? 'bg-copper/20 text-copper'
                : 'text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Modify
          </button>
          {/* User mark complete button */}
          <StageCompleteButton
            stage="firmware"
            spec={spec}
            projectId={projectId}
            canComplete={hasFirmwareFiles}
            onComplete={onComplete}
          />
        </div>
      </div>

      {/* Error display */}
      {generationError && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          <X className="w-4 h-4 flex-shrink-0" />
          {generationError}
        </div>
      )}

      {/* Chat input */}
      {showChat && (
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isModifying && onModify()}
            placeholder="Describe what you want to change... (e.g., 'add WiFi reconnection logic', 'use FastLED instead of NeoPixel')"
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-600 rounded text-steel placeholder:text-surface-500 text-sm focus:outline-none focus:border-copper"
          />
          <button
            onClick={onModify}
            disabled={isModifying || !chatInput.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-copper hover:bg-copper-light disabled:opacity-50 rounded transition-colors"
          >
            {isModifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
