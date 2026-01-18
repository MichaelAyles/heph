# Firmware Generation: AI-Powered ESP32 Code + Manual Build Workflow

**Date:** 2026-01-04

---

## The Goal

Implement AI-generated firmware for ESP32-C6 with Monaco editor integration, downloadable source code, and a manual compilation workflow using PlatformIO.

---

## The Problem

After designing the PCB and enclosure, users need working firmware that:
1. Initializes all sensors and outputs correctly
2. Uses proper libraries for each component
3. Is structured for PlatformIO compilation
4. Can be customized via natural language feedback

---

## The Solution

### Firmware Generation Prompt

A comprehensive system prompt teaches the LLM how to generate production-ready ESP32 firmware:

```typescript
// src/prompts/firmware.ts
export interface FirmwareInput {
  projectName: string
  mcu: { type: 'ESP32-C6'; clockSpeed: number }
  pins: PinAssignment[]
  sensors: SensorConfig[]
  outputs: OutputConfig[]
  preferences: {
    useWiFi: boolean
    useBLE: boolean
    useOTA: boolean
  }
}
```

The prompt includes:
- Standard PlatformIO project structure
- Pin assignment patterns for I2C, SPI, GPIO
- Library recommendations for common sensors (BME280, LIS3DH, etc.)
- Code templates with proper initialization

### Monaco Editor Integration

The FirmwareStageView provides a full code editor experience:

```tsx
// File tree + Monaco editor
<div className="flex min-h-0">
  <FileTree
    nodes={fileTree}
    onSelect={handleSelectFile}
  />
  <Editor
    language={selectedFile.language}
    value={editorContent}
    onChange={handleEditorChange}
    theme="vs-dark"
  />
</div>
```

Features:
- Collapsible file tree (platformio.ini, include/, src/)
- C++ syntax highlighting
- Line numbers
- Auto-layout

### Manual Build Workflow

Since Cloudflare Workers can't run ESP32 compilation (10-second CPU limit, no native binaries), we provide a manual workflow:

1. **Download Source** - ZIP file with complete PlatformIO project
2. **Compile Locally** - User runs `pio run` in their environment
3. **Upload Binary** - Upload .bin file back to PHAESTUS for distribution

```typescript
// Download as ZIP
const handleDownloadSource = async () => {
  const zip = new JSZip()
  const files = flattenFiles(fileTree)

  for (const file of files) {
    zip.file(file.path, file.content)
  }

  // Add README with build instructions
  zip.file('README.md', BUILD_INSTRUCTIONS)

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, 'firmware.zip')
}
```

### AI Modification

Users can request changes via natural language:

```
"add WiFi reconnection logic"
"use FastLED instead of NeoPixel"
"increase sensor read interval to 5 seconds"
```

The modification prompt includes the current code and requested changes, returning updated files.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FirmwareStageView                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Header: Generate | Modify | Download | Upload            │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │ File Tree   │  │ Monaco Editor                           │   │
│  │             │  │                                         │   │
│  │ platformio  │  │  #include <Arduino.h>                   │   │
│  │ ├─ include/ │  │  #include "config.h"                    │   │
│  │ │  └─config │  │                                         │   │
│  │ └─ src/     │  │  void setup() {                         │   │
│  │    └─main   │  │      Serial.begin(115200);              │   │
│  │             │  │      // ...                             │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Footer: ESP32-C6 • Arduino Framework • PlatformIO        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@monaco-editor/react` | Code editor with C++ highlighting |
| `jszip` | Download source as ZIP archive |
| `lucide-react` | File tree icons |

---

## Files Changed

```
frontend/src/
├── prompts/
│   └── firmware.ts                  # New: Firmware generation prompt
├── pages/workspace/
│   └── FirmwareStageView.tsx        # Updated: Full editor implementation
└── db/
    └── schema.ts                    # FirmwareArtifacts, FirmwareFile types
```

---

## Key Decisions

### Why Manual Compilation?

ESP32 compilation requires:
- GCC toolchain (~2GB)
- ESP-IDF SDK
- 30-120 seconds build time

None of this is possible on Cloudflare Workers. Options:
1. **Fly.io Docker container** - Planned for future (Phase 6 in roadmap)
2. **Manual PlatformIO** - Works now, users have full control

We chose the manual approach for immediate functionality while planning a compile server for later.

### Why JSZip?

- Creates ZIP files entirely in the browser
- No server round-trip needed
- Includes proper file structure for PlatformIO
- ~50KB bundle size

### Why Monaco Over CodeMirror?

- Same editor as VS Code (familiar UX)
- Better C++ syntax highlighting
- Built-in line numbers and error underlines
- Already using it for OpenSCAD in enclosure stage

---

## Workspace Navigation

Also added in this update:

1. **Sidebar Workbench Link** - Shows "CURRENT PROJECT" section with Workbench link when viewing a project
2. **Project Cards → Workspace** - Clicking a project now goes directly to the workspace at `/project/:id/spec`
3. **Workbench Badge** - Visual indicator on project cards

---

## What's Next

1. **Phase 8: Multi-Agent Orchestration** - Agents that collaborate across stages
2. **Phase 9: Export & Polish** - Download all artifacts, end-to-end testing
3. **Compile Server (Future)** - Docker-based ESP32 compilation on Fly.io

---

## Summary

| Component | Purpose |
|-----------|---------|
| `firmware.ts` | LLM prompt for ESP32 code generation |
| `FirmwareStageView.tsx` | Monaco editor + file tree + download/upload |
| `jszip` | Browser-side ZIP creation |
| Workspace link | Navigation to project workbench |

The firmware stage now generates complete PlatformIO projects from project specs, provides a full code editor experience, and enables manual compilation with binary upload.
