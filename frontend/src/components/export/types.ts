/**
 * Types and utilities for export components
 */

import type { Download } from 'lucide-react'

export interface ConversationMessage {
  role: string
  content: string | Array<{ type: string; text?: string }>
}

export interface Conversation {
  id: string
  messagesIn: ConversationMessage[]
  messageOut: string | null
  model: string | null
  createdAt: string
  promptTokens: number | null
  completionTokens: number | null
}

export interface ExportItem {
  id: string
  icon: typeof Download
  title: string
  description: string
  filename: string
  ready: boolean
  onDownload: () => Promise<void>
}

export interface VisibilitySettings {
  isPublic: boolean
  showAuthor: boolean
}

/** Download a blob as a file */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Infer which stage a conversation belongs to */
export function inferStageFromConversation(conv: Conversation): string {
  const allText = [
    ...conv.messagesIn.map((m) =>
      typeof m.content === 'string' ? m.content : m.content.map((c) => c.text || '').join(' ')
    ),
    conv.messageOut || '',
  ]
    .join(' ')
    .toLowerCase()

  if (
    allText.includes('feasibility') ||
    allText.includes('refinement') ||
    allText.includes('blueprint')
  ) {
    return 'spec'
  }
  if (allText.includes('pcb') || allText.includes('schematic') || allText.includes('circuit')) {
    return 'pcb'
  }
  if (allText.includes('enclosure') || allText.includes('openscad') || allText.includes('stl')) {
    return 'enclosure'
  }
  if (
    allText.includes('firmware') ||
    allText.includes('platformio') ||
    allText.includes('esp32')
  ) {
    return 'firmware'
  }

  return 'other'
}

/** Group conversations by inferred stage */
export function groupConversationsByStage(
  conversations: Conversation[]
): Record<string, Conversation[]> {
  const grouped: Record<string, Conversation[]> = {
    spec: [],
    pcb: [],
    enclosure: [],
    firmware: [],
    other: [],
  }

  for (const conv of conversations) {
    const stage = inferStageFromConversation(conv)
    grouped[stage].push(conv)
  }

  // Remove empty stages
  return Object.fromEntries(Object.entries(grouped).filter(([, convos]) => convos.length > 0))
}

/** Format conversations as markdown */
export function formatConversationsAsMarkdown(stage: string, conversations: Conversation[]): string {
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1)

  let md = `# ${stageLabel} Stage Conversations\n\n`
  md += `*${conversations.length} conversation${conversations.length !== 1 ? 's' : ''} recorded*\n\n`

  // Sort by date (oldest first for readability)
  const sorted = [...conversations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  for (const conv of sorted) {
    const date = new Date(conv.createdAt).toLocaleString()
    md += `---\n\n## ${date}\n\n`

    if (conv.model) {
      md += `*Model: ${conv.model}*\n\n`
    }

    // Format messages
    for (const msg of conv.messagesIn) {
      const roleLabel =
        msg.role === 'system' ? '**System**' : msg.role === 'user' ? '**User**' : '**Assistant**'
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.map((c) => c.text || '').join('\n')

      md += `${roleLabel}:\n\n${content}\n\n`
    }

    // Add response
    if (conv.messageOut) {
      md += `**Assistant**:\n\n${conv.messageOut}\n\n`
    }

    // Add token stats if available
    if (conv.promptTokens || conv.completionTokens) {
      md += `*Tokens: ${conv.promptTokens || 0} in, ${conv.completionTokens || 0} out*\n\n`
    }
  }

  return md
}
