# Blog 0001: Frontend Foundation

**Date:** 2025-12-30

---

## Summary

Built the initial frontend for PHAESTUS, an agentic hardware design platform for the Gemini API Developer Competition. Set up the complete project scaffold with React, Vite, TypeScript, Tailwind, and Cloudflare infrastructure.

---

## What We Built

### Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── HomePage.tsx         # Landing page
│   │   ├── NewProjectPage.tsx   # Product description wizard
│   │   ├── ProjectPage.tsx      # Pipeline execution view
│   │   ├── BlocksPage.tsx       # PCB block library browser
│   │   └── SettingsPage.tsx     # LLM provider config
│   ├── components/
│   │   └── Layout.tsx           # Sidebar navigation
│   ├── services/
│   │   └── llm.ts               # OpenRouter/Gemini dual-provider
│   └── db/
│       └── schema.ts            # TypeScript types for D1
├── migrations/
│   ├── 0001_initial.sql         # Core schema
│   └── 0002_seed_blocks.sql     # 21 PCB blocks
├── wrangler.toml                # Cloudflare D1 + R2 config
└── package.json
```

### Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + Vite 7 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| State | Zustand + React Query |
| Routing | React Router 7 |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| LLM | OpenRouter / Gemini API |

### LLM Service

Built a dual-provider LLM service (`src/services/llm.ts`) that supports both OpenRouter (for development flexibility) and direct Gemini API (hackathon requirement):

```typescript
class LLMService {
  private provider: 'openrouter' | 'gemini' = 'openrouter'

  async chat(options: ChatOptions): Promise<ChatResponse>
  async chatStream(options: ChatOptions, callbacks: StreamCallbacks): Promise<void>
}
```

Features:
- Provider toggle at runtime
- Streaming support for both providers
- Automatic message format conversion for Gemini
- Usage tracking (tokens, latency)

### Database Schema

Core tables for the hardware design pipeline:

| Table | Purpose |
|-------|---------|
| `projects` | User projects with specs and status |
| `pcb_blocks` | Pre-validated circuit modules (21 seeded) |
| `conversations` | Chat history per project |
| `system_settings` | LLM provider config, API keys |
| `llm_requests` | Usage tracking |

### PCB Block Library

Seeded 21 validated blocks across 6 categories:

- **MCU**: ESP32-C6 (WiFi 6, BLE 5.3, Zigbee)
- **Power**: LiPo battery, buck converter, AA boost
- **Sensors**: BME280, SHT40, LIS3DH, VEML7700, VL53L0X, PIR
- **Outputs**: WS2812B LED, buzzer, relay, motor driver
- **Connectors**: OLED, buttons, encoder, LCD
- **Utility**: Corner routing, header breakout, bus terminator

Each block defines:
- Grid dimensions (12.7mm units)
- Bus tap connections
- I2C addresses / SPI chip selects
- Power requirements
- Component BOM

### Pages

**HomePage** - Landing with value prop and CTAs

**NewProjectPage** - Text input for product description with example prompts:
- "Battery-powered plant moisture monitor with WiFi alerts"
- "Smart doorbell with motion detection and OLED display"

**ProjectPage** - Pipeline visualization with 6 stages:
1. Requirements extraction
2. Block selection
3. Schematic generation
4. PCB layout
5. Enclosure generation
6. Firmware scaffolding

Includes streaming output display for LLM responses.

**BlocksPage** - Filterable grid of the block library with category sidebar.

**SettingsPage** - LLM provider toggle and API key configuration.

---

## Design Decisions

### Module-Based Hardware Design

AI selects from pre-validated circuit blocks rather than generating novel circuits. This gives:
- ~100% success rate vs ~70% for AI-generated circuits
- Tractable validation (interface type-checking)
- Known work to MVP (build 21 blocks vs open-ended research)

### Deterministic Grid Layout

12.7mm grid with pre-routed bus interfaces eliminates autorouting:
- Guaranteed success (no "autorouter failed" scenarios)
- Predictable board dimensions
- Synergy with parametric enclosures

### Frontend-Only Architecture

Cloudflare edge services instead of backend servers:
- D1 for SQLite database
- R2 for file storage
- Pages Functions for API endpoints
- Single TypeScript codebase

---

## Build Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm db:migrate   # Run D1 migrations
pnpm deploy       # Deploy to Cloudflare Pages
```

---

## Next Steps

1. Wire up LLM to NewProjectPage for actual requirements extraction
2. Implement block selection logic (requirements → matching blocks)
3. Add 3D preview with Three.js
4. Build artifact download system
5. Connect to TOKN for schematic generation
