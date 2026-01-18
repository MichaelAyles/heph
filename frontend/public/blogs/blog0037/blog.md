# Blog 37: Edge-Driven Orchestration - From Hardcoded Prompts to Graph Navigation

**Date**: January 18, 2026

## The Problem: Prompts Are Scattered, Graphs Are Invisible

PHAESTUS has an orchestrator - a multi-agent system that guides users through hardware design stages. It works, but the prompts live in three places:

1. **Hardcoded in TypeScript** - `src/prompts/feasibility.ts`, `orchestrator.ts`, etc.
2. **Database** - `orchestrator_prompts` table with editable system prompts
3. **Runtime state** - The LLM decides what to do next based on conversation history

For debugging, you needed to:
- Read the hardcoded prompt to understand the schema
- Check the database to see if an override exists
- Watch the conversation history to understand flow
- Guess at loop conditions and iteration limits

Worse: adding a new stage meant editing TypeScript, deploying, and hoping the LLM understood the new tool.

## The Vision: Database-Driven Everything

What if the entire orchestration graph lived in the database?

```
┌──────────────────────────────────────────────────────────────┐
│ orchestrator_prompts                                          │
│ ─────────────────────────────────────────────────────────────│
│ node_name    │ system_prompt │ context_selector │ iteration  │
│ ─────────────│───────────────│──────────────────│────────────│
│ feasibility  │ "You are..."  │ ["description"]  │ max: 3     │
│ refinement   │ "You are..."  │ ["decisions[*]"] │ max: 5     │
│ enclosure    │ "You are..."  │ ["finalSpec"]    │ max: 3     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ orchestrator_edges                                            │
│ ─────────────────────────────────────────────────────────────│
│ from_node   │ to_node      │ condition              │ max    │
│ ────────────│──────────────│────────────────────────│────────│
│ feasibility │ refinement   │ score >= 70            │ -      │
│ refinement  │ blueprint    │ questions answered     │ -      │
│ review      │ generate     │ verdict == "revise"    │ 3      │
│ review      │ export       │ verdict == "pass"      │ -      │
└──────────────────────────────────────────────────────────────┘
```

Now admins can:
- Add new nodes without deployment
- Edit transition conditions in the UI
- Set iteration limits on review loops
- Test prompts with sample data before going live

## The Implementation

### Phase 1: Schema Extensions

Three new migrations extend the database:

**0019_enhanced_prompts.sql** adds columns to `orchestrator_prompts`:

```sql
ALTER TABLE orchestrator_prompts ADD COLUMN input_schema TEXT;
ALTER TABLE orchestrator_prompts ADD COLUMN output_schema TEXT;
ALTER TABLE orchestrator_prompts ADD COLUMN context_selector TEXT;
ALTER TABLE orchestrator_prompts ADD COLUMN iteration_config TEXT;
ALTER TABLE orchestrator_prompts ADD COLUMN user_prompt_template TEXT;
ALTER TABLE orchestrator_prompts ADD COLUMN output_format TEXT DEFAULT 'json';
```

**0020_edge_conditions.sql** adds loop control:

```sql
ALTER TABLE orchestrator_edges ADD COLUMN max_loops INTEGER;
```

### Phase 2: Context Building

The `context_selector` field specifies what data from `ProjectSpec` gets passed to each prompt. Patterns supported:

```typescript
buildContextFromSelector(spec, ['*'])                    // All fields
buildContextFromSelector(spec, ['description'])          // Single field
buildContextFromSelector(spec, ['feasibility.score'])    // Nested path
buildContextFromSelector(spec, ['decisions[*].answer'])  // Array extraction
buildContextFromSelector(spec, ['*', '!stages'])         // Exclude field
```

The implementation walks the spec object and builds a context:

```typescript
function extractAndSet(source: Record<string, unknown>, pattern: string, target: Record<string, unknown>) {
  const arrayMatch = pattern.match(/^([^[]+)\[([^\]]+)\](.*)$/)

  if (arrayMatch) {
    const [, arrayPath, indexPattern, remainder] = arrayMatch
    const array = getByPath(source, arrayPath)

    if (indexPattern === '*') {
      // Extract from all elements
      const extracted = array.map(item => getByPath(item, remainder))
      setByPath(target, `${arrayPath}_extracted`, extracted)
    }
  } else {
    // Simple path
    const value = getByPath(source, pattern)
    if (value !== undefined) setByPath(target, pattern, value)
  }
}
```

### Phase 3: Template Rendering

User prompts support Handlebars-like syntax:

```handlebars
Analyze this project:
{{description}}

{{#if feasibility}}
Previous analysis scored {{feasibility.overallScore}}/100.
{{/if}}

{{#each decisions}}
- {{this.question}}: {{this.answer}}
{{/each}}
```

The renderer handles variable substitution, conditionals, and loops:

```typescript
export function renderPromptTemplate(template: string, context: Record<string, unknown>): string {
  let result = template

  // Handle {{#each}} blocks
  result = result.replace(
    /\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, path, innerTemplate) => {
      const array = getByPath(context, path)
      if (!Array.isArray(array)) return ''
      return array.map(item => {
        return innerTemplate.replace(/\{\{this\.(\w+)\}\}/g, (_, field) =>
          getByPath(item, field) ?? ''
        )
      }).join('')
    }
  )

  // Handle {{#if}} blocks
  // Handle {{variable}} substitutions
  // ...
}
```

### Phase 4: Edge Execution Engine

The `EdgeExecutionEngine` navigates the graph based on conditions:

