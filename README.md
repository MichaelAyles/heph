<p align="center">
  <img src="frontend/public/logo.png" alt="Phaestus" width="120" />
</p>

# Phaestus

Phaestus is a web app that turns a product idea into hardware deliverables:

- specification and feasibility output
- PCB artifacts from validated module blocks
- enclosure geometry
- firmware source and cloud compilation
- export package for manufacturing and flashing

The project is frontend-heavy. Most workflow logic lives in the React app, while Cloudflare Functions handle auth, persistence, and external service/API access.

## What the app does

The workspace runs through five stages:

1. Spec: analyze feasibility, refine requirements, finalize a buildable spec.
2. PCB: select/place validated blocks, merge schematics/PCB outputs, generate manufacturing data.
3. Enclosure: generate OpenSCAD-based enclosure artifacts and previews.
4. Firmware: generate firmware and compile through PlatformIO service.
5. Export: package outputs and support device flashing flow.

## Architecture

- Frontend: React 19 + TypeScript + Vite (`frontend/`)
- Edge/API: Cloudflare Pages Functions (`frontend/functions/`)
- Database: Cloudflare D1 (SQLite)
- Object storage: Cloudflare R2
- LLM orchestration: LangGraph-based graph/node flow in `frontend/src/services/langgraph/`
- External services:
  - `PLATFORMIO_SERVICE_URL` for firmware compilation
  - `KICAD_SERVICE_URL` for KiCad-related generation

## Repository layout

- `frontend/`: main app, API functions, tests, build scripts
- `kicad-service/`: KiCad microservice
- `platformio-service/`: firmware compile microservice
- `kicad_seed_data/`: seed/reference PCB data
- `branding/`: brand assets

## Local development

Prerequisites:

- Node.js 20+
- pnpm 9+

Install and run:

```bash
cd frontend
pnpm install
pnpm dev:full
```

`dev:full` builds and starts local Pages runtime with D1/R2 bindings.

## Useful commands (from `frontend/`)

```bash
pnpm dev           # Vite only
pnpm dev:full      # full local stack (Pages + D1/R2)
pnpm lint
pnpm typecheck
pnpm test:run
pnpm check         # typecheck + tests + build (CI-equivalent)
pnpm build
```

## Environment notes

Configure required secrets and service URLs through Cloudflare/Wrangler env settings used by Pages Functions. Keep API keys server-side; do not expose provider keys to the browser.

## Deployment

Main branch deploys via GitHub Actions to Cloudflare Pages.

Manual deploy (from `frontend/`):

```bash
pnpm build
pnpm exec wrangler pages deploy dist --project-name=phaestus
```

## Constraints and scope

Current flows are optimized around the existing validated block catalog and supported firmware/enclosure toolchain. Ideas outside that catalog or safety-critical/high-voltage domains are intentionally constrained in feasibility and stage routing.

## License

MIT
