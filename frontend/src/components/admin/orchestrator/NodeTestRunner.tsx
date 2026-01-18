/**
 * NodeTestRunner Component
 *
 * Allows testing a prompt node with sample data to verify
 * context selectors, templates, and output parsing.
 */

import { useState } from 'react'
import type { OrchestratorPrompt } from '../../../db/schema'
import { buildContextFromSelector, renderPromptTemplate } from '../../../services/orchestrator/context-builder'
import type { ProjectSpec } from '../../../db/schema'

interface NodeTestRunnerProps {
  prompt: OrchestratorPrompt
  onClose: () => void
}

// Sample spec data for testing - matches the actual ProjectSpec schema
const SAMPLE_SPEC: ProjectSpec = {
  description: 'A smart plant watering system that monitors soil moisture and waters automatically.',
  feasibility: {
    communication: { type: 'WiFi', confidence: 90, notes: 'ESP32-C6 has built-in WiFi' },
    processing: { level: 'medium', confidence: 85, notes: 'Simple logic with periodic sensor reads' },
    power: { options: ['USB', 'Battery'], confidence: 95, notes: 'Can run on either power source' },
    inputs: { items: ['Soil moisture sensor', 'Button'], confidence: 90 },
    outputs: { items: ['Relay for water pump', 'Status LED'], confidence: 90 },
    overallScore: 85,
    manufacturable: true,
  },
  openQuestions: [
    { id: '1', question: 'How large is the plant?', options: ['Small (under 15cm)', 'Medium (15-30cm)', 'Large (over 30cm)'] },
  ],
  decisions: [
    { questionId: '1', question: 'Power source?', answer: 'USB powered', timestamp: new Date().toISOString() },
  ],
  blueprints: [
    { url: '/sample.png', prompt: 'Compact box design for plant watering system' },
  ],
  selectedBlueprint: 0,
  finalSpec: {
    name: 'PlantPal Pro',
    summary: 'Automated plant watering with moisture monitoring',
    pcbSize: { width: 50, height: 50, unit: 'mm' },
    inputs: [{ type: 'Soil moisture sensor', count: 1, notes: 'Capacitive type' }],
    outputs: [{ type: 'Relay', count: 1, notes: 'Controls water pump' }],
    power: { source: 'USB', voltage: '5V', current: '500mA' },
    communication: { type: 'WiFi', protocol: '802.11n' },
    enclosure: { style: 'compact', width: 60, height: 60, depth: 30 },
    estimatedBOM: [{ item: 'ESP32-C6', quantity: 1, unitCost: 5.0 }],
    locked: true,
    lockedAt: new Date().toISOString(),
  },
  stages: {
    spec: { status: 'complete', completedAt: new Date().toISOString() },
    pcb: { status: 'pending' },
    enclosure: { status: 'pending' },
    firmware: { status: 'pending' },
    export: { status: 'pending' },
  },
}

export function NodeTestRunner({ prompt, onClose }: NodeTestRunnerProps) {
  const [sampleData, setSampleData] = useState(JSON.stringify(SAMPLE_SPEC, null, 2))
  const [contextResult, setContextResult] = useState<string>('')
  const [renderedPrompt, setRenderedPrompt] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'input' | 'context' | 'rendered'>('input')
  const [error, setError] = useState<string | null>(null)

  const runTest = () => {
    setError(null)
    try {
      // Parse sample data
      const spec = JSON.parse(sampleData) as ProjectSpec

      // Build context from selector
      const selector = prompt.contextSelector || ['*']
      const context = buildContextFromSelector(spec, selector)
      setContextResult(JSON.stringify(context, null, 2))

      // Render user prompt template
      if (prompt.userPromptTemplate) {
        const rendered = renderPromptTemplate(prompt.userPromptTemplate, context)
        setRenderedPrompt(rendered)
      } else {
        setRenderedPrompt('(No user prompt template defined - would use context as JSON)')
      }

      setActiveTab('context')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-surface-700 bg-surface-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-700 p-4">
          <div>
            <h2 className="text-lg font-medium text-surface-100">Test: {prompt.displayName}</h2>
            <p className="text-sm text-surface-400">
              Test context selectors and prompt templates with sample data
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-surface-400 hover:bg-surface-700 hover:text-surface-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-700">
          {(['input', 'context', 'rendered'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-accent-500 text-accent-400'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              {tab === 'input' ? 'Sample Data' : tab === 'context' ? 'Built Context' : 'Rendered Prompt'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="h-[50vh] overflow-auto p-4">
          {error && (
            <div className="mb-4 rounded bg-red-900/20 p-3 text-sm text-red-400">{error}</div>
          )}

          {activeTab === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Sample ProjectSpec JSON
                </label>
                <textarea
                  value={sampleData}
                  onChange={(e) => setSampleData(e.target.value)}
                  className="h-80 w-full rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-200"
                  spellCheck={false}
                />
              </div>

              <div className="rounded bg-surface-700/50 p-3">
                <div className="mb-2 text-sm font-medium text-surface-300">Prompt Configuration</div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-surface-500">Context Selector:</span>
                    <pre className="mt-1 rounded bg-surface-900 p-2">
                      {JSON.stringify(prompt.contextSelector || ['*'], null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-surface-500">Output Format:</span>
                    <span className="ml-2 rounded bg-surface-600 px-2 py-0.5 text-surface-200">
                      {prompt.outputFormat || 'json'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'context' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Context Built from Selector
                </label>
                <pre className="max-h-80 overflow-auto rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-200">
                  {contextResult || '(Run test to see results)'}
                </pre>
              </div>

              {prompt.inputSchema && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Expected Input Schema
                  </label>
                  <pre className="max-h-40 overflow-auto rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-400">
                    {JSON.stringify(prompt.inputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rendered' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  Rendered User Prompt
                </label>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-200">
                  {renderedPrompt || '(Run test to see results)'}
                </pre>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-surface-300">
                  System Prompt Preview (first 500 chars)
                </label>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-400">
                  {prompt.systemPrompt.slice(0, 500)}
                  {prompt.systemPrompt.length > 500 ? '...' : ''}
                </pre>
              </div>

              {prompt.outputSchema && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-surface-300">
                    Expected Output Schema
                  </label>
                  <pre className="max-h-40 overflow-auto rounded border border-surface-600 bg-surface-900 p-3 font-mono text-xs text-surface-400">
                    {JSON.stringify(prompt.outputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-surface-700 p-4">
          <button
            onClick={onClose}
            className="rounded bg-surface-700 px-4 py-2 text-sm text-surface-200 hover:bg-surface-600"
          >
            Close
          </button>
          <button
            onClick={runTest}
            className="rounded bg-accent-600 px-4 py-2 text-sm text-white hover:bg-accent-500"
          >
            Run Test
          </button>
        </div>
      </div>
    </div>
  )
}
