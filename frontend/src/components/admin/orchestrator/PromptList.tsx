/**
 * PromptList Component
 *
 * Sidebar listing all orchestrator prompts grouped by category.
 */

import { clsx } from 'clsx'
import { Bot, Wand2, Search, ChevronRight, type LucideIcon } from 'lucide-react'
import type { OrchestratorPrompt } from '@/db/schema'

interface PromptListProps {
  prompts: OrchestratorPrompt[]
  selectedNode: string | null
  onSelect: (nodeName: string) => void
}

const CATEGORY_INFO: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  agent: { icon: Bot, label: 'Agents', color: 'text-blue-400' },
  generator: { icon: Wand2, label: 'Generators', color: 'text-green-400' },
  reviewer: { icon: Search, label: 'Reviewers', color: 'text-orange-400' },
}

const STAGE_COLORS: Record<string, string> = {
  spec: 'bg-blue-500/20 text-blue-400',
  pcb: 'bg-green-500/20 text-green-400',
  enclosure: 'bg-purple-500/20 text-purple-400',
  firmware: 'bg-orange-500/20 text-orange-400',
}

export function PromptList({ prompts, selectedNode, onSelect }: PromptListProps) {
  // Group prompts by category
  const grouped = prompts.reduce(
    (acc, prompt) => {
      const category = prompt.category || 'agent'
      if (!acc[category]) acc[category] = []
      acc[category].push(prompt)
      return acc
    },
    {} as Record<string, OrchestratorPrompt[]>
  )

  const categories = ['agent', 'generator', 'reviewer']

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-surface-700">
        <h2 className="text-sm font-semibold text-steel uppercase tracking-wide">Prompts</h2>
        <p className="text-xs text-steel-dim mt-1">{prompts.length} nodes</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categories.map((category) => {
          const categoryPrompts = grouped[category] || []
          if (categoryPrompts.length === 0) return null

          const { icon: Icon, label, color } = CATEGORY_INFO[category]

          return (
            <div key={category} className="border-b border-surface-700">
              <div className={clsx('px-4 py-2 flex items-center gap-2', color)}>
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              </div>

              <div className="py-1">
                {categoryPrompts.map((prompt) => (
                  <button
                    key={prompt.nodeName}
                    onClick={() => onSelect(prompt.nodeName)}
                    className={clsx(
                      'w-full px-4 py-2 flex items-center gap-2 text-left transition-colors',
                      selectedNode === prompt.nodeName
                        ? 'bg-copper/20 text-copper'
                        : 'text-steel hover:bg-surface-700 hover:text-steel'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{prompt.displayName}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {prompt.stage && (
                          <span
                            className={clsx(
                              'text-[10px] px-1.5 py-0.5 font-mono uppercase',
                              STAGE_COLORS[prompt.stage]
                            )}
                          >
                            {prompt.stage}
                          </span>
                        )}
                        {prompt.tokenEstimate && (
                          <span className="text-[10px] text-steel-dim font-mono">
                            ~{prompt.tokenEstimate} tok
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedNode === prompt.nodeName && (
                      <ChevronRight className="w-4 h-4 text-copper" strokeWidth={1.5} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
