import { useState } from 'react'
import { Save, Key, Cpu, Check } from 'lucide-react'
import { clsx } from 'clsx'

type LLMProvider = 'openrouter' | 'gemini'

export function SettingsPage() {
  const [provider, setProvider] = useState<LLMProvider>('openrouter')
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    // TODO: Save to database
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">SETTINGS</h1>
        <button
          onClick={handleSave}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 font-medium transition-all',
            saved
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-copper-gradient text-ash'
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" strokeWidth={1.5} />
              Saved
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
                description="Direct access to Google Gemini 3.0 Flash"
                selected={provider === 'gemini'}
                onClick={() => setProvider('gemini')}
              />
            </div>
          </section>

          {/* API Keys */}
          <section>
            <h2 className="text-sm font-mono text-steel-dim mb-4 flex items-center gap-2 tracking-wide">
              <Key className="w-4 h-4 text-copper" strokeWidth={1.5} />
              API KEYS
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-steel-dim mb-2">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full px-4 py-2.5 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim focus:outline-none focus:border-copper font-mono text-sm"
                />
                <p className="mt-2 text-xs text-steel-dim">
                  Get your key at{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-copper hover:text-copper-light"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-steel-dim mb-2">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-4 py-2.5 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim focus:outline-none focus:border-copper font-mono text-sm"
                />
                <p className="mt-2 text-xs text-steel-dim">
                  Get your key at{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-copper hover:text-copper-light"
                  >
                    aistudio.google.com/apikey
                  </a>
                </p>
              </div>
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
