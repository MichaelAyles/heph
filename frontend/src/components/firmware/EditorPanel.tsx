/**
 * EditorPanel - Monaco editor for firmware files
 */

import { FileCode } from 'lucide-react'
import Editor from '@monaco-editor/react'
import type { FileNode } from './types'

interface EditorPanelProps {
  selectedFile: FileNode | null
  editorContent: string
  onEditorChange: (value: string | undefined) => void
}

export function EditorPanel({ selectedFile, editorContent, onEditorChange }: EditorPanelProps) {
  if (!selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-steel-dim">
        <p className="text-sm">Select a file to edit</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-none px-4 py-2 border-b border-surface-700 bg-surface-800">
        <div className="flex items-center gap-2 text-sm">
          <FileCode className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
          <span className="text-steel">{selectedFile.path}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={selectedFile.language || 'cpp'}
          value={editorContent}
          onChange={onEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'off',
          }}
        />
      </div>
    </div>
  )
}
