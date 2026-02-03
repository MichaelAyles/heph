/**
 * EditorPanel - Monaco editor for OpenSCAD code with feedback input
 */

import { clsx } from 'clsx'
import { Download, Play, MessageSquare, RefreshCw, Loader2, CheckCircle, Bug } from 'lucide-react'
import Editor from '@monaco-editor/react'
import type { EditorPanelProps } from './types'
import { MAX_VALIDATION_ITERATIONS } from './types'

export function EditorPanel({
  openScadCode,
  onCodeChange,
  feedback,
  onFeedbackChange,
  isGenerating,
  isRendering,
  isValidating,
  validationStatus,
  validationIteration,
  validationIssues,
  debugMode,
  onRender,
  onRegenerate,
  onDownloadSource,
  onRunValidation,
}: EditorPanelProps) {
  const criticalCount = validationIssues.filter((i) => i.severity === 'critical').length
  const warningCount = validationIssues.filter((i) => i.severity === 'warning').length
  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-steel">OpenSCAD Code</h3>
          {debugMode && (
            <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded flex items-center gap-1">
              <Bug className="w-3 h-3" />
              Debug
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadSource}
            className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
            title="Download OpenSCAD source"
          >
            <Download className="w-3.5 h-3.5" />
            .scad
          </button>
          {debugMode && (
            <button
              onClick={onRunValidation}
              disabled={isValidating || !openScadCode}
              className={clsx(
                'px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 transition-colors',
                isValidating || !openScadCode
                  ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                  : 'bg-amber-600 text-surface-900 hover:bg-amber-500'
              )}
              title="Run one validation + fix iteration"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Validate
                </>
              )}
            </button>
          )}
          <button
            onClick={onRender}
            disabled={isRendering || !openScadCode}
            className={clsx(
              'px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 transition-colors',
              isRendering || !openScadCode
                ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                : 'bg-copper text-surface-900 hover:bg-copper-light'
            )}
          >
            {isRendering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Render
              </>
            )}
          </button>
        </div>
      </div>
      {/* Validation issues summary (debug mode) */}
      {debugMode && validationIssues.length > 0 && (
        <div className="px-4 py-2 border-b border-surface-700 bg-surface-800/50 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-steel-dim">Last validation:</span>
            {criticalCount > 0 && <span className="text-red-400">{criticalCount} critical</span>}
            {warningCount > 0 && <span className="text-amber-400">{warningCount} warnings</span>}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="text-green-400">All checks passed</span>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="c"
          theme="vs-dark"
          value={openScadCode}
          onChange={(value) => onCodeChange(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </div>
      {/* Feedback input */}
      <div className="px-4 py-3 border-t border-surface-700">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              value={feedback}
              onChange={(e) => onFeedbackChange(e.target.value)}
              placeholder="Describe changes (e.g., 'make the corners more rounded')"
              className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-600 rounded text-sm text-steel placeholder:text-surface-500 focus:outline-none focus:border-copper"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && feedback.trim()) {
                  onRegenerate()
                }
              }}
            />
          </div>
          <button
            onClick={onRegenerate}
            disabled={isGenerating || !feedback.trim()}
            className={clsx(
              'px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5 transition-colors',
              isGenerating || !feedback.trim()
                ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                : 'bg-surface-700 text-steel hover:bg-surface-600'
            )}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Regenerate
          </button>
        </div>
        {/* Validation status during regeneration */}
        {isGenerating && validationStatus && (
          <div className="mt-2 flex items-center gap-2 text-xs text-steel-dim">
            <Loader2 className="w-3 h-3 animate-spin text-copper" />
            <span>{validationStatus}</span>
            {validationIteration > 0 && (
              <span className="text-surface-500">
                (iteration {validationIteration}/{MAX_VALIDATION_ITERATIONS})
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
