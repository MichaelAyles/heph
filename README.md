<p align="center">
  <img src="frontend/public/logo.png" alt="PHAESTUS" width="120" />
</p>

<h1 align="center">PHAESTUS</h1>

<p align="center"><strong>Forged Intelligence.</strong> Hardware design from natural language.</p>

<p align="center">
  <a href="https://phaestus.app">Live Demo</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a>
</p>

---

PHAESTUS transforms natural language specifications into manufacturable hardware through a guided 5-step process:

1. **Feasibility Analysis** - Scores your idea across categories (communication, processing, power, I/O)
2. **Refinement** - Surfaces questions to lock down open decisions
3. **Blueprints** - Generates product render variations with iterative feedback
4. **Selection** - Pick your favorite design direction
5. **Finalization** - Generates locked spec with detailed BOM

Outputs:
- KiCad schematics and PCB layouts
- Gerber files for manufacturing
- 3D-printable enclosures (OpenSCAD/STL)
- Firmware scaffolding (ESP32/STM32)
- Bill of Materials with sourcing

## Live Demo

**https://phaestus.app**

Contact: contact@phaestus.app

## Scope

PHAESTUS focuses on hobbyist/maker-level hardware. Hard rejections:
- FPGA designs
- High voltage (>24V)
- Safety-critical systems
- Healthcare/medical devices

## Quick Start

```bash
cd frontend
pnpm install
pnpm dev:full    # Full stack with D1/R2 bindings
```

Open http://localhost:8788

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, TypeScript, TailwindCSS, Zustand |
| **Backend** | Cloudflare Pages Functions |
| **Database** | Cloudflare D1 (SQLite) |
| **Storage** | Cloudflare R2 |
| **LLM** | OpenRouter (Gemini 3.0 Flash) |
| **Testing** | Vitest (96%+ coverage) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
├─────────────────────────────────────────────────────────┤
│  Pages (Static)  │  Functions (API)  │  D1  │  R2      │
│  React SPA       │  /api/*           │  DB  │  Assets  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  OpenRouter   │
                    │  (LLM Proxy)  │
                    └───────────────┘
```

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Frontend only (port 5173)
pnpm dev:full     # Full stack (port 8788)
pnpm test         # Run tests
pnpm test:coverage # Run with coverage
pnpm typecheck    # Type check
pnpm lint         # Lint
```

## Database

```bash
pnpm db:migrate          # Run migrations locally
pnpm db:migrate:remote   # Run migrations on production D1
pnpm db:reset            # Reset and re-run all migrations
```

## Deployment

```bash
pnpm deploy   # Build and deploy to Cloudflare Pages
```

Secrets are managed via `wrangler pages secret put <NAME>`.

## Security

- Bcrypt password hashing (auto-migrates from plaintext)
- Session-based auth with sliding expiry
- LLM retry logic with exponential backoff
- Input validation and length limits
- Cost tracking for all LLM requests

## License

MIT
