import { useState } from 'react'
import { Check, Zap, Shield, Pencil } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore, type ControlMode } from '@/stores/auth'

export function SettingsPage() {
  const { user, updateControlMode } = useAuthStore()
  const [modeUpdating, setModeUpdating] = useState(false)

  const handleModeChange = async (mode: ControlMode) => {
    setModeUpdating(true)
    await updateControlMode(mode)
    setModeUpdating(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Header */}
      <header className="h-14 flex items-center px-8 border-b border-surface-700 flex-shrink-0">
        <h1 className="text-base font-semibold text-steel tracking-tight">SETTINGS</h1>
      </header>

      {/* Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-2xl space-y-8">
          {/* Control Mode */}
          <section>
            <h2 className="text-sm font-mono text-steel-dim mb-2 flex items-center gap-2 tracking-wide">
              <Zap className="w-4 h-4 text-copper" strokeWidth={1.5} />
              CONTROL MODE
            </h2>
            <p className="text-sm text-steel-dim mb-4">
              Choose how much control you want over the design process.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <ControlModeCard
                icon={Zap}
                name="Vibe It"
                description="Full automation. AI makes decisions and proceeds automatically."
                selected={user?.controlMode === 'vibe_it'}
                onClick={() => handleModeChange('vibe_it')}
                disabled={modeUpdating}
              />
              <ControlModeCard
                icon={Shield}
                name="Fix It"
                description="Balanced. AI proceeds but pauses on errors or low confidence."
                selected={user?.controlMode === 'fix_it'}
                onClick={() => handleModeChange('fix_it')}
                disabled={modeUpdating}
              />
              <ControlModeCard
                icon={Pencil}
                name="Design It"
                description="Full control. Approve every decision before AI proceeds."
                selected={user?.controlMode === 'design_it'}
                onClick={() => handleModeChange('design_it')}
                disabled={modeUpdating}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ControlModeCard({
  icon: Icon,
  name,
  description,
  selected,
  onClick,
  disabled,
}: {
  icon: typeof Zap
  name: string
  description: string
  selected: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'p-4 border text-left transition-all',
        selected
          ? 'bg-copper/10 border-copper'
          : 'bg-surface-800 border-surface-600 hover:border-surface-500',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={clsx('w-5 h-5', selected ? 'text-copper' : 'text-steel-dim')}
          strokeWidth={1.5}
        />
        <span className="font-semibold text-steel">{name}</span>
      </div>
      <p className="text-xs text-steel-dim">{description}</p>
      {selected && (
        <div className="mt-3 flex items-center gap-1 text-xs text-copper">
          <Check className="w-3 h-3" strokeWidth={2} />
          Active
        </div>
      )}
    </button>
  )
}
