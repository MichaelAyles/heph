/**
 * ExportItemCard - Individual export item with download button
 */

import { clsx } from 'clsx'
import { Download, Loader2, Check } from 'lucide-react'
import type { ExportItem } from './types'

interface ExportItemCardProps {
  item: ExportItem
  isDownloading: boolean
  isDownloaded: boolean
  onDownload: () => void
}

export function ExportItemCard({
  item,
  isDownloading,
  isDownloaded,
  onDownload,
}: ExportItemCardProps) {
  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
          <item.icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-steel mb-0.5">{item.title}</h3>
          <p className="text-xs text-steel-dim mb-3">{item.description}</p>
          {item.ready ? (
            <button
              onClick={onDownload}
              disabled={isDownloading}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                isDownloaded
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-ash bg-copper hover:bg-copper-light'
              )}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Preparing...
                </>
              ) : isDownloaded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Downloaded
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  {item.filename}
                </>
              )}
            </button>
          ) : (
            <span className="text-xs text-surface-500">Not yet available</span>
          )}
        </div>
      </div>
    </div>
  )
}
