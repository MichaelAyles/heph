/**
 * Firmware Stage View
 *
 * AI-powered firmware generation with Monaco editor, manual download/upload workflow.
 * Compile server integration is planned for Phase 6 - currently using manual PlatformIO workflow.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import JSZip from 'jszip'
import {
  Code,
  ArrowRight,
  Upload,
  FileCode,
  FolderCode,
  Loader2,
  Check,
  X,
  Sparkles,
  FileArchive,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Send,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { OrchestratorTrigger } from '@/components/workspace/OrchestratorTrigger'
import type { ProjectSpec } from '@/db/schema'
import { llm } from '@/services/llm'
import {
  FIRMWARE_SYSTEM_PROMPT,
  buildFirmwarePrompt,
  buildFirmwareModificationPrompt,
  buildFirmwareInputFromSpec,
  type FirmwareProject,
} from '@/prompts/firmware'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  content?: string
  language?: string
}

// Default starter template when no firmware has been generated yet
const STARTER_TEMPLATE: FileNode[] = [
  {
    name: 'platformio.ini',
    path: 'platformio.ini',
    type: 'file',
    language: 'ini',
    content: `; PlatformIO Project Configuration
; PHAESTUS Generated - Customize and compile locally

[env:esp32c6]
platform = espressif32
board = esp32-c6-devkitm-1
framework = arduino
monitor_speed = 115200

; Uncomment to add libraries
; lib_deps =
;     adafruit/Adafruit BME280 Library
;     fastled/FastLED

build_flags =
    -DCORE_DEBUG_LEVEL=3
`,
  },
  {
    name: 'include',
    path: 'include',
    type: 'folder',
    children: [
      {
        name: 'config.h',
        path: 'include/config.h',
        type: 'file',
        language: 'cpp',
        content: `#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// PIN DEFINITIONS
// ============================================
#define PIN_LED         8      // Built-in LED
#define PIN_BUTTON      9      // User button (optional)

// I2C Bus
#define PIN_SDA         6
#define PIN_SCL         7

// ============================================
// CONFIGURATION
// ============================================
#define WIFI_SSID       "your_ssid"
#define WIFI_PASS       "your_password"
#define DEVICE_NAME     "phaestus-device"

// Timing
#define LOOP_INTERVAL_MS  1000

// Debug
#define DEBUG_ENABLED   1

#if DEBUG_ENABLED
  #define DEBUG_PRINT(x) Serial.print(x)
  #define DEBUG_PRINTLN(x) Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
#endif

#endif // CONFIG_H
`,
      },
    ],
  },
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      {
        name: 'main.cpp',
        path: 'src/main.cpp',
        type: 'file',
        language: 'cpp',
        content: `/**
 * PHAESTUS Generated Firmware
 * Target: ESP32-C6
 * Framework: Arduino
 */

#include <Arduino.h>
#include "config.h"

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("=================================");
    Serial.println("PHAESTUS Device Starting...");
    Serial.println("=================================");

    // Initialize LED
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);

    Serial.println("Setup complete!");
}

