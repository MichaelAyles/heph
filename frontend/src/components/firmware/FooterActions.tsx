/**
 * FooterActions - Download source, compile, and upload binary controls
 */

import { useRef } from 'react'
import { Code, FileArchive, Upload, Cpu, Loader2 } from 'lucide-react'

interface FooterActionsProps {
  onDownloadSource: () => void
  onUploadBinary: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCompile: () => void
  isCompiling: boolean
  selectedBoard: string
  onBoardChange: (board: string) => void
}

const SUPPORTED_BOARDS = [
  { id: 'esp32-c6-devkitc-1', name: 'ESP32-C6 DevKit' },
  { id: 'seeed_xiao_esp32c6', name: 'Seeed XIAO ESP32-C6' },
  { id: 'esp32dev', name: 'ESP32 Dev Module' },
  { id: 'esp32-s3-devkitc-1', name: 'ESP32-S3 DevKit' },
]

export function FooterActions({
  onDownloadSource,
  onUploadBinary,
  onCompile,
  isCompiling,
  selectedBoard,
  onBoardChange,
}: FooterActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex-none px-6 py-4 border-t border-surface-700 bg-surface-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-steel-dim">
          <span className="flex items-center gap-1.5">
            <Code className="w-4 h-4" />
            Arduino Framework
          </span>
          <span className="text-surface-600">|</span>
          <select
            value={selectedBoard}
            onChange={(e) => onBoardChange(e.target.value)}
            className="px-2 py-1 text-sm bg-surface-800 border border-surface-600 rounded text-steel focus:outline-none focus:border-copper"
          >
            {SUPPORTED_BOARDS.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onDownloadSource}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
          >
            <FileArchive className="w-4 h-4" />
            Download Source
          </button>
          <button
            onClick={onCompile}
            disabled={isCompiling}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-copper hover:bg-copper-light disabled:opacity-50 rounded transition-colors"
          >
            {isCompiling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4" />
                Compile Firmware
              </>
            )}
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Binary
          </button>
        </div>
      </div>
    </div>
  )
}