```typescript
class EdgeExecutionEngine {
  private edges: EnhancedOrchestratorEdge[]
  private state: EdgeExecutionState

  getNextNodes(): string[] {
    const outgoing = this.edges
      .filter(e => e.fromNode === this.state.currentNode && e.isActive)
      .sort((a, b) => b.priority - a.priority)

    const valid: string[] = []
    for (const edge of outgoing) {
      // Check condition
      if (edge.condition && !this.evaluateCondition(edge.condition)) {
        continue
      }
      // Check loop limit
      if (edge.edgeType === 'loop' && edge.maxLoops) {
        const count = this.state.loopCounts.get(`${edge.fromNode}->${edge.toNode}`) || 0
        if (count >= edge.maxLoops) continue
      }
      valid.push(edge.toNode)
    }
    return valid
  }

  evaluateCondition(condition: CompoundCondition): boolean {
    if ('all' in condition) {
      return condition.all.every(c => this.evaluateCondition(c))
    }
    if ('any' in condition) {
      return condition.any.some(c => this.evaluateCondition(c))
    }
    // Simple condition: { field, operator, value }
    const actual = this.getContextValue(condition.field)
    return this.compareValues(actual, condition.operator, condition.value)
  }
}
```

Conditions support AND/OR logic and eight operators: `==`, `!=`, `>=`, `<=`, `>`, `<`, `contains`, `notContains`.

### Phase 5: UI Enhancements

![Edge-Driven Orchestration UI](2026-01-18%2017_41_52-NVIDIA%20GeForce%20Overlay.png)

**PromptEditor** now has six tabs:

```
┌─────────────────────────────────────────────────────────────────┐
│ [System] [User Template] [Input Schema] [Output Schema]         │
│ [Context] [Iteration]                          Format: [JSON ▼] │
├─────────────────────────────────────────────────────────────────┤
│ Context selector patterns. Examples:                            │
│ ["*"], ["description", "feasibility"], ["decisions[*].answer"]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ["description", "feasibility", "decisions"]                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**FlowVisualization** shows edge types visually:

- **Flow edges**: Gray solid lines
- **Conditional edges**: Amber dashed lines with condition labels
- **Loop edges**: Purple dotted curves with max iteration counts

```typescript
const EDGE_TYPE_STYLES = {
  flow: { stroke: '#52525b' },
  conditional: { stroke: '#f59e0b', dashArray: '4,4' },
  loop: { stroke: '#8b5cf6', dashArray: '2,2' },
}
```

Hovering an edge shows a tooltip with the full condition JSON.

**NodeTestRunner** lets you test prompts without running the full orchestrator:

```
┌─────────────────────────────────────────────────────────────────┐
│ Test: Feasibility Analyzer                                 [x]  │
│ Test context selectors and prompt templates with sample data    │
├─────────────────────────────────────────────────────────────────┤
│ [Sample Data] [Built Context] [Rendered Prompt]                 │
├─────────────────────────────────────────────────────────────────┤
│ Context Built from Selector:                                    │
│ {                                                               │
│   "description": "A smart plant watering system..."             │
│ }                                                               │
├─────────────────────────────────────────────────────────────────┤
│                                      [Close] [Run Test]         │
└─────────────────────────────────────────────────────────────────┘
```

Paste sample JSON, click "Run Test", see exactly what context gets built and how the template renders.

## What Changed

**Before**: Adding a review loop meant:
1. Edit `orchestrator.ts` to add the loop logic
2. Edit the prompt file to handle feedback
3. Deploy and test
4. Hope the LLM understands when to loop

**After**: Adding a review loop means:
1. Create an edge from `review` to `generate` in the admin UI
2. Set condition: `lastReview.verdict == "revise"`
3. Set max_loops: 3
4. Test with NodeTestRunner
5. Save

No deployment. No code changes. The graph navigates itself.

## The Code

72 new tests covering:
- Context selector patterns (wildcards, nested paths, array extraction)
- Template rendering (variables, conditionals, loops)
- Edge condition evaluation (simple, AND, OR)
- Loop counting and limits

```
Test Files  25 passed (25)
     Tests  720 passed (720)
```

4,315 lines added across 20 files:
- 3 migrations
- 4 new services (context-builder, prompt-loader, edge-engine, orchestrator-node schema)
- 1 new component (NodeTestRunner)
- Enhanced FlowVisualization and PromptEditor

## The Commit

```
Add unified orchestration system with edge-driven execution

- Add migrations for enhanced orchestrator prompts (input/output schemas,
  context selectors, iteration config, user prompt templates)
- Add migration for edge conditions with max_loops support
- Add seed migration for additional prompt types (refinement, final_spec,
  blueprint, openscad_validation, visual_comparison, etc.)

Services:
- Add context-builder.ts with selector patterns and template rendering
- Add prompt-loader.ts with caching and fallback prompts
- Add edge-engine.ts for graph-driven workflow execution
- Add orchestrator-node.ts schema types using Zod

UI Enhancements:
- Enhance PromptEditor.tsx with 6 tabs (System, User Template, Input/Output
  Schema, Context, Iteration) and output format selector
- Enhance FlowVisualization.tsx with colored loop/conditional edges, labels,
  tooltips, and legend
- Add NodeTestRunner.tsx for testing context selectors and templates

API Updates:
- Update prompt endpoints to handle all enhanced fields
- Add proper serialization for JSON schema fields

Tests:
- Add comprehensive tests for context-builder (22 tests)
- Add comprehensive tests for edge-engine (34 tests)
- Add tests for prompt-loader (16 tests)
```

The orchestrator is now data-driven. Next: actually using it to guide users through hardware design without LLM prompting gymnastics.