void loop() {
    static unsigned long lastBlink = 0;
    static bool ledState = false;

    // Blink LED every second
    if (millis() - lastBlink >= LOOP_INTERVAL_MS) {
        lastBlink = millis();
        ledState = !ledState;
        digitalWrite(PIN_LED, ledState);
        DEBUG_PRINTLN(ledState ? "LED ON" : "LED OFF");
    }
}
`,
      },
    ],
  },
]

function flattenFiles(nodes: FileNode[]): { path: string; content: string }[] {
  const result: { path: string; content: string }[] = []
  for (const node of nodes) {
    if (node.type === 'file' && node.content) {
      result.push({ path: node.path, content: node.content })
    }
    if (node.children) {
      result.push(...flattenFiles(node.children))
    }
  }
  return result
}

function buildFileTree(files: FirmwareProject['files']): FileNode[] {
  const root: FileNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (isLast) {
        current.push({
          name: part,
          path: file.path,
          type: 'file',
          content: file.content,
          language: file.language === 'h' ? 'cpp' : file.language === 'ini' ? 'ini' : 'cpp',
        })
      } else {
        let folder = current.find((n) => n.name === part && n.type === 'folder')
        if (!folder) {
          folder = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'folder',
            children: [],
          }
          current.push(folder)
        }
        current = folder.children!
      }
    }
  }

  return root
}

interface FileTreeItemProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedFolders: Set<string>
  onSelect: (node: FileNode) => void
  onToggleFolder: (path: string) => void
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  onSelect,
  onToggleFolder,
}: FileTreeItemProps) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className={clsx(
            'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-left hover:bg-surface-800 rounded transition-colors',
            'text-steel-dim hover:text-steel'
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderCode className="w-4 h-4 text-copper" strokeWidth={1.5} />
          <span>{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                onSelect={onSelect}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className={clsx(
        'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-left rounded transition-colors',
        isSelected
          ? 'bg-copper/20 text-copper'
          : 'text-steel-dim hover:text-steel hover:bg-surface-800'
      )}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <FileCode className="w-4 h-4" strokeWidth={1.5} />
      <span>{node.name}</span>
    </button>
  )
}

export function FirmwareStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()

  // File tree state
  const [fileTree, setFileTree] = useState<FileNode[]>(STARTER_TEMPLATE)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['include', 'src']))

  // Editor state
  const [editorContent, setEditorContent] = useState<string>('')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Chat state for modifications
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isModifying, setIsModifying] = useState(false)

  // Upload state
  const [uploadedBinary, setUploadedBinary] = useState<{ name: string; size: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const enclosureComplete = project?.spec?.stages?.enclosure?.status === 'complete'
  const existingFirmware = project?.spec?.firmware
  const spec = project?.spec

  // Handler for orchestrator spec updates
  const handleOrchestratorSpecUpdate = useCallback(
    async (specUpdate: Partial<ProjectSpec>) => {
      if (!project?.id) return
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: { ...spec, ...specUpdate },
        }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      }
    },
    [project?.id, spec, queryClient]
  )

  // Load saved firmware from project spec
  useEffect(() => {
    if (project?.spec?.firmware?.files && project.spec.firmware.files.length > 0) {
      const savedFiles = project.spec.firmware.files.map((f) => ({
        ...f,
        language: f.language as 'cpp' | 'h' | 'ini' | 'json',
      }))
      const tree = buildFileTree(savedFiles)
      setFileTree(tree)
    }
  }, [project?.spec?.firmware?.files])

  // Select first file when tree changes
  useEffect(() => {
    if (!selectedFile && fileTree.length > 0) {
      const firstFile = flattenFiles(fileTree).find(
        (f) => f.path.endsWith('.cpp') || f.path.endsWith('.h')
      )
      if (firstFile) {
        const node = findNode(fileTree, firstFile.path)
        if (node) {
          setSelectedFile(node)
          setEditorContent(node.content || '')
        }
      }
    }
  }, [fileTree, selectedFile])

  function findNode(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
      if (node.path === path) return node
      if (node.children) {
        const found = findNode(node.children, path)
        if (found) return found
      }
    }
    return null
  }

  const handleSelectFile = useCallback(
    (node: FileNode) => {
      // Save current file first
      if (selectedFile && editorContent !== selectedFile.content) {
        updateFileContent(selectedFile.path, editorContent)
      }
      setSelectedFile(node)
      setEditorContent(node.content || '')
    },
    [selectedFile, editorContent]
  )

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  function updateFileContent(path: string, content: string) {
    setFileTree((prev) => {
      const update = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.path === path) {
            return { ...node, content }
          }
          if (node.children) {
            return { ...node, children: update(node.children) }
          }
          return node
        })
      }
      return update(prev)
    })
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value)
    }
  }, [])

  // Save firmware to project
  const saveMutation = useMutation({
    mutationFn: async (files: FirmwareProject['files']) => {
      const spec = project?.spec || {
        description: '',
        feasibility: null,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: null,
      }

      // Convert files to match FirmwareFile schema (cpp | c | h | json)
      const firmwareFiles = files.map((f) => ({
        path: f.path,
        content: f.content,
        language: f.language === 'ini' ? 'json' : f.language, // Map ini to json for storage
      }))

      // Update firmware artifacts
      spec.firmware = {
        files: firmwareFiles as {
          path: string
          content: string
          language: 'cpp' | 'c' | 'h' | 'json'
        }[],
        buildStatus: 'pending',
      }

      // Update stage status
      spec.stages = spec.stages || {
        spec: { status: 'complete' },
        pcb: { status: 'complete' },
        enclosure: { status: 'complete' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      }
      spec.stages.firmware = {
        status: 'complete',
        completedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/projects/${project?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec }),
      })

      if (!response.ok) throw new Error('Failed to save firmware')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
    },
  })

  // Generate firmware with LLM
  const handleGenerate = async () => {
    if (!project) return

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const input = buildFirmwareInputFromSpec(
        project.name || 'PHAESTUS Project',
        project.description || '',
        project.spec?.finalSpec || undefined,
        project.spec?.pcb
      )

      const response = await llm.chat({
        messages: [
          { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
          { role: 'user', content: buildFirmwarePrompt(input) },
        ],
        temperature: 0.3,
        projectId: project.id,
      })

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response')
      }

      const result = JSON.parse(jsonMatch[0]) as FirmwareProject
      if (!result.files || result.files.length === 0) {
        throw new Error('No files generated')
      }

      const tree = buildFileTree(result.files)
      setFileTree(tree)
      setSelectedFile(null) // Reset selection

      // Save to project
      await saveMutation.mutateAsync(result.files)
    } catch (error) {
      console.error('Firmware generation failed:', error)
      setGenerationError(error instanceof Error ? error.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  // Modify firmware with chat
  const handleModify = async () => {
    if (!project || !chatInput.trim()) return

    setIsModifying(true)
    setGenerationError(null)

    try {
      const currentFiles: FirmwareProject['files'] = flattenFiles(fileTree).map((f) => ({
        path: f.path,
        content: f.content,
        language: (f.path.endsWith('.h') ? 'h' : f.path.endsWith('.ini') ? 'ini' : 'cpp') as
          | 'cpp'
          | 'h'
          | 'ini'
          | 'json',
      }))

      const input = buildFirmwareInputFromSpec(
        project.name || 'PHAESTUS Project',
        project.description || '',
        project.spec?.finalSpec || undefined,
        project.spec?.pcb
      )

      const response = await llm.chat({
        messages: [
          { role: 'system', content: FIRMWARE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildFirmwareModificationPrompt(currentFiles, chatInput, input),
          },
        ],
        temperature: 0.3,
        projectId: project.id,
      })

      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response')
      }

      const result = JSON.parse(jsonMatch[0]) as FirmwareProject
      if (!result.files || result.files.length === 0) {
        throw new Error('No files in response')
      }

      // Merge updated files with existing
      const updatedTree = [...fileTree]
      for (const file of result.files) {
        const existingNode = findNode(updatedTree, file.path)
        if (existingNode) {
          existingNode.content = file.content
        }
      }
      setFileTree([...updatedTree])

      // Update selected file content if it was modified
      if (selectedFile) {
        const updated = result.files.find((f) => f.path === selectedFile.path)
        if (updated) {
          setEditorContent(updated.content)
        }
      }

      // Save to project
      const allFiles: FirmwareProject['files'] = flattenFiles(updatedTree).map((f) => ({
        path: f.path,
        content: f.content,
        language: (f.path.endsWith('.h') ? 'h' : f.path.endsWith('.ini') ? 'ini' : 'cpp') as
          | 'cpp'
          | 'h'
          | 'ini'
          | 'json',
      }))
      await saveMutation.mutateAsync(allFiles)

      setChatInput('')
      setShowChat(false)
    } catch (error) {
      console.error('Firmware modification failed:', error)
      setGenerationError(error instanceof Error ? error.message : 'Modification failed')
    } finally {
      setIsModifying(false)
    }
  }

  // Download as ZIP
  const handleDownloadSource = async () => {
    // Save current editor changes first
    if (selectedFile && editorContent !== selectedFile.content) {
      updateFileContent(selectedFile.path, editorContent)
    }

    const zip = new JSZip()
    const files = flattenFiles(fileTree)

    for (const file of files) {
      zip.file(file.path, file.content)
    }

    // Add README with build instructions
    zip.file(
      'README.md',
      `# ${project?.name || 'PHAESTUS'} Firmware

