# 0027 - Conversation Export: Complete Audit Trail

**Date**: 2025-01-07
**Phase**: 5 of 5 - Pipeline Coordination (Final)

## The Problem

The design process involves dozens of LLM conversations - feasibility analysis, refinement questions, enclosure generation iterations, firmware modifications. But these conversations vanished after the session. Users couldn't review decisions, reproduce the process, or understand why certain choices were made.

## The Solution

A new **Chat History** export in the Export stage that downloads all project conversations as organized markdown files.

```
conversations.zip
├── spec-chat.md         # Feasibility, refinement, blueprints
├── pcb-chat.md          # Block selection discussions
├── enclosure-chat.md    # OpenSCAD iterations
├── firmware-chat.md     # Code modifications
├── all-conversations.md # Combined chronological view
└── README.md            # Usage documentation
```

## Implementation

### Fetching Conversations

Uses the existing conversations API (admin-only):

```typescript
const res = await fetch(`/api/projects/${project.id}/conversations?limit=200`)
const { conversations } = await res.json()
```

### Stage Inference

Conversations don't have explicit stage tags, so we infer from content:

```typescript
function inferStageFromConversation(conv: Conversation): string {
  const allText = [
    ...conv.messagesIn.map(m => typeof m.content === 'string'
      ? m.content
      : m.content.map(c => c.text || '').join(' ')),
    conv.messageOut || '',
  ].join(' ').toLowerCase()

  // Match keywords to stages
  if (allText.includes('feasibility') || allText.includes('refinement')) {
    return 'spec'
  }
  if (allText.includes('pcb') || allText.includes('schematic')) {
    return 'pcb'
  }
  if (allText.includes('enclosure') || allText.includes('openscad')) {
    return 'enclosure'
  }
  if (allText.includes('firmware') || allText.includes('platformio')) {
    return 'firmware'
  }
  return 'other'
}
```

### Markdown Formatting

Each conversation becomes a timestamped section with clear role labels:

```typescript
function formatConversationsAsMarkdown(stage: string, conversations: Conversation[]): string {
  let md = `# ${stageLabel} Stage Conversations\n\n`
  md += `*${conversations.length} conversation(s) recorded*\n\n`

  for (const conv of sorted) {
    md += `---\n\n## ${date}\n\n`
    if (conv.model) md += `*Model: ${conv.model}*\n\n`

    for (const msg of conv.messagesIn) {
      const roleLabel = msg.role === 'system' ? '**System**'
        : msg.role === 'user' ? '**User**'
        : '**Assistant**'
      md += `${roleLabel}:\n\n${content}\n\n`
    }

    if (conv.messageOut) {
      md += `**Assistant**:\n\n${conv.messageOut}\n\n`
    }

    if (conv.promptTokens || conv.completionTokens) {
      md += `*Tokens: ${conv.promptTokens || 0} in, ${conv.completionTokens || 0} out*\n\n`
    }
  }

  return md
}
```

### Export Item Integration

Added as a new export option in the grid:

```typescript
{
  id: 'conversations',
  icon: MessageSquare,
  title: 'Chat History',
  description: 'AI conversation logs organized by stage',
  filename: 'conversations.zip',
  ready: true,
  onDownload: downloadConversations,
}
```

## Output Example

**spec-chat.md**:
```markdown
# Spec Stage Conversations

*3 conversations recorded*

---

## 1/7/2025, 12:30:45 PM

*Model: google/gemini-3-flash-preview*

**System**:
You are a hardware design assistant...

**User**:
Build me a temperature sensor with WiFi connectivity

**Assistant**:
{
  "manufacturable": true,
  "overallScore": 85,
  ...
}

*Tokens: 1250 in, 890 out*

---

## 1/7/2025, 12:32:10 PM

**User**:
I want battery power, USB-C charging

**Assistant**:
Based on your requirements, I recommend...
```

## Use Cases

1. **Design Archaeology** - Understand why decisions were made months later
2. **Process Reproduction** - Re-run the same prompts with different models
3. **Debugging** - Find where a design went wrong
4. **Documentation** - Generate design docs from conversation history
5. **Training Data** - Extract successful design patterns

## Access Control

Currently admin-only since conversations may contain sensitive prompt content. Future versions could:
- Allow project owners to export their own conversations
- Filter sensitive system prompts
- Redact API keys or credentials

## Pipeline Coordination Complete

This completes the 5-phase pipeline coordination implementation:

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | PCB Merge Integration | ✅ |
| 2 | PCB 3D Viewer | ✅ |
| 3 | Project File Manager | ✅ |
| 4 | Stage Completion Summaries | ✅ |
| 5 | Conversation Export | ✅ |

## Artifacts

- Commit: `5ca17d9` - "Add conversation export to download AI chat history"
- Files changed: 2 (377 insertions)
- Tests: All 638 passing
