import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Cpu, Battery, Radio, Lightbulb, Cable, Wrench, Plus, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory, PcbBlock } from '@/db/schema'

const CATEGORY_ICONS: Record<
  BlockCategory | 'all',
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  all: Cpu,
  mcu: Cpu,
  power: Battery,
  sensor: Radio,
  output: Lightbulb,
  connector: Cable,
  utility: Wrench,
}

interface BlockSelectorProps {
  /** Currently selected blocks with their positions */
  selectedBlocks: Array<{ blockId: string; gridX: number; gridY: number }>
  /** Callback when a block is selected to add */
  onSelectBlock: (block: PcbBlock) => void
  /** Callback when block is removed */
  onRemoveBlock?: (blockId: string) => void
  /** Maximum blocks that can be selected */
  maxBlocks?: number
  /** Whether selection is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
}

async function fetchBlocks(category: BlockCategory | 'all'): Promise<{ blocks: PcbBlock[] }> {
  const params = new URLSearchParams()
  if (category !== 'all') params.set('category', category)
  params.set('limit', '100')

  const response = await fetch(`/api/blocks?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch blocks')
  return response.json()
}

export function BlockSelector({
  selectedBlocks,
  onSelectBlock,
  maxBlocks = 20,
  disabled,
  className,
}: BlockSelectorProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<BlockCategory | 'all'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['blocks', category],
    queryFn: () => fetchBlocks(category),
    staleTime: 60000,
  })

  const blocks = data?.blocks ?? []
  const filteredBlocks = blocks.filter(
    (block) =>
      block.name.toLowerCase().includes(search.toLowerCase()) ||
      block.description.toLowerCase().includes(search.toLowerCase())
  )

  const selectedIds = new Set(selectedBlocks.map((b) => b.blockId))
  const canAddMore = selectedBlocks.length < maxBlocks

  return (
    <div className={clsx('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-3 border-b border-surface-700">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-dim"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="w-full pl-9 pr-3 py-2 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim text-sm focus:outline-none focus:border-copper font-mono"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 p-2 border-b border-surface-700 overflow-x-auto">
        {(Object.keys(CATEGORY_ICONS) as Array<BlockCategory | 'all'>).map((cat) => {
          const Icon = CATEGORY_ICONS[cat]
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap',
                category === cat
                  ? 'bg-copper/20 text-copper'
                  : 'text-steel-dim hover:text-steel hover:bg-surface-800'
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="capitalize">{cat}</span>
            </button>
          )
        })}
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-copper animate-spin" strokeWidth={1.5} />
          </div>
        ) : filteredBlocks.length === 0 ? (
          <div className="text-center text-steel-dim py-8 text-sm">No blocks found</div>
        ) : (
          <div className="space-y-1">
            {filteredBlocks.map((block) => {
              const isSelected = selectedIds.has(block.id)
              const CategoryIcon = CATEGORY_ICONS[block.category]

              return (
                <button
                  key={block.id}
                  onClick={() => !isSelected && canAddMore && !disabled && onSelectBlock(block)}
                  disabled={disabled || isSelected || !canAddMore}
                  className={clsx(
                    'w-full flex items-start gap-3 p-2 text-left rounded transition-colors',
                    isSelected
                      ? 'bg-copper/10 border border-copper/30'
                      : canAddMore && !disabled
                        ? 'hover:bg-surface-800 border border-transparent'
                        : 'opacity-50 cursor-not-allowed border border-transparent'
                  )}
                >
                  <div
                    className={clsx(
                      'w-8 h-8 flex items-center justify-center rounded border',
                      isSelected
                        ? 'bg-copper/20 border-copper/40'
                        : 'bg-surface-800 border-surface-600'
                    )}
                  >
                    <CategoryIcon
                      className={clsx('w-4 h-4', isSelected ? 'text-copper' : 'text-steel-dim')}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          'text-sm font-medium truncate',
                          isSelected ? 'text-copper' : 'text-steel'
                        )}
                      >
                        {block.name}
                      </span>
                      <span className="text-xs text-steel-dim font-mono">
                        {block.widthUnits}x{block.heightUnits}
                      </span>
                    </div>
                    <p className="text-xs text-steel-dim line-clamp-2 mt-0.5">
                      {block.description}
                    </p>
                  </div>
                  {!isSelected && canAddMore && !disabled && (
                    <Plus className="w-4 h-4 text-steel-dim mt-1" strokeWidth={1.5} />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="p-2 border-t border-surface-700 text-xs text-steel-dim">
        {selectedBlocks.length}/{maxBlocks} blocks selected
      </div>
    </div>
  )
}

export default BlockSelector