Generated by PHAESTUS Hardware Design Platform

## Building with PlatformIO

1. Install PlatformIO: https://platformio.org/install
2. Open this folder in VS Code with PlatformIO extension
3. Click "Build" in the PlatformIO toolbar
4. Click "Upload" to flash to your ESP32-C6

## Manual Build

\`\`\`bash
# Install PlatformIO CLI
pip install platformio

# Build
cd ${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'firmware'}
pio run

# Upload to device
pio run -t upload
\`\`\`

## Binary Output

After building, find the binary at:
\`.pio/build/esp32c6/firmware.bin\`

Upload this .bin file back to PHAESTUS for distribution.
`
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'phaestus'}-firmware.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Handle binary upload
  const handleUploadBinary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validExtensions = ['.bin', '.hex', '.elf']
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (!validExtensions.includes(extension)) {
      setGenerationError('Please upload a .bin, .hex, or .elf file')
      return
    }

    setUploadedBinary({ name: file.name, size: file.size })
    setGenerationError(null)

    // In a real implementation, we'd upload this to R2 for distribution
    // For now, just acknowledge the upload
  }

  if (!enclosureComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Code className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Firmware Development</h2>
          <p className="text-steel-dim mb-4">
            Complete the enclosure stage first. Firmware will be generated based on your hardware
            configuration and pin assignments.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Generate Enclosure</span>
            <ArrowRight className="w-4 h-4" />
            <span>Write Firmware</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-surface-700 bg-surface-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-steel mb-0.5">Firmware Development</h2>
            <p className="text-steel-dim text-sm">
              Edit, download, and compile firmware for your ESP32-C6
            </p>
          </div>
          <div className="flex items-center gap-2">
            {uploadedBinary && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 text-sm">
                <Check className="w-4 h-4" />
                {uploadedBinary.name} ({(uploadedBinary.size / 1024).toFixed(1)} KB)
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-ash bg-copper hover:bg-copper-light disabled:opacity-50 rounded transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Firmware
                </>
              )}
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded transition-colors',
                showChat
                  ? 'bg-copper/20 text-copper'
                  : 'text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Modify
            </button>
          </div>
        </div>

        {/* Error display */}
        {generationError && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
            <X className="w-4 h-4 flex-shrink-0" />
            {generationError}
          </div>
        )}

        {/* Orchestrator Trigger - Show when no firmware generated yet */}
        {!existingFirmware?.files?.length && project && (
          <div className="mt-4">
            <OrchestratorTrigger project={project} onSpecUpdate={handleOrchestratorSpecUpdate} />
          </div>
        )}

        {/* Chat input */}
        {showChat && (
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isModifying && handleModify()}
              placeholder="Describe what you want to change... (e.g., 'add WiFi reconnection logic', 'use FastLED instead of NeoPixel')"
              className="flex-1 px-3 py-2 bg-surface-800 border border-surface-600 rounded text-steel placeholder:text-surface-500 text-sm focus:outline-none focus:border-copper"
            />
            <button
              onClick={handleModify}
              disabled={isModifying || !chatInput.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-copper hover:bg-copper-light disabled:opacity-50 rounded transition-colors"
            >
              {isModifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* File tree */}
        <div className="w-56 flex-none border-r border-surface-700 bg-surface-900 flex flex-col">
          <div className="px-3 py-2 border-b border-surface-700">
            <h3 className="text-xs font-medium text-steel-dim uppercase tracking-wide">Files</h3>
          </div>
          <div className="flex-1 py-2 overflow-auto">
            {fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedFile?.path || null}
                expandedFolders={expandedFolders}
                onSelect={handleSelectFile}
                onToggleFolder={handleToggleFolder}
              />
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
            <>
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
                  onChange={handleEditorChange}
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
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-steel-dim">
              <p className="text-sm">Select a file to edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
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
              onClick={handleDownloadSource}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
            >
              <FileArchive className="w-4 h-4" />
              Download Source (.zip)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,.hex,.elf"
              onChange={handleUploadBinary}
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
    </div>
  )
}
