# LangGraph Implementation

Tracking the incremental migration from custom `phaestus-graph` to actual LangGraph.

**Started**: January 22, 2026
**Status**: In Progress

---

## Current Graph Structure

```
START → start → END
```

## State Schema

```typescript
PhaestusStateAnnotation {
  // User input
  userRequest: string
  userFeedback: string | null

  // User context
  userProjects: ProjectSummary[]      // Fetched from DB for routing

  // Intent detection
  intent: UserIntent                   // 'new_project' | 'load_project' | 'question' | 'unknown'
  matchedProject: ProjectSummary | null

  // Assessment (for new project flow)
  capabilityAssessment: CapabilityAssessment | null

  // Control flow
  iterationCount: number
  route: ChatRoute                     // 'REJECT' | 'CLARIFY' | 'PROCEED' | null

  // Conversation
  messages: ChatMessage[]              // Accumulates via reducer

  // Session & Project
  sessionId: string
  projectId: string | null
  availableBlocks: BlockSummary[]

  // Error handling
  error: string | null

  // Debug
  debug: DebugInfo                     // Steps accumulate via reducer
}
```

## Implemented Nodes

### `start`
**File**: `src/services/langgraph/graph.ts`

Entry point that detects user intent and prepares routing.

**Input**: User message, user's existing projects
**Output**: Intent, matched project (if any), initial response message

**Intent Detection** (pattern-based):
| Intent | Triggers |
|--------|----------|
| `new_project` | Default for build/design requests |
| `load_project` | "continue working on", "open project", project name mentioned |
| `question` | Starts with what/how/why, ends with ? |

**Behavior by Intent**:
- `new_project`: "I'll help you design: {request}"
- `load_project` + match: "Loading project {name}..."
- `load_project` + no match: Lists user's projects
- `question`: Placeholder for LLM routing

---

## Planned Nodes

### `hard_rejection_check`
Pattern-based rejection for safety/capability/legal issues.
- No LLM call needed
- Checks against DB-stored regex patterns
- Routes to `reject` or continues to `capability_assess`

### `capability_assess`
LLM-based assessment of project feasibility.
- Calls LLM with system prompt + user request
- Parses JSON response for confidence, missing capabilities
- Sets `route` based on assessment

### `reject`
Generates rejection message with explanation.
- Uses assessment to explain why
- Lists missing capabilities and alternatives

### `clarify`
Generates follow-up questions.
- Used when request is ambiguous
- Increments `iterationCount`

### `proceed`
Creates project in database.
- Sets `projectId`
- Transitions to workbench

### `load_project`
Loads existing project into state.
- Fetches full project from DB
- Sets `projectId` and project data

### `answer_question`
Handles general questions (not project requests).
- LLM call for Q&A
- No project creation

---

## Target Graph Structure

```
                                    ┌─────────────────┐
                                    │      START      │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │      start      │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
           [new_project]            [load_project]              [question]
                    │                        │                        │
                    ▼                        ▼                        ▼
        ┌───────────────────┐    ┌─────────────────┐      ┌─────────────────┐
        │ hard_rejection    │    │  load_project   │      │ answer_question │
        └─────────┬─────────┘    └────────┬────────┘      └────────┬────────┘
                  │                       │                        │
         ┌────────┴────────┐              │                        │
         │                 │              │                        │
         ▼                 ▼              │                        │
    [rejected]        [passed]            │                        │
         │                 │              │                        │
         ▼                 ▼              │                        │
    ┌─────────┐   ┌─────────────────┐     │                        │
    │ reject  │   │ capability_assess│    │                        │
    └────┬────┘   └────────┬────────┘     │                        │
         │                 │              │                        │
         │        ┌────────┼────────┐     │                        │
         │        │        │        │     │                        │
         │        ▼        ▼        ▼     │                        │
         │   [REJECT] [CLARIFY] [PROCEED] │                        │
         │        │        │        │     │                        │
         │        ▼        ▼        ▼     │                        │
         │   ┌────────┐ ┌───────┐ ┌───────┐                        │
         │   │ reject │ │clarify│ │proceed│                        │
         │   └────┬───┘ └───┬───┘ └───┬───┘                        │
         │        │         │         │                            │
         └────────┴─────────┴─────────┴────────────────────────────┘
                                      │
                                      ▼
                                    ┌───┐
                                    │END│
                                    └───┘
```

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/services/langgraph/state.ts` | ~220 | State annotation with reducers |
| `src/services/langgraph/graph.ts` | ~320 | Graph definition, nodes, runner |
| `src/services/langgraph/index.ts` | ~40 | Public exports |
| `functions/api/chat/index.ts` | ~240 | API endpoint, fetches user projects |

---

## API Response Shape

```typescript
{
  response: string           // Assistant's message
  intent: UserIntent         // Detected intent
  route: ChatRoute | null    // Routing decision (null until capability_assess)
  assessment: CapabilityAssessment | null
  matchedProject: ProjectSummary | null
  projectId: string | null   // Set on proceed or load_project
  sessionId: string
  debug: DebugInfo           // Execution trace
}
```

---

## Configuration

**wrangler.toml** requires:
```toml
compatibility_flags = ["nodejs_compat"]
```

LangGraph uses `node:async_hooks` which needs Node.js compatibility mode in Cloudflare Workers.

---

## Changelog

### 2026-01-22
- Initial LangGraph setup with `start` node
- State annotation with user projects, intent, matched project
- Intent detection via pattern matching
- API fetches user projects before running graph
- Added `nodejs_compat` flag for Cloudflare Workers

---

## Legacy Code

The old implementation remains at `src/services/phaestus-graph/` for reference during migration. It will be removed once all nodes are migrated.
