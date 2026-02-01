/**
 * PromptEditor - Textarea with @variable autocomplete
 *
 * Provides intellisense-style autocomplete when typing @ in the prompt editor.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'

// Available @variables with descriptions and metadata
const AVAILABLE_VARIABLES = [
  {
    name: '@availableBlocks',
    description: 'List of available hardware blocks formatted for prompts',
    requiresProject: false,
  },
  {
    name: '@projectState',
    description: 'Full project state object',
    requiresProject: true,
  },
  {
    name: '@projectState.status',
    description: 'Current project status',
    requiresProject: true,
  },
  {
    name: '@description',
    description: "User's original project description",
    requiresProject: true,
  },
  {
    name: '@projectName',
    description: 'Project name from final spec',
    requiresProject: true,
  },
  {
    name: '@finalSpec',
    description: 'Full final specification object (JSON)',
    requiresProject: true,
  },
  {
    name: '@decisions',
    description: 'Formatted list of user decisions (question: answer)',
    requiresProject: true,
  },
  {
    name: '@selectedBlueprintPrompt',
    description: "The selected blueprint's prompt text",
    requiresProject: true,
  },
  {
    name: '@visualization',
    description: 'All generated product visualization renders',
    requiresProject: true,
  },
  {
    name: '@visualization.selected',
    description: 'The user-selected visualization render',
    requiresProject: true,
  },
  {
    name: '@image:visualization.selected',
    description: 'ATTACH the selected visualization image to LLM call (~258 tokens)',
    requiresProject: true,
  },
  {
    name: '@image:visualization.0',
    description: 'ATTACH visualization at index 0 to LLM call (~258 tokens)',
    requiresProject: true,
  },
  {
    name: '@feasibility',
    description: 'Full feasibility analysis object',
    requiresProject: true,
  },
  {
    name: '@feasibility.suggestedRevisions.revisedDescription',
    description: 'AI-revised project description',
    requiresProject: true,
  },
  {
    name: '@feasibility.suggestedRevisions.summary',
    description: 'Summary of suggested changes',
    requiresProject: true,
  },
  {
    name: '@feasibility.suggestedRevisions.changes',
    description: 'List of suggested changes',
    requiresProject: true,
  },
  {
    name: '@feasibility.communication.type',
    description: 'Communication type (e.g., BLE 5.0)',
    requiresProject: true,
  },
  {
    name: '@feasibility.overallScore',
    description: 'Feasibility score (0-100)',
    requiresProject: true,
  },
  {
    name: '@feasibility.inputs.items',
    description: 'List of input components',
    requiresProject: true,
  },
  {
    name: '@feasibility.outputs.items',
    description: 'List of output components',
    requiresProject: true,
  },
]

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
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filterText, setFilterText] = useState('')
  const [triggerPosition, setTriggerPosition] = useState<number | null>(null)

  // Filter variables based on what's typed after @
  const filteredVariables = AVAILABLE_VARIABLES.filter((v) =>
    v.name.toLowerCase().includes(filterText.toLowerCase())
  )

  // Get caret coordinates in textarea
  const getCaretCoordinates = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return { top: 0, left: 0 }

    // Create a mirror div to measure text position
    const mirror = document.createElement('div')
    const style = window.getComputedStyle(textarea)

    // Copy styles that affect text positioning
    const stylesToCopy = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'padding',
      'border',
      'boxSizing',
      'whiteSpace',
      'wordWrap',
      'overflowWrap',
    ] as const
    stylesToCopy.forEach((prop) => {
      mirror.style.setProperty(
        prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
        style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase())
      )
    })

    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.width = `${textarea.clientWidth}px`
    mirror.style.height = 'auto'
    mirror.style.overflow = 'hidden'

    // Get text up to cursor
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart)
    mirror.textContent = textBeforeCursor

    // Add a span to mark cursor position
    const marker = document.createElement('span')
    marker.textContent = '|'
    mirror.appendChild(marker)

    document.body.appendChild(mirror)

    const markerRect = marker.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()

    document.body.removeChild(mirror)

    return {
      top: markerRect.top - textareaRect.top + textarea.scrollTop + 20,
      left: markerRect.left - textareaRect.left,
    }
  }, [])

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

      // Position dropdown
      const coords = getCaretCoordinates()
      setAutocompletePosition(coords)
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

      {/* Autocomplete Dropdown */}
      {showAutocomplete && filteredVariables.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 bg-surface-800 border border-surface-600 rounded-lg shadow-xl overflow-hidden"
          style={{
            top: autocompletePosition.top,
            left: Math.min(autocompletePosition.left, 400), // Prevent going off screen
            maxHeight: '240px',
            minWidth: '320px',
            maxWidth: '450px',
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
