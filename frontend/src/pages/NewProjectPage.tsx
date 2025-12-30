import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Loader2, ArrowRight, Terminal, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { llm } from '@/services/llm'
import { REQUIREMENTS_SYSTEM_PROMPT, buildRequirementsPrompt } from '@/prompts/requirements'

const EXAMPLE_PROMPTS = [
  'Battery-powered plant moisture monitor with WiFi alerts',
  'Smart doorbell with motion detection and OLED display',
  'Temperature logger with SD card storage and USB-C charging',
  'Desk air quality monitor with CO2 and particulate sensors',
]

interface Requirement {
  id: string
  text: string
  category: string
  priority: string
  status: string
}

interface ExtractionResult {
  requirements: Requirement[]
  suggestedName: string
  summary: string
  clarifications: string[]
}

export function NewProjectPage() {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [streamingOutput, setStreamingOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || isAnalyzing) return

    setIsAnalyzing(true)
    setStreamingOutput('')
    setError(null)

    try {
      // Step 1: Create the project
      const createResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Project',
          description: description.trim(),
        }),
      })

      if (!createResponse.ok) {
        throw new Error('Failed to create project')
      }

      const { project } = await createResponse.json()

      // Step 2: Extract requirements via streaming LLM
      let fullContent = ''

      await llm.chatStream(
        {
          messages: [
            { role: 'system', content: REQUIREMENTS_SYSTEM_PROMPT },
            { role: 'user', content: buildRequirementsPrompt(description.trim()) },
          ],
          temperature: 0.3,
          projectId: project.id,
        },
        {
          onToken: (token) => {
            fullContent += token
            setStreamingOutput(fullContent)
          },
          onComplete: async () => {
            // Parse the JSON response
            try {
              const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
              if (!jsonMatch) {
                throw new Error('No valid JSON found in response')
              }

              const result = JSON.parse(jsonMatch[0]) as ExtractionResult

              // Step 3: Update project with extracted data
              await fetch(`/api/projects/${project.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: result.suggestedName || 'New Project',
                  status: 'analyzing',
                  spec: {
                    description: description.trim(),
                    requirements: result.requirements,
                    summary: result.summary,
                    clarifications: result.clarifications,
                    formFactor: null,
                    blocks: [],
                    decisions: [],
                  },
                }),
              })

              // Navigate to project page
              navigate(`/project/${project.id}`)
            } catch (parseError) {
              console.error('Parse error:', parseError)
              setError('Failed to parse requirements. Please try again.')
              setIsAnalyzing(false)
            }
          },
          onError: (err) => {
            console.error('LLM error:', err)
            setError(err.message || 'Failed to analyze requirements')
            setIsAnalyzing(false)
          },
        }
      )
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsAnalyzing(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setDescription(example)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">NEW PROJECT</h1>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          {/* Show streaming output when analyzing */}
          {isAnalyzing && streamingOutput ? (
            <div className="bg-surface-900 border border-surface-700 p-6 mb-6">
              <div className="flex items-center gap-2 text-copper mb-4">
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                <span className="text-xs font-mono tracking-wide">ANALYZING REQUIREMENTS...</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm text-steel leading-relaxed max-h-64 overflow-y-auto">
                {streamingOutput}
              </pre>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-steel mb-3 tracking-tight">
                  Specify your hardware.
                </h2>
                <p className="text-steel-dim">
                  Describe the device. Be specific about sensors, connectivity, and power
                  requirements.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-6">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="I need a device that..."
                    rows={5}
                    className={clsx(
                      'w-full px-4 py-3 bg-surface-800 border text-steel placeholder-steel-dim',
                      'resize-none focus:outline-none',
                      'border-surface-600 focus:border-copper'
                    )}
                    disabled={isAnalyzing}
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-steel-dim font-mono">
                    {description.length}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!description.trim() || isAnalyzing}
                  className={clsx(
                    'w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-all',
                    description.trim() && !isAnalyzing
                      ? 'bg-copper-gradient text-ash'
                      : 'bg-surface-700 text-steel-dim cursor-not-allowed'
                  )}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                      Forging...
                    </>
                  ) : (
                    <>
                      <Flame className="w-5 h-5" strokeWidth={1.5} />
                      Forge Design
                      <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </>
                  )}
                </button>
              </form>

              {/* Example prompts */}
              <div className="mt-8">
                <div className="flex items-center gap-2 text-sm text-steel-dim mb-3">
                  <Terminal className="w-4 h-4" strokeWidth={1.5} />
                  <span className="font-mono text-xs">EXAMPLES</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((example) => (
                    <button
                      key={example}
                      onClick={() => handleExampleClick(example)}
                      className="px-3 py-1.5 bg-surface-800 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors border border-surface-700"
                      disabled={isAnalyzing}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
