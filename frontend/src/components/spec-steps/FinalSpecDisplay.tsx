/**
 * FinalSpecDisplay - Displays the complete locked specification
 */

import { CheckCircle2, ChevronRight } from 'lucide-react'
import { isValidBlueprintUrl } from './types'
import type { FinalSpec } from '../../db/schema'

interface FinalSpecDisplayProps {
  finalSpec: FinalSpec
  blueprintUrl?: string
  onContinue: () => void
}

export function FinalSpecDisplay({ finalSpec, blueprintUrl, onContinue }: FinalSpecDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface-900 border border-surface-700 p-6">
        <div className="flex items-center gap-2 text-emerald-400 mb-4">
          <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-semibold">Specification Complete</span>
        </div>

        <h2 className="text-2xl font-bold text-steel mb-2">{finalSpec.name}</h2>
        <p className="text-steel-dim">{finalSpec.summary}</p>
      </div>

      {/* Blueprint preview - only show if URL is valid (not a placeholder) */}
      {isValidBlueprintUrl(blueprintUrl) && (
        <div className="bg-surface-900 border border-surface-700 p-6">
          <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">SELECTED DESIGN</h3>
          <div className="rounded-lg overflow-hidden border border-surface-600">
            <img src={blueprintUrl} alt="Selected blueprint" className="w-full h-auto" />
          </div>
        </div>
      )}

      {/* Spec details grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Inputs */}
        {finalSpec.inputs && finalSpec.inputs.length > 0 && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">INPUTS</h3>
            <ul className="space-y-2">
              {finalSpec.inputs.map((input, i) => (
                <li key={i} className="flex items-center gap-2 text-steel text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-copper" />
                  <span>{input.type}</span>
                  {input.count > 1 && <span className="text-steel-dim">×{input.count}</span>}
                  {input.notes && <span className="text-steel-dim text-xs">({input.notes})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Outputs */}
        {finalSpec.outputs && finalSpec.outputs.length > 0 && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">OUTPUTS</h3>
            <ul className="space-y-2">
              {finalSpec.outputs.map((output, i) => (
                <li key={i} className="flex items-center gap-2 text-steel text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{output.type}</span>
                  {output.count > 1 && <span className="text-steel-dim">×{output.count}</span>}
                  {output.notes && <span className="text-steel-dim text-xs">({output.notes})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Power */}
        {finalSpec.power && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">POWER</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-steel-dim">Source</span>
                <span className="text-steel">{finalSpec.power.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-dim">Voltage</span>
                <span className="text-steel">{finalSpec.power.voltage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-dim">Current</span>
                <span className="text-steel">{finalSpec.power.current}</span>
              </div>
            </div>
          </div>
        )}

        {/* Communication */}
        {finalSpec.communication && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">COMMUNICATION</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-steel-dim">Type</span>
                <span className="text-steel">{finalSpec.communication.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-dim">Protocol</span>
                <span className="text-steel">{finalSpec.communication.protocol}</span>
              </div>
            </div>
          </div>
        )}

        {/* PCB Size */}
        {finalSpec.pcbSize && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">PCB SIZE</h3>
            <div className="text-sm text-steel">
              {finalSpec.pcbSize.width} × {finalSpec.pcbSize.height} {finalSpec.pcbSize.unit}
            </div>
          </div>
        )}

        {/* Enclosure */}
        {finalSpec.enclosure && (
          <div className="bg-surface-900 border border-surface-700 p-4">
            <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">ENCLOSURE</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-steel-dim">Style</span>
                <span className="text-steel">{finalSpec.enclosure.style}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-dim">Dimensions</span>
                <span className="text-steel">
                  {finalSpec.enclosure.width} × {finalSpec.enclosure.height} ×{' '}
                  {finalSpec.enclosure.depth} mm
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOM */}
      {finalSpec.estimatedBOM && finalSpec.estimatedBOM.length > 0 && (
        <div className="bg-surface-900 border border-surface-700 p-4">
          <h3 className="text-sm font-mono text-steel-dim mb-3 tracking-wide">
            ESTIMATED BILL OF MATERIALS
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-dim text-left border-b border-surface-700">
                  <th className="pb-2 font-medium">Component</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {finalSpec.estimatedBOM.map((bomItem, i) => (
                  <tr key={i} className="border-b border-surface-800 last:border-0">
                    <td className="py-2 text-steel">{bomItem.item}</td>
                    <td className="py-2 text-steel-dim">{bomItem.quantity}</td>
                    <td className="py-2 text-steel-dim">${bomItem.unitCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-end">
        <button
          onClick={onContinue}
          className="px-6 py-2.5 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          Continue to PCB Design
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
