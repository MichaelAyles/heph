import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Cpu, Battery, Radio, Lightbulb, Cable, Wrench, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory, PcbBlock } from '@/db/schema'

const CATEGORIES: {
  id: BlockCategory | 'all'
  name: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}[] = [
  { id: 'all', name: 'All', icon: Cpu },
  { id: 'mcu', name: 'MCU', icon: Cpu },
  { id: 'power', name: 'Power', icon: Battery },
  { id: 'sensor', name: 'Sensor', icon: Radio },
  { id: 'output', name: 'Output', icon: Lightbulb },
  { id: 'connector', name: 'Connector', icon: Cable },
  { id: 'utility', name: 'Utility', icon: Wrench },
]

async function fetchBlocks(
  category: BlockCategory | 'all',
  search: string
): Promise<{ blocks: PcbBlock[]; total: number }> {
  const params = new URLSearchParams()
  if (category !== 'all') params.set('category', category)
  if (search) params.set('search', search)

  const response = await fetch(`/api/blocks?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch blocks')
  }
  return response.json()
}

export function BlocksPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<BlockCategory | 'all'>('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['blocks', category, search],
    queryFn: () => fetchBlocks(category, search),
    staleTime: 60000, // Cache for 1 minute
  })

  const blocks = data?.blocks ?? []

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">BLOCK LIBRARY</h1>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-dim"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-56 pl-9 pr-4 py-2 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim text-sm focus:outline-none focus:border-copper font-mono"
          />
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Category Sidebar */}
        <aside className="w-44 border-r border-surface-700 p-4">
          <h2 className="text-xs font-mono text-steel-dim mb-3 tracking-wide">CATEGORY</h2>
          <div className="space-y-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  category === cat.id
                    ? 'bg-copper/10 text-copper border-l-2 border-copper'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-800'
                )}
              >
                <cat.icon className="w-4 h-4" strokeWidth={1.5} />
                {cat.name}
              </button>
            ))}
          </div>
        </aside>

        {/* Block Grid */}
        <main className="flex-1 p-6 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-12 font-mono text-sm">
              Failed to load blocks.
            </div>
          ) : blocks.length === 0 ? (
            <div className="text-center text-steel-dim py-12 font-mono text-sm">
              No blocks found.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {blocks.map((block) => (
                <BlockCard key={block.id} block={block} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function BlockCard({ block }: { block: PcbBlock }) {
  const CategoryIcon = CATEGORIES.find((c) => c.id === block.category)?.icon || Cpu

  return (
    <div className="p-4 bg-surface-800 border border-surface-700 hover:border-copper/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 bg-copper/10 flex items-center justify-center border border-copper/20">
          <CategoryIcon className="w-4 h-4 text-copper" strokeWidth={1.5} />
        </div>
        <span className="text-xs text-steel-dim font-mono">
          {block.widthUnits}×{block.heightUnits}
        </span>
      </div>
      <h3 className="font-semibold text-steel mb-1 text-sm">{block.name}</h3>
      <p className="text-xs text-steel-dim line-clamp-2 leading-relaxed">{block.description}</p>
    </div>
  )
}
