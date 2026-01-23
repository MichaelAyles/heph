/**
 * FooterActions - Download source and upload binary controls
 */

import { useRef } from 'react'
import { Code, FileArchive, Upload } from 'lucide-react'

interface FooterActionsProps {
  onDownloadSource: () => void
  onUploadBinary: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function FooterActions({ onDownloadSource, onUploadBinary }: FooterActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex-none px-6 py-4 border-t border-surface-700 bg-surface-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-steel-dim">
          <span className="flex items-center gap-1.5">
            <Code className="w-4 h-4" />
            ESP32-C6 • Arduino Framework
          </span>
          <span className="text-surface-600">|</span>
          <span>Compile with PlatformIO</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onDownloadSource}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
          >
            <FileArchive className="w-4 h-4" />
            Download Source (.zip)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin,.hex,.elf"
            onChange={onUploadBinary}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-copper hover:bg-copper-light rounded transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Binary (.bin)
          </button>
        </div>
      </div>
    </div>
  )
}
