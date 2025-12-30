import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Cpu, Check, Loader2, AlertCircle, Play, Image, BarChart3 } from 'lucide-react'
import { clsx } from 'clsx'
import { llm } from '@/services/llm'

type LLMProvider = 'openrouter' | 'gemini'

interface Settings {
  llmProvider: LLMProvider
  textModel: string
  imageModel: string | null
  hasOpenRouterKey: boolean
  hasGeminiKey: boolean
}

interface UsageStats {
  model: string
  requestCount: number
  totalTokens: number
  totalCost: number
}

interface UsageData {
  user: {
    byModel: UsageStats[]
    totals: { requestCount: number; totalTokens: number; totalCost: number }
  }
  all: {
    byModel: UsageStats[]
    totals: { requestCount: number; totalTokens: number; totalCost: number }
  }
}

async function fetchSettings(): Promise<{ settings: Settings }> {
  const response = await fetch('/api/settings')
  if (!response.ok) throw new Error('Failed to fetch settings')
  return response.json()
}

async function fetchUsage(): Promise<UsageData> {
  const response = await fetch('/api/settings/usage')
  if (!response.ok) throw new Error('Failed to fetch usage')
  return response.json()
}

async function updateSettings(data: {
  llmProvider?: LLMProvider
}): Promise<{ settings: Settings }> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to save settings')
  return response.json()
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function SettingsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const { data: usageData } = useQuery({
    queryKey: ['usage'],
    queryFn: fetchUsage,
  })

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const [provider, setProvider] = useState<LLMProvider>('openrouter')
  const [saved, setSaved] = useState(false)

  // Test state
  const [textTestLoading, setTextTestLoading] = useState(false)
  const [textTestResult, setTextTestResult] = useState<string | null>(null)
  const [textTestError, setTextTestError] = useState<string | null>(null)

  const [imageTestLoading, setImageTestLoading] = useState(false)
  const [imageTestResult, setImageTestResult] = useState<string | null>(null)
  const [imageTestError, setImageTestError] = useState<string | null>(null)

  // Sync state when data loads
  useEffect(() => {
    if (data?.settings) {
      setProvider(data.settings.llmProvider)
    }
  }, [data])

  const handleSave = () => {
    mutation.mutate({ llmProvider: provider })
  }

  const handleTestText = async () => {
    setTextTestLoading(true)
    setTextTestResult(null)
    setTextTestError(null)

    try {
      const response = await llm.chat({
        messages: [
          { role: 'user', content: 'Say exactly "Hello World" and nothing else.' },
        ],
        temperature: 0,
      })
      setTextTestResult(response.content)
      // Refresh usage stats after test
      queryClient.invalidateQueries({ queryKey: ['usage'] })
    } catch (err) {
      setTextTestError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTextTestLoading(false)
    }
  }

  const handleTestImage = async () => {
    setImageTestLoading(true)
    setImageTestResult(null)
    setImageTestError(null)

    try {
      const response = await fetch('/api/llm/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'A cute corgi dog, photorealistic, studio lighting',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const details = error.details ? `\n\nDetails: ${error.details}` : ''
        const model = error.model ? `\nModel: ${error.model}` : ''
        throw new Error(`${error.error || 'Image generation failed'}${model}${details}`)
      }

      const result = await response.json()
      if (result.imageUrl) {
        setImageTestResult(result.imageUrl)
        // Refresh usage stats after test
        queryClient.invalidateQueries({ queryKey: ['usage'] })
      } else if (result.rawResponse) {
        setImageTestError(`Model: ${result.model}\nResponse: ${result.rawResponse}`)
      } else if (result.error) {
        setImageTestError(`${result.error}\nModel: ${result.model || 'unknown'}`)
      } else {
        setImageTestError('No image returned from model')
      }
    } catch (err) {
      setImageTestError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setImageTestLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-red-400">Failed to load settings</p>
        </div>
      </div>
    )
  }

  const settings = data?.settings

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">SETTINGS</h1>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 font-medium transition-all',
            saved
              ? 'bg-emerald-500/20 text-emerald-400'
              : mutation.isPending
                ? 'bg-surface-700 text-steel-dim cursor-wait'
                : 'bg-copper-gradient text-ash'
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" strokeWidth={1.5} />
              Saved
            </>
          ) : mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" strokeWidth={1.5} />
              Save
            </>
          )}
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-2xl space-y-8">
          {/* Server Configuration Status */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">
              SERVER CONFIGURATION
            </h3>
            <p className="text-sm text-steel mb-4">
              API keys are configured via <code className="text-copper">.dev.vars</code> (local) or{' '}
              <code className="text-copper">wrangler secret</code> (production).
            </p>
            <div className="flex gap-4 text-xs font-mono">
              <span className={settings?.hasOpenRouterKey ? 'text-emerald-400' : 'text-steel-dim'}>
                {settings?.hasOpenRouterKey ? '✓' : '○'} OpenRouter key
              </span>
              <span className={settings?.hasGeminiKey ? 'text-emerald-400' : 'text-steel-dim'}>
                {settings?.hasGeminiKey ? '✓' : '○'} Gemini key
              </span>
            </div>
          </section>

          {/* Default Models */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
              <Cpu className="w-4 h-4 text-copper" strokeWidth={1.5} />
              DEFAULT MODELS
            </h3>
            <p className="text-sm text-steel-dim mb-4">
              Models are configured via environment variables.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 px-3 bg-surface-900 border border-surface-600">
                <span className="text-sm text-steel-dim">Text Model</span>
                <code className="text-sm text-copper font-mono">
                  {settings?.textModel || 'Not configured'}
                </code>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-surface-900 border border-surface-600">
                <span className="text-sm text-steel-dim">Image Model</span>
                <code className="text-sm text-copper font-mono">
                  {settings?.imageModel || 'Not configured'}
                </code>
              </div>
            </div>
          </section>

          {/* Usage Statistics */}
          {usageData && (
            <section className="p-4 bg-surface-800 border border-surface-700">
              <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-copper" strokeWidth={1.5} />
                USAGE STATISTICS
              </h3>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-surface-900 border border-surface-600">
                  <div className="text-xs text-steel-dim mb-1">Your Usage</div>
                  <div className="text-lg font-mono text-copper">
                    {formatCost(usageData.user.totals.totalCost)}
                  </div>
                  <div className="text-xs text-steel-dim mt-1">
                    {formatNumber(usageData.user.totals.requestCount)} requests ·{' '}
                    {formatNumber(usageData.user.totals.totalTokens)} tokens
                  </div>
                </div>
                <div className="p-3 bg-surface-900 border border-surface-600">
                  <div className="text-xs text-steel-dim mb-1">All Users (All Time)</div>
                  <div className="text-lg font-mono text-copper">
                    {formatCost(usageData.all.totals.totalCost)}
                  </div>
                  <div className="text-xs text-steel-dim mt-1">
                    {formatNumber(usageData.all.totals.requestCount)} requests ·{' '}
                    {formatNumber(usageData.all.totals.totalTokens)} tokens
                  </div>
                </div>
              </div>

              {/* Per-Model Breakdown */}
              {usageData.all.byModel.length > 0 && (
                <div>
                  <div className="text-xs text-steel-dim mb-2">By Model</div>
                  <div className="space-y-2">
                    {usageData.all.byModel.map((model) => {
                      const userModel = usageData.user.byModel.find((m) => m.model === model.model)
                      return (
                        <div
                          key={model.model}
                          className="flex items-center justify-between py-2 px-3 bg-surface-900 border border-surface-600 text-sm"
                        >
                          <code className="text-steel font-mono text-xs truncate flex-1 mr-4">
                            {model.model}
                          </code>
                          <div className="flex gap-6 text-xs font-mono shrink-0">
                            <div className="text-right">
                              <span className="text-steel-dim">You: </span>
                              <span className="text-steel">
                                {formatCost(userModel?.totalCost || 0)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-steel-dim">All: </span>
                              <span className="text-copper">{formatCost(model.totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Model Tests */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
              <Play className="w-4 h-4 text-copper" strokeWidth={1.5} />
              MODEL TESTS
            </h3>

            <div className="space-y-4">
              {/* Text Model Test */}
              <div className="flex items-start gap-4">
                <button
                  onClick={handleTestText}
                  disabled={textTestLoading}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all',
                    textTestLoading
                      ? 'bg-surface-700 text-steel-dim cursor-wait'
                      : 'bg-surface-700 text-steel hover:bg-surface-600'
                  )}
                >
                  {textTestLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Play className="w-4 h-4" strokeWidth={1.5} />
                  )}
                  Test Text Model
                </button>
                <div className="flex-1">
                  {textTestResult && (
                    <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-mono">
                      {textTestResult}
                    </div>
                  )}
                  {textTestError && (
                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                      {textTestError}
                    </div>
                  )}
                </div>
              </div>

              {/* Image Model Test */}
              <div className="flex items-start gap-4">
                <button
                  onClick={handleTestImage}
                  disabled={imageTestLoading}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all',
                    imageTestLoading
                      ? 'bg-surface-700 text-steel-dim cursor-wait'
                      : 'bg-surface-700 text-steel hover:bg-surface-600'
                  )}
                >
                  {imageTestLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Image className="w-4 h-4" strokeWidth={1.5} />
                  )}
                  Test Image Gen
                </button>
                <div className="flex-1">
                  {imageTestResult && (
                    <div className="p-2 bg-surface-900 border border-surface-600">
                      <img
                        src={imageTestResult}
                        alt="Generated corgi"
                        className="max-w-xs max-h-48 object-contain"
                      />
                    </div>
                  )}
                  {imageTestError && (
                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm whitespace-pre-wrap">
                      {imageTestError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* LLM Provider */}
          <section>
            <h2 className="text-sm font-mono text-steel-dim mb-4 flex items-center gap-2 tracking-wide">
              <Cpu className="w-4 h-4 text-copper" strokeWidth={1.5} />
              LLM PROVIDER
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <ProviderCard
                name="OpenRouter"
                description="300+ models including Gemini, Claude, GPT-4"
                selected={provider === 'openrouter'}
                onClick={() => setProvider('openrouter')}
              />
              <ProviderCard
                name="Gemini API"
                description="Direct access to Google Gemini models"
                selected={provider === 'gemini'}
                onClick={() => setProvider('gemini')}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ProviderCard({
  name,
  description,
  selected,
  onClick,
}: {
  name: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'p-4 border text-left transition-all',
        selected
          ? 'bg-copper/10 border-copper'
          : 'bg-surface-800 border-surface-600 hover:border-surface-500'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-steel">{name}</span>
        <div
          className={clsx(
            'w-4 h-4 border-2 flex items-center justify-center',
            selected ? 'border-copper bg-copper' : 'border-surface-500'
          )}
        >
          {selected && <Check className="w-2.5 h-2.5 text-ash" strokeWidth={2} />}
        </div>
      </div>
      <p className="text-sm text-steel-dim">{description}</p>
    </button>
  )
}
