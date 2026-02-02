/**
 * PromptEditor - Textarea with @variable autocomplete
 *
 * Provides intellisense-style autocomplete when typing @ in the prompt editor.
 * Variables are fetched dynamically from the context API.
 */

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'

interface Variable {
  name: string
  description: string
  requiresProject: boolean
}

interface ContextResponse {
  variables: Array<{
    name: string
    description: string
    requiresProject: boolean
  }>
}

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function PromptEditor({ value, onChange, placeholder, className }: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filterText, setFilterText] = useState('')
  const [triggerPosition, setTriggerPosition] = useState<number | null>(null)

  // Fetch available variables from context API
  const { data: contextData } = useQuery({
    queryKey: ['admin-langgraph-context-variables'],
    queryFn: async () => {
      const res = await fetch('/api/admin/langgraph/context')
      if (!res.ok) throw new Error('Failed to fetch context')
      return res.json() as Promise<ContextResponse>
    },
    staleTime: 60000, // Cache for 1 minute
  })

  // Transform API response to autocomplete format
  const availableVariables: Variable[] = (contextData?.variables || []).map((v) => ({
    name: v.name,
    description: v.description,
    requiresProject: v.requiresProject,
  }))

  // Filter variables based on what's typed after @
  const filteredVariables = availableVariables.filter((v) => {
    const searchText = filterText.toLowerCase()
    const varName = v.name.toLowerCase()
    // Match against name without @ prefix for easier filtering
    return varName.includes(searchText) || varName.slice(1).startsWith(searchText)
  })

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    onChange(newValue)

    // Check if we should show autocomplete
    const textBeforeCursor = newValue.substring(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@([\w.:]*)?$/)

    if (atMatch) {
      const filter = atMatch[1] || ''
      setFilterText(filter)
      setTriggerPosition(cursorPos - filter.length - 1) // Position of @
      setSelectedIndex(0)
      setShowAutocomplete(true)
    } else {
      setShowAutocomplete(false)
      setTriggerPosition(null)
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete || filteredVariables.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredVariables.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredVariables.length) % filteredVariables.length)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        insertVariable(filteredVariables[selectedIndex].name)
        break
      case 'Escape':
        e.preventDefault()
        setShowAutocomplete(false)
        break
    }
  }

  // Insert selected variable
  const insertVariable = (variableName: string) => {
    if (triggerPosition === null) return

    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const beforeTrigger = value.substring(0, triggerPosition)
    const afterCursor = value.substring(cursorPos)

    const newValue = beforeTrigger + variableName + afterCursor
    onChange(newValue)

    // Move cursor after inserted variable
    const newCursorPos = triggerPosition + variableName.length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)

    setShowAutocomplete(false)
    setTriggerPosition(null)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    if (showAutocomplete && dropdownRef.current) {
      const selectedEl = dropdownRef.current.querySelector('[data-selected="true"]')
      selectedEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, showAutocomplete])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={clsx(
          'w-full h-64 px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel font-mono resize-y focus:outline-none focus:border-copper',
          className
        )}
        placeholder={placeholder}
      />

      {/* Autocomplete Dropdown - positioned at top-right of textarea */}
      {showAutocomplete && filteredVariables.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 bg-surface-800 border border-surface-600 rounded-lg shadow-xl overflow-hidden"
          style={{
            top: 8,
            right: 8,
            maxHeight: '240px',
            minWidth: '320px',
            maxWidth: '400px',
          }}
        >
          <div className="px-2 py-1.5 bg-surface-700/50 border-b border-surface-600">
            <span className="text-xs text-steel-dim">@ Variables ({filteredVariables.length})</span>
          </div>
          <div className="overflow-y-auto max-h-[200px]">
            {filteredVariables.map((variable, index) => (
              <button
                key={variable.name}
                data-selected={index === selectedIndex}
                onClick={() => insertVariable(variable.name)}
                className={clsx(
                  'w-full px-3 py-2 text-left flex flex-col gap-0.5 transition-colors',
                  index === selectedIndex
                    ? 'bg-copper/20 text-steel'
                    : 'text-steel-dim hover:bg-surface-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-emerald-400">{variable.name}</code>
                  {variable.requiresProject && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      project
                    </span>
                  )}
                </div>
                <span className="text-xs text-steel-dim truncate">{variable.description}</span>
              </button>
            ))}
          </div>
          <div className="px-2 py-1 bg-surface-700/50 border-t border-surface-600 text-[10px] text-steel-dim flex gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </div>
      )}
    </div>
  )
}
