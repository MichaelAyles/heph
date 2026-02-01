/**
 * DebugBreakpointModal - Modal shown when execution pauses at a debug breakpoint
 *
 * Displays the system prompt and user context, allowing the user to inspect
 * what will be sent to the LLM before continuing or cancelling execution.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  XCircle,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Clock,
  Cpu,
  FileText,
  ExternalLink,
  Boxes,
  MessageSquare,
  RefreshCw,
  FlaskConical,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Image,
} from 'lucide-react'
import { useDebugBreakpointStore } from '../../stores/debug-breakpoint'

export function DebugBreakpointModal() {
  const { pendingBreakpoint, resolveWith } = useDebugBreakpointStore()
  const [systemPromptSectionExpanded, setSystemPromptSectionExpanded] = useState(false)
  const [dynamicContextExpanded, setDynamicContextExpanded] = useState(true)
  const [attachedImagesExpanded, setAttachedImagesExpanded] = useState(true)
  const [userInputExpanded, setUserInputExpanded] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  // Reload and test state
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null)
  const [isReloading, setIsReloading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    systemPrompt: string
    userPrompt: string
    rawResponse: string
    model?: string
    durationMs?: number
  } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testResultExpanded, setTestResultExpanded] = useState(true)

  // Reset state when breakpoint changes
  useEffect(() => {
    setCurrentPrompt(null)
    setTestResult(null)
    setTestError(null)
  }, [pendingBreakpoint?.id])

  // Reload prompt from database
  const handleReload = async () => {
    if (!pendingBreakpoint) return
    setIsReloading(true)
    try {
      const res = await fetch(`/api/admin/orchestrator/prompts/${pendingBreakpoint.nodeName}`)
      if (!res.ok) throw new Error('Failed to fetch prompt')
      const data = await res.json()
      setCurrentPrompt(data.prompt?.systemPrompt || null)
    } catch (err) {
      console.error('Failed to reload prompt:', err)
    } finally {
      setIsReloading(false)
    }
  }

  // Test the LLM call without continuing
  const handleTest = async () => {
    if (!pendingBreakpoint) return
    setIsTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const res = await fetch(`/api/langgraph/breakpoint/${pendingBreakpoint.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPromptOverride: currentPrompt || undefined,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Test failed')
      }
      const data = await res.json()
      setTestResult({
        // For test results, show the expanded prompt (what actually gets sent to LLM)
        systemPrompt:
          data.debug?.systemPrompt || currentPrompt || pendingBreakpoint.systemPromptExpanded,
        userPrompt:
          data.debug?.userPrompt ||
          JSON.stringify(data.input || pendingBreakpoint.fullInput, null, 2),
        rawResponse: data.debug?.rawResponse || JSON.stringify(data.output, null, 2),
        model: data.debug?.model,
        durationMs: data.debug?.durationMs,
      })
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setIsTesting(false)
    }
  }

  // Calculate and update time remaining
  useEffect(() => {
    if (!pendingBreakpoint) return

    const updateTimer = () => {
      const expiry = new Date(pendingBreakpoint.expiresAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000))
      setTimeRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [pendingBreakpoint])

  // Auto-cancel when expired
  useEffect(() => {
    if (timeRemaining === 0 && pendingBreakpoint) {
      resolveWith('cancel')
    }
  }, [timeRemaining, pendingBreakpoint, resolveWith])

  if (!pendingBreakpoint) return null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Parse the data
  const inputData = pendingBreakpoint.fullInput
  const inputKeys = Object.keys(inputData)
  const dynamicContext = pendingBreakpoint.dynamicContext || {}

  // Extract @ variables used in the system prompt template (raw with @variables)
  const activePrompt = currentPrompt || pendingBreakpoint.systemPromptTemplate
  const usedVariables = new Set<string>()

  // Check for @availableBlocks
  if (activePrompt.includes('@availableBlocks')) {
    usedVariables.add('availableBlocks')
  }

  // Check for @projectState or @projectState.* paths
  if (/@projectState(?:\.[a-zA-Z0-9_.]+)?/.test(activePrompt)) {
    usedVariables.add('projectState')
  }

  // Check for @feasibility or @feasibility.* paths (shortcut for projectState.spec.feasibility)
  if (/@feasibility(?:\.[a-zA-Z0-9_.]+)?/.test(activePrompt)) {
    usedVariables.add('feasibility')
  }

  // Check for @requirements
  if (activePrompt.includes('@requirements')) {
    usedVariables.add('requirements')
  }

  // Only show context items that are actually used in the prompt
  const hasBlocks =
    usedVariables.has('availableBlocks') &&
    dynamicContext.availableBlocks &&
    dynamicContext.availableBlocks.length > 0
  const hasProjectState =
    (usedVariables.has('projectState') || usedVariables.has('feasibility')) &&
    dynamicContext.projectState
  const hasRequirements =
    usedVariables.has('requirements') &&
    dynamicContext.requirements &&
    dynamicContext.requirements.length > 0
  const hasDynamicContext = hasBlocks || hasProjectState || hasRequirements

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-surface-900 rounded-xl border border-amber-500/50 shadow-lg shadow-amber-500/10 w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-steel">Debug Breakpoint</h3>
              <div className="flex items-center gap-2 text-sm text-steel-dim">
                <span>Node:</span>
                <span className="text-amber-400 font-mono">{pendingBreakpoint.nodeName}</span>
                <span className="text-surface-500">•</span>
                <span
                  className={
                    pendingBreakpoint.nodeType === 'image' ? 'text-purple-400' : 'text-cyan-400'
                  }
                >
                  {pendingBreakpoint.nodeType === 'image' ? 'Image' : 'Chat'}
                </span>
                {(pendingBreakpoint.invocationConfig as { model?: string })?.model && (
                  <>
                    <span className="text-surface-500">•</span>
                    <span className="text-steel font-mono text-xs">
                      {(pendingBreakpoint.invocationConfig as { model?: string }).model}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => resolveWith('cancel')}
            className="text-steel-dim hover:text-steel transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Info Bar */}
        <div className="flex items-center gap-6 px-4 py-3 bg-surface-800/50 text-sm border-b border-surface-700">
          <div className="flex items-center gap-2 text-steel-dim">
            <FileText className="w-4 h-4" />
            <span>~{pendingBreakpoint.tokenEstimate.toLocaleString()} tokens</span>
          </div>
          {pendingBreakpoint.projectId && (
            <div className="flex items-center gap-2 text-steel-dim">
              <span>Project:</span>
              <Link
                to={`/project/${pendingBreakpoint.projectId}/spec`}
                className="font-mono text-copper hover:text-copper-light transition-colors"
                target="_blank"
              >
                {pendingBreakpoint.projectId.slice(0, 8)}...
              </Link>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Clock
              className={`w-4 h-4 ${timeRemaining < 60 ? 'text-red-400' : 'text-steel-dim'}`}
            />
            <span className={`font-mono ${timeRemaining < 60 ? 'text-red-400' : 'text-steel-dim'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* System Prompt Section - shows raw template with @variables */}
          <div className="border border-surface-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-surface-800">
              <button
                onClick={() => setSystemPromptSectionExpanded(!systemPromptSectionExpanded)}
                className="flex items-center gap-2 hover:text-steel transition-colors"
              >
                {systemPromptSectionExpanded ? (
                  <ChevronDown className="w-4 h-4 text-steel-dim" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-steel-dim" />
                )}
                <FileText className="w-4 h-4 text-steel-dim" />
                <span className="font-medium text-steel">System Prompt</span>
                {currentPrompt ? (
                  <span className="text-xs text-emerald-400">(reloaded)</span>
                ) : (
                  <span className="text-xs text-steel-dim">(template)</span>
                )}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-steel-dim">
                  {(
                    currentPrompt || pendingBreakpoint.systemPromptTemplate
                  ).length.toLocaleString()}{' '}
                  chars
                </span>
                <button
                  onClick={handleReload}
                  disabled={isReloading}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 transition-colors disabled:opacity-50"
                  title="Reload prompt from database"
                >
                  <RefreshCw className={`w-3 h-3 ${isReloading ? 'animate-spin' : ''}`} />
                  <span className="text-xs">Reload</span>
                </button>
                <Link
                  to={`/admin/langgraph?node=${pendingBreakpoint.nodeName}`}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-copper/20 text-copper hover:bg-copper/30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="text-xs">Edit</span>
                </Link>
              </div>
            </div>
            {systemPromptSectionExpanded && (
              <div className="p-4 bg-surface-900/50">
                <pre className="text-sm text-steel-dim whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                  {currentPrompt || pendingBreakpoint.systemPromptTemplate}
                </pre>
              </div>
            )}
          </div>

          {/* Dynamic Context Section */}
          {hasDynamicContext && (
            <div className="border border-emerald-500/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setDynamicContextExpanded(!dynamicContextExpanded)}
                className="w-full flex items-center justify-between p-3 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {dynamicContextExpanded ? (
                    <ChevronDown className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  )}
                  <Boxes className="w-4 h-4 text-emerald-400" />
                  <span className="font-medium text-emerald-300">Dynamic Context</span>
                  <span className="text-xs text-emerald-400/70">(@ variables used in prompt)</span>
                </div>
              </button>
              {dynamicContextExpanded && (
                <div className="p-4 bg-surface-900/50 space-y-3">
                  {/* Available Blocks */}
                  {hasBlocks && (
                    <div className="border border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-800">
                        <span className="font-mono text-sm text-emerald-400">availableBlocks</span>
                        <span className="text-xs text-steel-dim">
                          {dynamicContext.availableBlocks!.length} blocks
                        </span>
                      </div>
                      <div className="p-3 bg-surface-900/50 max-h-48 overflow-y-auto">
                        <div className="space-y-2">
                          {dynamicContext.availableBlocks!.map((block) => (
                            <div
                              key={block.slug}
                              className="flex items-center justify-between text-sm border-b border-surface-700/50 pb-2 last:border-0 last:pb-0"
                            >
                              <div>
                                <span className="text-steel font-medium">{block.name}</span>
                                <span className="text-steel-dim ml-2">({block.category})</span>
                              </div>
                              {block.interfaces && block.interfaces.length > 0 && (
                                <span className="text-xs text-copper">
                                  {block.interfaces.join(', ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Project State */}
                  {hasProjectState && (
                    <div className="border border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-800">
                        <span className="font-mono text-sm text-emerald-400">projectState</span>
                        <span className="text-xs text-steel-dim">
                          status: {dynamicContext.projectState!.status}
                        </span>
                      </div>
                      <div className="p-3 bg-surface-900/50">
                        <pre className="text-sm text-steel-dim whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                          {JSON.stringify(dynamicContext.projectState, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Requirements */}
                  {hasRequirements && (
                    <div className="border border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-800">
                        <span className="font-mono text-sm text-emerald-400">requirements</span>
                        <span className="text-xs text-steel-dim">
                          {dynamicContext.requirements!.length} items
                        </span>
                      </div>
                      <div className="p-3 bg-surface-900/50">
                        <ul className="list-disc list-inside text-sm text-steel-dim space-y-1">
                          {dynamicContext.requirements!.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attached Images Section - for @image: variables */}
          {pendingBreakpoint.extractedImages && pendingBreakpoint.extractedImages.length > 0 && (
            <div className="border border-purple-500/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setAttachedImagesExpanded(!attachedImagesExpanded)}
                className="w-full flex items-center justify-between p-3 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {attachedImagesExpanded ? (
                    <ChevronDown className="w-4 h-4 text-purple-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  )}
                  <Image className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-purple-300">Attached Images</span>
                  <span className="text-xs text-purple-400/70">(@image: variables)</span>
                </div>
                <span className="text-xs text-steel-dim">
                  {pendingBreakpoint.extractedImages.length} image
                  {pendingBreakpoint.extractedImages.length !== 1 ? 's' : ''} • ~
                  {(pendingBreakpoint.extractedImages.length * 258).toLocaleString()} tokens
                </span>
              </button>
              {attachedImagesExpanded && (
                <div className="p-4 bg-surface-900/50">
                  <div className="grid grid-cols-2 gap-4">
                    {pendingBreakpoint.extractedImages.map((img, index) => (
                      <div
                        key={index}
                        className="border border-surface-700 rounded-lg overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-surface-800 flex items-center justify-between">
                          <span className="font-mono text-xs text-purple-400">
                            @image:{img.label}
                          </span>
                        </div>
                        <div className="p-3 bg-surface-900/50 flex items-center justify-center">
                          <img
                            src={img.url}
                            alt={`Attached image: ${img.label}`}
                            className="max-w-full max-h-48 rounded border border-surface-700 object-contain bg-surface-800"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                              const parent = e.currentTarget.parentElement
                              if (parent) {
                                const errorMsg = document.createElement('span')
                                errorMsg.className = 'text-xs text-red-400'
                                errorMsg.textContent = `Failed to load: ${img.url}`
                                parent.appendChild(errorMsg)
                              }
                            }}
                          />
                        </div>
                        <div className="px-3 py-1 bg-surface-800/50 border-t border-surface-700">
                          <a
                            href={img.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-steel-dim hover:text-copper truncate block"
                            title={img.url}
                          >
                            {img.url}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Input Section */}
          <div className="border border-amber-500/30 rounded-lg overflow-hidden">
            <button
              onClick={() => setUserInputExpanded(!userInputExpanded)}
              className="w-full flex items-center justify-between p-3 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                {userInputExpanded ? (
                  <ChevronDown className="w-4 h-4 text-amber-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-amber-400" />
                )}
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-amber-300">User Input</span>
                <span className="text-xs text-amber-400/70">(request params)</span>
              </div>
              <span className="text-xs text-steel-dim">{inputKeys.length} fields</span>
            </button>
            {userInputExpanded && (
              <div className="p-4 bg-surface-900/50 space-y-3">
                {inputKeys.map((key) => {
                  const value = inputData[key]
                  const isObject = typeof value === 'object' && value !== null
                  const displayValue = isObject ? JSON.stringify(value, null, 2) : String(value)
                  const isLarge = displayValue.length > 200

                  return (
                    <div key={key} className="border border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-800">
                        <span className="font-mono text-sm text-amber-400">{key}</span>
                        <span className="text-xs text-steel-dim">
                          {isObject
                            ? Array.isArray(value)
                              ? `array[${value.length}]`
                              : 'object'
                            : typeof value}
                        </span>
                      </div>
                      <div className="p-3 bg-surface-900/50">
                        <pre
                          className={`text-sm text-steel-dim whitespace-pre-wrap font-mono ${isLarge ? 'max-h-32 overflow-y-auto' : ''}`}
                        >
                          {displayValue}
                        </pre>
                      </div>
                    </div>
                  )
                })}
                {inputKeys.length === 0 && (
                  <p className="text-sm text-steel-dim italic">No input data</p>
                )}
              </div>
            )}
          </div>

          {/* Test Result Section */}
          {(testResult || testError) && (
            <div
              className={`border rounded-lg overflow-hidden ${testError ? 'border-red-500/30' : 'border-cyan-500/30'}`}
            >
              <button
                onClick={() => setTestResultExpanded(!testResultExpanded)}
                className={`w-full flex items-center justify-between p-3 transition-colors ${testError ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-cyan-500/10 hover:bg-cyan-500/20'}`}
              >
                <div className="flex items-center gap-2">
                  {testResultExpanded ? (
                    <ChevronDown
                      className={`w-4 h-4 ${testError ? 'text-red-400' : 'text-cyan-400'}`}
                    />
                  ) : (
                    <ChevronRight
                      className={`w-4 h-4 ${testError ? 'text-red-400' : 'text-cyan-400'}`}
                    />
                  )}
                  {testError ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-cyan-400" />
                  )}
                  <span className={`font-medium ${testError ? 'text-red-300' : 'text-cyan-300'}`}>
                    Test Result
                  </span>
                  {testResult && (
                    <span className="text-xs text-cyan-400/70">
                      {testResult.model && `${testResult.model}`}
                      {testResult.durationMs && ` • ${testResult.durationMs}ms`}
                    </span>
                  )}
                  {testError && <span className="text-xs text-red-400/70">(error)</span>}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setTestResult(null)
                    setTestError(null)
                  }}
                  className="text-xs text-steel-dim hover:text-steel px-2 py-1 rounded bg-surface-700/50 hover:bg-surface-700"
                >
                  Clear
                </button>
              </button>
              {testResultExpanded && (
                <div className="p-4 bg-surface-900/50 space-y-4">
                  {testError ? (
                    <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-red-300">
                      {testError}
                    </pre>
                  ) : (
                    testResult && (
                      <>
                        {/* Outgoing Message - raw format as sent to LLM */}
                        <div className="border border-amber-500/30 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10">
                            <div className="flex items-center gap-2">
                              <ArrowRight className="w-4 h-4 text-amber-400" />
                              <span className="text-sm font-medium text-amber-400">
                                Outgoing Message
                              </span>
                            </div>
                            <span className="text-xs text-steel-dim">
                              {(
                                testResult.systemPrompt.length + testResult.userPrompt.length
                              ).toLocaleString()}{' '}
                              chars total
                            </span>
                          </div>
                          <div className="p-3 bg-surface-900/50">
                            <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-steel-dim max-h-96 overflow-y-auto">
                              {`[SYSTEM]\n${testResult.systemPrompt}\n\n[USER]\n${testResult.userPrompt}`}
                            </pre>
                          </div>
                        </div>

                        {/* Incoming Message */}
                        <div className="border border-cyan-500/30 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-cyan-500/10">
                            <div className="flex items-center gap-2">
                              <ArrowLeft className="w-4 h-4 text-cyan-400" />
                              <span className="text-sm font-medium text-cyan-400">
                                Incoming (LLM Response)
                              </span>
                            </div>
                            <span className="text-xs text-steel-dim">
                              {testResult.rawResponse.length.toLocaleString()} chars
                            </span>
                          </div>
                          <div className="p-3 bg-surface-900/50">
                            <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed text-steel-dim max-h-64 overflow-y-auto">
                              {testResult.rawResponse}
                            </pre>
                          </div>
                        </div>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-surface-700 bg-surface-800/50">
          <button
            onClick={() => resolveWith('cancel')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-600 text-steel-dim hover:text-steel hover:border-surface-500 transition-colors"
          >
            <Square className="w-4 h-4" />
            Cancel Execution
          </button>
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            {isTesting ? 'Testing...' : 'Test'}
          </button>
          <button
            onClick={() => resolveWith('continue')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
