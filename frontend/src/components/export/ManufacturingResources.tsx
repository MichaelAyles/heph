/**
 * ManufacturingResources - External links to PCB manufacturers
 */

import { Cpu, ExternalLink } from 'lucide-react'

const RESOURCES = [
  {
    name: 'JLCPCB',
    description: 'PCB manufacturing',
    url: 'https://jlcpcb.com',
  },
  {
    name: 'PCBWay',
    description: 'PCB manufacturing',
    url: 'https://www.pcbway.com',
  },
]

export function ManufacturingResources() {
  return (
    <div>
      <h3 className="text-sm font-medium text-steel mb-3">Manufacturing Resources</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {RESOURCES.map((resource) => (
          <a
            key={resource.name}
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 bg-surface-900 border border-surface-700 rounded-lg hover:border-surface-600 transition-colors"
          >
            <Cpu className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
            <div className="flex-1">
              <span className="text-sm text-steel">{resource.name}</span>
              <p className="text-xs text-steel-dim">{resource.description}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-surface-500" strokeWidth={1.5} />
          </a>
        ))}
      </div>
    </div>
  )
}
