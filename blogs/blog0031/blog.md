# Blog 31: OpenSCAD Rendering - From 2 Minutes to 2 Seconds

**Date**: January 15, 2026

## The Problem

Clicking "Render" on the enclosure page was painful. A moderately complex design - rounded corners, a few cutouts - took 2 minutes to render. Users would click, wait, wonder if it crashed, maybe click again.

The design in question: a sleek rounded remote enclosure for the AERO-CLICK C6 project.

![Product Blueprint](0031-images/Screenshot%202026-01-15%20at%2023.21.08.png)

The culprit was obvious once I looked at the OpenSCAD code:

```openscad
$fn = 64;

module pill_shape(w, l, h, r) {
    hull() {
        translate([-(w/2-r), -(l/2-r), r]) sphere(r);
        translate([ (w/2-r), -(l/2-r), r]) sphere(r);
        // ... 6 more spheres
    }
}
```

`hull()` on 8 spheres with `$fn=64`. That's computing a convex hull over ~16,000 vertices. Multiple times. Using CGAL, which is notoriously slow for this kind of operation.

## The Investigation

Our renderer used `openscad-wasm` version 0.0.4 from npm. I tried adding `--enable=manifold` to use the faster Manifold geometry kernel:

```typescript
const exitCode = callMain([
  '/input.scad',
  '--enable=manifold',
  '-o',
  '/output.stl',
])
```

Still slow. Checked when the npm package was published: 2022. Manifold wasn't integrated into OpenSCAD until late 2024. The flag was being silently ignored.

## Finding the Solution

The [OpenSCAD Playground](https://github.com/openscad/openscad-playground) renders instantly. What are they doing differently?

Dug into their `libs-config.json`:

```json
{
  "url": "https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip",
  "target": "libs/openscad-wasm"
}
```

They're using a 2025 build, not the ancient npm package. And in their `actions.ts`:

```typescript
const args = [
  scadPath,
  "-o", outFile,
  "--backend=manifold",  // Not --enable=manifold
  "--export-format=binstl",
]
```

Two key differences:
1. **Recent WASM build** with Manifold compiled in
2. **`--backend=manifold`** flag (the 2024+ syntax, not `--enable=manifold`)

## The Fix

Removed the npm package:

```bash
pnpm remove openscad-wasm
```

Downloaded the 2025 build:

```bash
curl -sL "https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip" \
  -o /tmp/openscad-wasm.zip
unzip /tmp/openscad-wasm.zip -d public/openscad/
```

Two files: `openscad.js` (122KB) and `openscad.wasm` (9.2MB).

Updated the renderer to load from the public folder:

```typescript
async function loadOpenSCAD(): Promise<OpenSCADModule> {
  const modulePath = '/openscad/openscad.js'
  const OpenSCADFactory = (await import(/* @vite-ignore */ modulePath)).default

  const module = await OpenSCADFactory({
    noInitialRun: true,
    print: (text: string) => console.log('[OpenSCAD]', text),
    printErr: (text: string) => console.error('[OpenSCAD]', text),
  })

  module.FS.mkdir('/locale')
  return module
}
```

And use the correct flags:

```typescript
const exitCode = module.callMain([
  '/input.scad',
  '-o',
  '/output.stl',
  '--backend=manifold',
  '--export-format=binstl',
])
```

## The Result

Same enclosure design. Same `hull()` on 8 spheres. Renders in ~2 seconds instead of ~2 minutes.

![Enclosure Editor with 3D Preview](0031-images/Screenshot%202026-01-15%20at%2023.20.48.png)

The OpenSCAD code on the left, instant 3D preview on the right. That `$fn = 64` and `pill_shape` module that used to choke the renderer now completes before you can reach for your coffee.

The bundle also got smaller. Before: 13.8MB openscad chunk baked into the JS bundle. After: 9.2MB loaded separately on demand. First paint is faster, and the WASM only loads when someone actually uses the enclosure stage.

## Why Manifold is Fast

CGAL (the old geometry kernel) uses exact arithmetic. Every intersection, every union - computed with arbitrary precision rationals. Mathematically beautiful, computationally brutal.

Manifold uses floating point with topological guarantees. It's not "approximate" - the output is still a valid manifold mesh. It just doesn't waste cycles on precision that gets thrown away when you export to STL anyway.

For `hull()` operations specifically, Manifold's algorithm is fundamentally different. CGAL builds explicit polyhedral representations. Manifold works directly with triangle meshes using spatial data structures optimized for CSG.

Here's the same code running in desktop OpenSCAD for comparison:

![Side-by-side with Desktop OpenSCAD](0031-images/Screenshot%202026-01-15%20at%2023.22.14.png)

The desktop app shows geometry cache stats in the console. With the Manifold backend, both the web and desktop versions now render at comparable speeds.

## What I Learned

1. **npm packages get stale** - The npm ecosystem moves fast, but WASM packages often don't. Check when it was last published.

2. **Look at working examples** - The OpenSCAD Playground does exactly what we need. Reading their code saved hours of debugging.

3. **Command-line flags change** - `--enable=manifold` vs `--backend=manifold` is the difference between "silently ignored" and "100x faster."

4. **Separate large assets** - Loading 13MB of WASM on page load is hostile to users. Load it when needed.

## The Commit

```
- Removed openscad-wasm npm package (2022 build, CGAL only)
+ Added OpenSCAD 2025.03.25 WASM build with Manifold
+ Updated renderer to use --backend=manifold
+ WASM now loaded from /openscad/ on demand
```

If you're using OpenSCAD in the browser and it's slow, check your WASM version. The Manifold backend is a game changer.
