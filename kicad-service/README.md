# KiCad CLI Microservice

A microservice that generates manufacturing files (Gerbers, STEP, Pick & Place) from KiCad source files using the KiCad CLI.

## Overview

This service accepts `.kicad_sch` and `.kicad_pcb` files and returns:
- **Gerbers ZIP**: All copper layers, silkscreen, solder mask, edge cuts, and drill files
- **STEP file**: 3D model for enclosure design
- **Pick & Place CSV**: Component positions for assembly

## API

### Health Check

```
GET /health
```

Returns service status.

### Process Files

```
POST /process
Content-Type: multipart/form-data

schematic: <file.kicad_sch>
pcb: <file.kicad_pcb>
```

Returns:

```json
{
  "success": true,
  "files": {
    "gerbers": "<base64-encoded-zip>",
    "step": "<base64-encoded-step>",
    "pos": "<base64-encoded-csv>"
  }
}
```

## Local Development

### Quick Start with Docker Compose

The easiest way to run the service locally for development:

```bash
cd kicad-service
npm install
npm run build
docker-compose up -d
```

The service will be available at `http://localhost:3001`.

Check it's running:
```bash
curl http://localhost:3001/health
```

To stop:
```bash
docker-compose down
```

### Rebuild After Code Changes

```bash
npm run build
docker-compose restart
```

### Manual Docker Build

```bash
docker build -t kicad-service .
docker run -p 3001:3000 kicad-service
```

### Native Development (requires KiCad installed)

Prerequisites:
- KiCad 9.0+ installed locally
- Node.js 20+

```bash
npm install
npm run build
npm start
```

## Deployment

### Railway

```bash
railway login
railway init
railway up
```

### Render

Create a new web service pointing to this directory with Docker as the environment.

## Environment Variables

- `PORT`: Server port (default: 3000)
- `SERVICE_AUTH_TOKEN`: Optional bearer token. When set, all endpoints except `/health` require `Authorization: Bearer <token>`.

## KiCad CLI Commands Used

```bash
# Gerbers
kicad-cli pcb export gerbers \
  --output ./out/ \
  --layers "F.Cu,B.Cu,In1.Cu,In2.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts" \
  --use-drill-file-origin \
  board.kicad_pcb

# Drill files
kicad-cli pcb export drill \
  --output ./out/ \
  --format excellon \
  --excellon-units mm \
  board.kicad_pcb

# Pick and Place
kicad-cli pcb export pos \
  --output ./out/positions.csv \
  --format csv \
  --units mm \
  --side both \
  board.kicad_pcb

# STEP 3D model
kicad-cli pcb export step \
  --output ./out/model.step \
  --subst-models \
  board.kicad_pcb
```

## Timeouts

- Gerber/Drill/Pos exports: 60 seconds
- STEP export: 120 seconds (can be slow for complex boards)
