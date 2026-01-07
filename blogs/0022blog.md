# Vision-Enabled Enclosure Generation: Teaching AI to See Design Intent

**Date:** January 7, 2026

The enclosure generation in PHAESTUS was functional but fundamentally limited. It could generate OpenSCAD code based on PCB dimensions and component specs, but it was essentially blind to what the user actually wanted the product to look like. Today I fixed that with a three-phase enhancement that brings vision capabilities to the entire enclosure pipeline.

## The Problem: Text Can't Describe Design Intent

The original system worked like this:

```
Text specs (PCB size, components) → LLM → OpenSCAD code → Render
```

The LLM never saw the blueprint. It had no idea if the user wanted a sleek minimal design or a chunky industrial one. Button positions were heuristics: "put USB in the center, LEDs in a row." The result was generic boxes that technically fit the electronics but missed the design intent entirely.

## The Key Insight: Blueprints Show Position, Not PCB Layout

Here's what I realized: the PCB blocks in PHAESTUS are just connectors. The actual buttons, LEDs, and displays are on sub-boards connected via wires. This means aperture positions should come from the **blueprint image** (where features visually appear), not from PCB coordinates.

The blueprint shows WHERE things should be. The spec shows WHAT things are needed. Combining both gives the LLM everything it needs.

## Phase 1: Adding Vision to the LLM Service

First, I needed to enable the LLM to receive images. This required changes across three layers:

### Frontend Service (`llm.ts`)

Extended the ChatMessage type to support multipart content:

```typescript
interface ImageContent {
  type: 'image'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  data: string  // base64 encoded
}

interface TextContent {
  type: 'text'
  text: string
}

type MessageContent = string | (TextContent | ImageContent)[]
```

Added helper utilities:

```typescript
export async function fetchImageAsBase64(url: string): Promise<string>
export function getMimeTypeFromUrl(url: string): MimeType
```

### Gemini Converter (`gemini.ts`)

Updated the format converter to handle image parts:

```typescript
function buildGeminiParts(content: MessageContent): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }]
  }

  return content.map((part) => {
    if (part.type === 'image') {
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      }
    }
    return { text: part.text }
  })
}
```

### Chat API (`chat.ts`)

Added conversion for OpenRouter's format (data URIs for images):

```typescript
function convertToOpenRouterFormat(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    const content = msg.content.map((part) => {
      if (part.type === 'image') {
        return {
          type: 'image_url',
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        }
      }
      return { type: 'text', text: part.text }
    })

    return { role: msg.role, content }
  })
}
```

## Phase 2: Blueprint-Driven Generation

With vision support in place, I created new prompts that leverage it.

### The Vision System Prompt

```typescript
export const ENCLOSURE_VISION_SYSTEM_PROMPT = `You are PHAESTUS,
an expert mechanical engineer designing 3D-printable enclosures.

You will receive:
1. A product blueprint image showing the desired design
2. A list of features that need apertures
3. PCB dimensions for internal cavity sizing

Your job is to generate OpenSCAD code that:
- Matches the form factor and proportions visible in the blueprint
- Places apertures where they appear in the blueprint
- Captures the aesthetic style (rounded, angular, industrial, sleek)`
```

### Feature Extraction

Created a function to build the feature list from the project spec:

```typescript
export function buildFeatureList(finalSpec): EnclosureFeature[] {
  const features = []

  features.push({ type: 'USB-C port', count: 1, width: 9, height: 3.2 })

  for (const input of finalSpec.inputs || []) {
    if (input.type.includes('button')) {
      features.push({ type: 'Button', count: input.count, width: 6, height: 6 })
    }
  }

  for (const output of finalSpec.outputs || []) {
    if (output.type.includes('oled')) {
      features.push({ type: 'OLED display window', count: 1, width: 27, height: 15 })
    }
  }

  return features
}
```

### Updated Generation Flow

The enclosure stage now checks for a blueprint and uses vision if available:

```typescript
if (hasBlueprint) {
  const blueprintBase64 = await fetchImageAsBase64(blueprintUrl)

  const response = await llm.chat({
    messages: [
      { role: 'system', content: ENCLOSURE_VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image', mimeType, data: blueprintBase64 },
          { type: 'text', text: buildVisionEnclosurePrompt(input) },
        ],
      },
    ],
  })
}
```

## Phase 3: Visual Validation and Comparison UI

The final piece: letting users compare the generated render to their blueprint.

### STL Screenshot Capability

Added a ref to the STLViewer component for capturing screenshots:

```typescript
export interface STLViewerRef {
  takeScreenshot: () => Promise<string | null>
}

export const STLViewer = forwardRef<STLViewerRef, STLViewerProps>(
  function STLViewer(props, ref) {
    const glRef = useRef<THREE.WebGLRenderer | null>(null)

    useImperativeHandle(ref, () => ({
      takeScreenshot: async () => {
        const canvas = glRef.current?.domElement
        return canvas?.toDataURL('image/png').split(',')[1] || null
      },
    }))

    return (
      <Canvas gl={{ preserveDrawingBuffer: true }}>
        <ScreenshotHelper onReady={(gl) => glRef.current = gl} />
        {/* ... */}
      </Canvas>
    )
  }
)
```

### Visual Comparison Prompt

Created a prompt for the LLM to compare blueprint vs render:

```typescript
export const VISUAL_COMPARISON_PROMPT = `
Compare a generated 3D enclosure render against the original blueprint.

Analyze these aspects:
1. Form Factor Match (0-100) - shape, proportions
2. Feature Placement (0-100) - aperture positions
3. Visual Style (0-100) - aesthetic match
4. Assembly Feasibility (0-100) - printability

Respond with JSON:
{
  "overallScore": 0-100,
  "scores": { ... },
  "matches": true if >= 70,
  "issues": [...],
  "fixInstructions": "Specific OpenSCAD changes to fix"
}
`
```

### Comparison Component

Built a side-by-side comparison UI showing:
- Blueprint image (design intent)
- Rendered enclosure screenshot
- Score breakdown by category
- Issue list with categories
- Action buttons: Accept or Regenerate with fixes

## The Result

The enclosure generation flow is now:

```
Blueprint image + Feature specs
       ↓
  LLM (Vision) → OpenSCAD code
       ↓
  Render to STL → Screenshot
       ↓
  Blueprint + Screenshot → LLM → Validation scores
       ↓
  User sees comparison, accepts or regenerates
```

Key improvements:

1. **Position accuracy**: Apertures now match blueprint placement, not hardcoded heuristics
2. **Style matching**: LLM sees and replicates the visual design language
3. **Validation feedback**: Users see exactly how well the render matches their intent
4. **Iterative refinement**: Regenerate with specific fix instructions from validation

## Technical Stats

- **Files modified**: 8
- **Lines added**: ~1,000
- **Tests**: 638 passing (no regressions)
- **New component**: EnclosureComparison.tsx

The enclosure generator went from "text-only box maker" to "vision-aware design system." It can finally see what you want and work toward it.
