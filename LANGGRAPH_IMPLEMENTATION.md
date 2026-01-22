# LangGraph Implementation

Tracking the incremental migration from custom `phaestus-graph` to actual LangGraph.

**Started**: January 22, 2026
**Status**: In Progress

---

## Current Graph Structure

```
START → start → [new_project | load_project | question] → END
```

Uses `addConditionalEdges` for intent-based routing.

## State Schema

Using LangGraph's modern `StateSchema` with `MessagesValue` and Zod:

```typescript
const PhaestusStateSchema = new StateSchema({
  // Conversation messages - LangGraph's built-in message reducer
  messages: MessagesValue,

  // User input
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),

  // User context
  userProjects: z.array(ProjectSummarySchema).default([]),

  // Intent detection
  intent: UserIntentSchema.default('unknown'),
  matchedProject: ProjectSummarySchema.nullable().default(null),

  // Assessment (for new project flow)
  capabilityAssessment: CapabilityAssessmentSchema.default(null),

  // Control flow
  iterationCount: z.number().default(0),
  route: ChatRouteSchema.default(null),

  // Session & Project
  sessionId: z.string().default(''),
  projectId: z.string().nullable().default(null),
  availableBlocks: z.array(BlockSummarySchema).default([]),

  // Error handling
  error: z.string().nullable().default(null),

  // Debug - uses ReducedValue for step accumulation
  debug: new ReducedValue(DebugInfoSchema, {
    reducer: (current, update) => ({
      ...current,
      ...update,
      steps: [...(current.steps || []), ...(update.steps || [])],
    }),
  }),
})
```

## Implemented Nodes

### `start`
Entry point that detects user intent and routes accordingly.

**Input**: User message (from `messages`), user's existing projects
**Output**: Intent, matched project (if any)

**Intent Detection** (pattern-based):
| Intent | Triggers |
|--------|----------|
| `new_project` | Default for build/design requests |
| `load_project` | "continue working on", "open project", project name mentioned |
| `question` | Starts with what/how/why, ends with ? |

### `new_project`
Handles new project creation flow. Responds with acknowledgment.

### `load_project`
Handles loading existing projects. Shows project list if no match.

### `question`
Handles general questions. (Placeholder for LLM routing)

---

## Key Patterns Used

### 1. StateSchema with MessagesValue
```typescript
import { StateSchema, MessagesValue } from '@langchain/langgraph'

const State = new StateSchema({
  messages: MessagesValue,  // Built-in message reducer with ID handling
  // ...other fields with Zod schemas
})
```

### 2. GraphNode Typing
```typescript
const myNode: GraphNode<typeof PhaestusStateSchema> = async (state) => {
  return { messages: [new AIMessage({ id: crypto.randomUUID(), content: "..." })] }
}
```

### 3. Conditional Edges
```typescript
.addConditionalEdges('start', routeByIntent)
// where routeByIntent returns 'new_project' | 'load_project' | 'question'
```

### 4. Module-Level Compilation
```typescript
const checkpointer = new MemorySaver()
const compiledGraph = buildGraph().compile({ checkpointer })
export { compiledGraph }
```

### 5. Thread-Based Checkpointing
```typescript
await compiledGraph.invoke(input, {
  configurable: { thread_id: sessionId }
})
```

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
| `src/services/langgraph/state.ts` | ~210 | StateSchema with Zod + MessagesValue |
| `src/services/langgraph/graph.ts` | ~420 | Graph definition, nodes, conditional edges, runner |
| `src/services/langgraph/index.ts` | ~47 | Public exports |
| `functions/api/chat/index.ts` | ~137 | API endpoint, fetches user projects |

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

### 2026-01-22 (Evening)
- **Refactored to modern LangGraph patterns**:
  - Replaced `Annotation.Root()` with `StateSchema` + Zod
  - Replaced custom `ChatMessage` with `MessagesValue` and LangChain messages
  - Added `addConditionalEdges` for intent-based routing
  - Module-level graph compilation (singleton)
  - Added `MemorySaver` checkpointer
  - Proper `GraphNode<typeof Schema>` typing
  - Simplified API endpoint (removed unused LLM client)

### 2026-01-22 (Initial)
- Initial LangGraph setup with `start` node
- State annotation with user projects, intent, matched project
- Intent detection via pattern matching
- API fetches user projects before running graph
- Added `nodejs_compat` flag for Cloudflare Workers

---

## Legacy Code

The old implementation remains at `src/services/phaestus-graph/` for reference during migration. It will be removed once all nodes are migrated.
