# Iterative Blueprint Design with Feedback

**Date:** 2026-01-02

---

## The Problem

When PHAESTUS generates product blueprints, users see 4 different design variations. Previously, if a design was close but not quite right, the only options were:
- Accept it as-is
- Regenerate all 4 images and hope for better results

Neither option allowed for targeted iteration on a promising design.

---

## The Solution

Users can now click on any blueprint to enter a detail view where they can:
1. See a larger preview of the selected design
2. Provide natural language feedback about what to change
3. Regenerate just that one image with their feedback incorporated
4. Continue when satisfied

---

## Implementation

### SelectionStep Component

The `SelectionStep` component now manages three states:

```typescript
interface SelectionStepProps {
  blueprints: { url: string; prompt: string }[]
  onSelect: (index: number) => void
  onRegenerate: (index: number, feedback: string) => Promise<void>
}

function SelectionStep({ blueprints, onSelect, onRegenerate }: SelectionStepProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  // ...
}
```

When no design is selected, users see the 4-image grid. When selected, they see the detail view.

### Detail View

```tsx
{selected !== null && (
  <div className="space-y-4">
    <button onClick={() => setSelected(null)}>
      ← Back to all designs
    </button>

    <img src={bp.url} alt={`Design ${selected + 1}`} />

    <textarea
      value={feedback}
      onChange={(e) => setFeedback(e.target.value)}
      placeholder="e.g., Make it more rounded, add a visible antenna..."
    />

    <div className="flex gap-3">
      <button onClick={handleRegenerate} disabled={!feedback.trim()}>
        Regenerate with Changes
      </button>
      <button onClick={() => onSelect(selected)}>
        I'm Happy - Continue
      </button>
    </div>
  </div>
)}
```

### Regeneration Handler

The regeneration appends user feedback to the original prompt:

```typescript
const handleBlueprintRegenerate = async (index: number, feedback: string) => {
  const originalPrompt = spec!.blueprints[index].prompt
  const newPrompt = `${originalPrompt} User feedback: ${feedback}`

  const newUrl = await generateImage(newPrompt)

  // Update just the one blueprint
  const updatedBlueprints = [...spec!.blueprints]
  updatedBlueprints[index] = { url: newUrl, prompt: newPrompt }

  updateMutation.mutate({
    spec: { ...spec!, blueprints: updatedBlueprints },
  })
}
```

This preserves the original style direction while incorporating specific user requests.

---

## User Flow

1. **View Grid** - User sees 4 generated blueprints
2. **Select Design** - Click any image to enter detail view
3. **Review** - See larger preview of the design
4. **Provide Feedback** (optional) - Enter changes like "make corners more rounded" or "add external antenna"
5. **Regenerate** - New image generated with feedback appended to prompt
6. **Iterate** - Repeat steps 4-5 until satisfied
7. **Continue** - Click "I'm Happy - Continue" to proceed to finalization

---

## Technical Notes

### Prompt Composition

The feedback is appended to preserve context:

```
Original: "3D product render: A smart plant monitor. Compact handheld gadget,
          friendly rounded design, matte finish. Visible features: OLED display,
          status LED, USB-C charging port. No text."

With feedback: "3D product render: A smart plant monitor. Compact handheld gadget,
               friendly rounded design, matte finish. Visible features: OLED display,
               status LED, USB-C charging port. No text. User feedback: make it blue
               with a visible soil probe on the bottom"
```

### State Management

The regeneration uses React Query's mutation to update the project:
- Only the modified blueprint is replaced in the array
- Other blueprints remain unchanged
- UI resets to grid view after successful regeneration

---

## Files Changed

```
frontend/src/pages/SpecPage.tsx
├── SelectionStep component
│   ├── Added selected, feedback, isRegenerating state
│   ├── Added detail view with textarea and buttons
│   └── Added handleRegenerate function
└── SpecPage component
    ├── Added handleBlueprintRegenerate handler
    └── Updated SelectionStep usage with onRegenerate prop
```

---

## What's Next

1. **Side-by-side comparison** - Show before/after when regenerating
2. **Feedback history** - Track what changes were requested
3. **Style transfer** - Apply aesthetic from one design to another
4. **Partial regeneration** - Click on specific features to modify just those areas
