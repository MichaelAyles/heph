<p align="center">
  <img src="frontend/public/logo.png" alt="PHAESTUS" width="120" />
</p>

<h1 align="center">PHAESTUS</h1>

<p align="center"><strong>Hardware design from natural language.</strong></p>

<p align="center">
  <a href="https://phaestus.app">Live App</a> •
  <a href="https://phaestus.app/blog">Dev Blog</a>
</p>

---

A frontend-heavy web app that uses LLMs to design hardware products from natural language. Generates a PRD, designs the circuit (PCB, Gerbers, BOM), creates a parametric enclosure, and generates firmware. Manufacturing file processing runs in the browser. Users can flash devices directly via WebSerial.

## What It Does

1. **Spec** — Feasibility analysis, iterative refinement, product renders, locked specification
2. **PCB** — Block selection from pre-validated modules, grid layout, merged Gerbers/BOM
3. **Enclosure** — OpenSCAD generation, real-time STL preview (WASM)
4. **Firmware** — ESP32-C6 code generation, Monaco editor, cloud compilation
5. **Export** — Manufacturing files, WebSerial flashing

## Scope

**Supported**: ESP32-C6, common sensors (BME280, PIR, etc.), WS2812B LEDs, OLED displays, motor drivers, LiPo/USB/DC power

**Rejected**: FPGA, high voltage (>24V), safety-critical, healthcare, complex RF, precision analog

## Architecture

```
Browser (80% of code)
├── React SPA
├── Gerber/BOM/Panel merging (src/services/)
├── KiCad S-expression parser
└── WebSerial flashing

Cloudflare (thin proxy layer)
├── Pages Functions → LLM APIs, external services
├── D1 → SQLite database
└── R2 → Asset storage

External Services (env vars)
├── PLATFORMIO_SERVICE_URL → Firmware compilation
└── KICAD_SERVICE_URL → KiCad file generation
```

No persistent backend server. Secrets stay server-side via Cloudflare Functions.

## Quick Start

```bash
cd frontend
pnpm install
pnpm dev:full    # Full stack with D1/R2 (port 8788)
```

## Development

```bash
pnpm dev:full     # Full stack
pnpm check        # CI check (typecheck + test + build)
pnpm test:run     # Run tests
pnpm db:migrate   # Run migrations
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS 4, Zustand |
| Backend | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| LLM | OpenRouter |
| Testing | Vitest (486 tests) |

## License

MIT
