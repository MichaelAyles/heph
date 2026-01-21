# Blog 41: KiCad on Railway - Automated Manufacturing File Generation

**Date:** 2026-01-20

The block import workflow used to require users to export five different files from KiCad: schematic, PCB, STEP model, Gerbers, and pick-and-place CSV. Each export has its own dialog, its own settings, its own opportunities for error. Today we reduced that to two files by spinning up a KiCad CLI microservice on Railway.

## The Problem: Manual Exports Are Error-Prone

KiCad is excellent CAD software, but exporting manufacturing files is a manual process:

1. **Gerbers**: File → Fabrication Outputs → Gerbers. Select layers, set options, generate.
2. **Drill files**: Separate dialog, different options.
3. **STEP model**: File → Export → STEP. Hope your 3D models are configured.
4. **Pick and Place**: File → Fabrication Outputs → Component Placement. Choose format.

Each step requires the user to remember the correct settings. Use millimeters, not inches. Include all copper layers. Export both PTH and NPTH drill files. Use the drill file origin, not the auxiliary axis.

Get any of these wrong and your boards come back wrong - or don't come back at all.

## The Solution: KiCad CLI in Docker

KiCad 6+ ships with `kicad-cli`, a command-line interface that can do everything the GUI can do. More importantly, it can do it *consistently*:

```bash
# Gerbers - always the same settings
kicad-cli pcb export gerbers \
  --output ./out/ \
  --layers "F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts" \
  --use-drill-file-origin \
  board.kicad_pcb

# Drill files - always Excellon, always millimeters
kicad-cli pcb export drill \
  --output ./out/ \
  --format excellon \
  --excellon-units mm \
  board.kicad_pcb

# Pick and Place - always CSV, always mm, always both sides
kicad-cli pcb export pos \
  --output ./out/positions.csv \
  --format csv \
  --units mm \
  --side both \
  board.kicad_pcb

# STEP - with model substitution for missing 3D models
kicad-cli pcb export step \
  --output ./out/model.step \
  --subst-models \
  board.kicad_pcb
```

The settings are baked into the command. No dialogs, no checkboxes, no "did I remember to select the right layers?"

## Why Railway?

We needed somewhere to run KiCad that isn't the user's machine. Options considered:

**AWS Lambda**: Can't run Docker containers with arbitrary binaries. KiCad needs X11 libraries even in headless mode. Too much wrestling with layers.

**AWS ECS/Fargate**: Works, but requires VPC configuration, load balancers, container registries. Overkill for an internal tool.

**Render**: Good Docker support, but cold starts of 30+ seconds for a service that might run once a day.

**Railway**: Docker deployment in minutes. Scale-to-zero available. Simple environment variables. $5/month for a hobby project.

The Dockerfile ended up straightforward:

```dockerfile
FROM kicad/kicad:9.0

USER root
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

KiCad's official Docker image already has everything needed. We just add Node.js to run a tiny Express server that accepts file uploads and returns generated files.

## The New Workflow

Before:
```
User exports from KiCad: .kicad_sch, .kicad_pcb, .step, gerbers.zip, .pos
         ↓
User uploads 5 files through BlockImportWizard
         ↓
LLM generates block.json
```

After:
```
User uploads: .kicad_sch + .kicad_pcb only
         ↓
Cloudflare forwards to KiCad service on Railway
         ↓
KiCad CLI generates: gerbers.zip, .step, .pos
         ↓
Files stored in R2, LLM generates block.json
```

The user still *can* upload manually-generated files if they want - useful for custom STEP models with proper 3D components. But for quick imports, two files is all you need.

## Architecture

```
┌─────────────────────────┐     ┌────────────────────────────┐
│  Cloudflare Pages       │     │  Railway                   │
│  ───────────────────    │     │  ────────────────────────  │
│  /api/admin/blocks/     │────▶│  Docker: kicad/kicad:9.0   │
│    generate-files       │     │  + Node.js Express server  │
│                         │◀────│                            │
│  Stores results in R2   │     │  POST /process             │
└─────────────────────────┘     │    - accepts .kicad files  │
                                │    - returns base64 files  │
                                └────────────────────────────┘
```

The Cloudflare function acts as a proxy. It receives the KiCad source files from the admin UI, forwards them to Railway, gets back base64-encoded generated files, and stores everything in R2.

Why base64? Multipart responses are annoying. Base64 adds ~33% overhead but keeps the API simple - one JSON response with all the files.

## Formalized Generation Reduces Errors

The key insight isn't "automate the boring stuff." It's that **formalized processes eliminate entire categories of errors**.

When a human exports Gerbers:
- They might forget a layer
- They might use the wrong origin
- They might export with inch units to a mm-expecting fab
- They might forget drill files entirely
- They might use the wrong drill format

When a script exports Gerbers:
- It uses the exact same settings every time
- It never forgets a step
- It never gets tired and makes mistakes
- It's trivially auditable - the settings are in the code

This is the same reason we use block definitions instead of hand-routing circuits. Validated blocks with formal interfaces eliminate wiring errors. Scripted exports with fixed settings eliminate file format errors.

## Limitations

**3D Models**: The STEP export uses `--subst-models` to replace missing 3D models with bounding boxes. If your block uses custom components with custom 3D models, the generated STEP won't have them. You'll need to export locally with your model libraries configured, then upload the STEP manually.

**Processing Time**: Complex boards with many components can take 10-30 seconds to export, especially for STEP. The Railway service has a 60-second timeout.

**Cold Starts**: If the Railway service hasn't been used in a while, the first request may take longer while the container spins up. Subsequent requests are fast.

## What's Next

The immediate next step is updating the block library. We have 20+ blocks defined, but most were imported before this system existed. Running them through the automated pipeline will ensure consistent Gerber generation across all blocks.

Longer term, this same pattern could generate other artifacts:
- Automated DRC reports
- BOM extraction directly from schematics
- PDF schematic exports for documentation
- 3D renders of the assembled board

Having KiCad available as a service opens up possibilities that weren't practical when every operation required a GUI.

---

*Railway deployment: 15 minutes. Dockerfile debugging: 2 hours. Having consistent manufacturing files forever: priceless.*
