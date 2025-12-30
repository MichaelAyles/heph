<p align="center">
  <img src="branding/logo.png" alt="PHAESTUS" width="120" />
</p>

<h1 align="center">PHAESTUS</h1>

<p align="center"><strong>Forged Intelligence.</strong> Hardware design from natural language.</p>

PHAESTUS transforms specifications into manufacturable hardware:
- KiCad schematics and PCB layouts
- Gerber files for manufacturing
- 3D-printable enclosures (OpenSCAD/STL)
- Firmware scaffolding (ESP32/STM32)
- BOM and documentation

## Quick Start

```bash
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Typography**: IBM Plex Sans / IBM Plex Mono
- **LLM**: Gemini 3.0 Flash (via OpenRouter or direct API)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Hosting**: Cloudflare Pages

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm typecheck    # Type check
pnpm lint         # Lint
pnpm format       # Format
```

## Database

```bash
pnpm db:migrate          # Run migrations locally
pnpm db:migrate:remote   # Run migrations on remote D1
```

## Deployment

```bash
pnpm deploy   # Deploy to Cloudflare Pages
```

## License

MIT
