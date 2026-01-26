/**
 * BuildPanel - Shows compilation output and status
 */

import { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Terminal,
  Clock,
  HardDrive,
} from 'lucide-react'

export interface CompileResult {
  success: boolean
  firmware?: string // base64
  firmwareSize?: number
  buildOutput?: string
  error?: string
  duration?: number
}

interface BuildPanelProps {
  isCompiling: boolean
  compileResult: CompileResult | null
  onDownloadBinary: () => void
  onRetry: () => void
}

export function BuildPanel({
  isCompiling,
  compileResult,
  onDownloadBinary,
  onRetry,
}: BuildPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const outputRef = useRef<HTMLPreElement>(null)

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current && isCompiling) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [compileResult?.buildOutput, isCompiling])

  // Auto-expand on compile start
  useEffect(() => {
    if (isCompiling) {
      setIsExpanded(true)
    }
  }, [isCompiling])

  if (!isCompiling && !compileResult) {
    return null
  }

  return (
    <div className="border-t border-surface-700 bg-surface-900">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-steel-dim" />
          <span className="text-sm font-medium text-steel">Build Output</span>
          {isCompiling && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Compiling...
            </span>
          )}
          {compileResult && !isCompiling && (
            <span
              className={clsx(
                'flex items-center gap-1.5 text-xs',
                compileResult.success ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {compileResult.success ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Build Succeeded
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  Build Failed
                </>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {compileResult && !isCompiling && (
            <>
              {compileResult.duration && (
                <span className="flex items-center gap-1 text-xs text-steel-dim">
                  <Clock className="w-3 h-3" />
                  {(compileResult.duration / 1000).toFixed(1)}s
                </span>
              )}
              {compileResult.firmwareSize && (
                <span className="flex items-center gap-1 text-xs text-steel-dim">
                  <HardDrive className="w-3 h-3" />
                  {(compileResult.firmwareSize / 1024).toFixed(1)} KB
                </span>
              )}
            </>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-steel-dim" />
          ) : (
            <ChevronUp className="w-4 h-4 text-steel-dim" />
          )}
        </div>
      </button>

      {/* Output */}
      {isExpanded && (
        <div className="border-t border-surface-700">
          <pre
            ref={outputRef}
            className="h-48 overflow-auto p-4 text-xs font-mono text-steel-dim bg-surface-950 whitespace-pre-wrap"
          >
            {compileResult?.buildOutput || (isCompiling ? 'Starting compilation...\n' : '')}
            {compileResult?.error && (
              <span className="text-red-400">{'\n'}Error: {compileResult.error}</span>
            )}
          </pre>

          {/* Actions */}
          {compileResult && !isCompiling && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-surface-700">
              {!compileResult.success && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
                >
                  Retry Build
                </button>
              )}
              {compileResult.success && compileResult.firmware && (
                <button
                  onClick={onDownloadBinary}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ash bg-emerald-600 hover:bg-emerald-500 rounded transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download firmware.bin ({(compileResult.firmwareSize! / 1024).toFixed(1)} KB)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
