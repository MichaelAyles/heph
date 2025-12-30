import { useState } from 'react'
import { Search, Cpu, Battery, Radio, Lightbulb, Cable, Wrench } from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory } from '@/db/schema'

// Static block data for now - will come from DB
const BLOCKS = [
  {
    id: 'mcu-esp32c6',
    slug: 'mcu-esp32c6',
    name: 'ESP32-C6 MCU',
    category: 'mcu' as BlockCategory,
    description: 'WiFi 6, BLE 5.3, Zigbee/Thread. System controller.',
    widthUnits: 2,
    heightUnits: 2,
  },
  {
    id: 'power-lipo',
    slug: 'power-lipo',
    name: 'LiPo Battery',
    category: 'power' as BlockCategory,
    description: 'Single-cell LiPo with TP4056 charger. USB-C input.',
    widthUnits: 1,
    heightUnits: 2,
  },
  {
    id: 'sensor-bme280',
    slug: 'sensor-bme280',
    name: 'BME280 Environment',
    category: 'sensor' as BlockCategory,
    description: 'Temperature, humidity, pressure. I2C interface.',
    widthUnits: 1,
    heightUnits: 1,
  },
  {
    id: 'sensor-sht40',
    slug: 'sensor-sht40',
    name: 'SHT40 Temp/Humidity',
    category: 'sensor' as BlockCategory,
    description: 'High-accuracy temperature and humidity. I2C.',
    widthUnits: 1,
    heightUnits: 1,
  },
  {
    id: 'sensor-pir',
    slug: 'sensor-pir',
    name: 'PIR Motion',
    category: 'sensor' as BlockCategory,
    description: 'Passive infrared motion detector. GPIO output.',
    widthUnits: 1,
    heightUnits: 1,
  },
  {
    id: 'output-led-ws2812',
    slug: 'output-led-ws2812',
    name: 'WS2812B LED',
    category: 'output' as BlockCategory,
    description: 'Addressable RGB LED connector. Single data line.',
    widthUnits: 1,
    heightUnits: 1,
  },
  {
    id: 'output-buzzer',
    slug: 'output-buzzer',
    name: 'Piezo Buzzer',
    category: 'output' as BlockCategory,
    description: 'Piezo with driver transistor. PWM input.',
    widthUnits: 1,
    heightUnits: 1,
  },
  {
    id: 'conn-oled',
    slug: 'conn-oled',
    name: 'OLED Connector',
    category: 'connector' as BlockCategory,
    description: '4-pin JST-SH for I2C OLED display module.',
    widthUnits: 1,
    heightUnits: 1,
  },
]

const CATEGORIES: { id: BlockCategory | 'all'; name: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'all', name: 'All', icon: Cpu },
  { id: 'mcu', name: 'MCU', icon: Cpu },
  { id: 'power', name: 'Power', icon: Battery },
  { id: 'sensor', name: 'Sensor', icon: Radio },
  { id: 'output', name: 'Output', icon: Lightbulb },
  { id: 'connector', name: 'Connector', icon: Cable },
  { id: 'utility', name: 'Utility', icon: Wrench },
]

export function BlocksPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<BlockCategory | 'all'>('all')

  const filteredBlocks = BLOCKS.filter((block) => {
    const matchesSearch =
      block.name.toLowerCase().includes(search.toLowerCase()) ||
      block.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'all' || block.category === category
    return matchesSearch && matchesCategory
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">BLOCK LIBRARY</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-dim" strokeWidth={1.5} />
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
          <div className="grid grid-cols-3 gap-4">
            {filteredBlocks.map((block) => (
              <BlockCard key={block.id} block={block} />
            ))}
          </div>
          {filteredBlocks.length === 0 && (
            <div className="text-center text-steel-dim py-12 font-mono text-sm">
              No blocks found.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function BlockCard({ block }: { block: (typeof BLOCKS)[0] }) {
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
