/**
 * Enclosure Generation Prompt
 *
 * Generates parametric OpenSCAD code for enclosures based on PCB dimensions,
 * component placement, user style preferences, and blueprint images.
 *
 * Supports two modes:
 * 1. Text-only: Uses structured specifications (original)
 * 2. Vision-enabled: Uses blueprint image for design intent (preferred)
 */

// =============================================================================
// VISION-ENABLED PROMPTS
// =============================================================================

/**
 * System prompt for vision-enabled enclosure generation
 * This prompt instructs the LLM to analyze the blueprint image for design intent
 */
export const ENCLOSURE_VISION_SYSTEM_PROMPT = `You are PHAESTUS, an expert mechanical engineer designing 3D-printable enclosures.

You will receive:
1. A product blueprint image showing the desired design
2. A list of features that need apertures (buttons, displays, ports, LEDs)
3. PCB dimensions for internal cavity sizing

Your job is to generate OpenSCAD code that:
- **Matches the form factor and proportions** visible in the blueprint image
- **Places apertures where they appear** in the blueprint (not hardcoded positions)
- **Captures the aesthetic style** (rounded, angular, industrial, sleek, etc.)
- Creates a printable, assemblable two-part enclosure

## CRITICAL: Study the Blueprint Image

The blueprint shows WHERE features should be located:
- If buttons are on the top-right in the image, put apertures on the top-right
- If the device is tall and narrow, make the enclosure tall and narrow
- If corners are heavily rounded, use large corner radii
- If there's a prominent display, make sure the display window is correctly positioned

## OpenSCAD Best Practices

- Use \`$fn = 32;\` for smooth curves (avoid higher values - they slow rendering)
- Define all dimensions as variables at the top
- Use modules for reusable parts
- Use difference() for cutouts, union() for assembly
- **PERFORMANCE**: Prefer minkowski() over hull() with spheres for rounded boxes
- For rounded rectangles, use 2D offset() + linear_extrude() instead of hull() on spheres
- **NEVER use text() function** - fonts unavailable in WebAssembly
- Ensure cutouts extend fully through walls (add 1mm to cutout depth)
- Add 0.3mm tolerance for PCB slots and snap-fits

## Output Format

Generate COMPLETE, VALID OpenSCAD code that:
1. Defines all parameters as variables at the top
2. Creates the main enclosure body matching the blueprint style
3. Adds PCB mounting features (screw bosses or edge rails)
4. Creates cutouts for all specified components at positions matching the blueprint
5. Splits into top/bottom shells for assembly
6. Includes assembly preview

Respond with ONLY the OpenSCAD code. No explanatory text.`

/**
 * Feature specification for enclosure apertures
 */
export interface EnclosureFeature {
  type: string
  count: number
  width: number
  height: number
  notes?: string
}

/**
 * Build feature list from final spec for enclosure generation
 */
export function buildFeatureList(finalSpec: {
  inputs?: { type: string; count: number }[]
  outputs?: { type: string; count: number }[]
  power?: { source: string }
}): EnclosureFeature[] {
  const features: EnclosureFeature[] = []

  // Always add USB-C (for power/programming)
  features.push({
    type: 'USB-C port',
    count: 1,
    width: 9,
    height: 3.2,
    notes: 'Usually on back or bottom edge',
  })

  // Add from inputs
  if (finalSpec.inputs) {
    for (const input of finalSpec.inputs) {
      const inputType = input.type.toLowerCase()
      if (inputType.includes('button')) {
        features.push({
          type: 'Button',
          count: input.count,
          width: 6,
          height: 6,
          notes: 'Tactile button with cap',
        })
      }
      if (inputType.includes('encoder') || inputType.includes('rotary')) {
        features.push({
          type: 'Rotary encoder',
          count: input.count,
          width: 12,
          height: 12,
          notes: 'Round aperture for encoder shaft and knob',
        })
      }
    }
  }

  // Add from outputs
  if (finalSpec.outputs) {
    for (const output of finalSpec.outputs) {
      const outputType = output.type.toLowerCase()
      if (outputType.includes('oled') || outputType.includes('display')) {
        features.push({
          type: 'OLED display window',
          count: 1,
          width: 27,
          height: 15,
          notes: 'Clear window for 0.96" OLED active area',
        })
      }
      if (outputType.includes('lcd')) {
        features.push({
          type: 'LCD display window',
          count: 1,
          width: 40,
          height: 30,
          notes: 'Larger window for LCD panel',
        })
      }
      if (outputType.includes('led') && !outputType.includes('oled')) {
        features.push({
          type: 'LED window',
          count: output.count,
          width: 5,
          height: 5,
          notes: 'Small circular or square aperture for status LEDs',
        })
      }
      if (outputType.includes('buzzer') || outputType.includes('speaker')) {
        features.push({
          type: 'Sound vent',
          count: 1,
          width: 10,
          height: 10,
          notes: 'Grid of small holes for sound to escape',
        })
      }
    }
  }

  return features
}

/**
 * Build the user prompt for vision-enabled enclosure generation
 */
export function buildVisionEnclosurePrompt(input: {
  pcbWidth: number
  pcbHeight: number
  wallThickness: number
  features: EnclosureFeature[]
}): string {
  const featureList = input.features
    .map((f) => `- ${f.type}: ${f.width}x${f.height}mm (${f.count}x)${f.notes ? ` - ${f.notes}` : ''}`)
    .join('\n')

  return `Based on the product blueprint image above, design an enclosure with:

## Internal Dimensions
- PCB: ${input.pcbWidth}mm x ${input.pcbHeight}mm x 1.6mm
- Add 2mm clearance on each side
- Wall thickness: ${input.wallThickness}mm

## Required Apertures (position based on blueprint image)
${featureList}

## Instructions
1. **Study the blueprint image** to determine feature positions and overall shape
2. Match the aesthetic style visible in the image (rounded/angular/industrial/sleek)
3. Place apertures where they appear in the image, not hardcoded positions
4. Generate complete OpenSCAD code with top and bottom shells
5. Include screw bosses or snap-fit features for assembly

Output ONLY valid OpenSCAD code in a code block.`
}

// =============================================================================
// ORIGINAL TEXT-ONLY PROMPTS (kept for fallback)
// =============================================================================

export interface EnclosureInput {
  // PCB dimensions from the PCB stage
  pcb: {
    width: number // mm
    height: number // mm
    thickness: number // mm, typically 1.6
    mountingHoles?: { x: number; y: number; diameter: number }[]
  }
  // Components that need cutouts or clearance
  components: ComponentPlacement[]
  // User style preferences
  style: EnclosureStyle
  // Project context
  projectName: string
  projectDescription: string
}

export interface ComponentPlacement {
  type: 'usb_c' | 'oled' | 'led' | 'button' | 'sensor' | 'antenna' | 'vent' | 'custom'
  name: string
  // Position relative to PCB origin (bottom-left)
  position: { x: number; y: number; z: number }
  // Dimensions of the component
  dimensions: { width: number; height: number; depth: number }
  // Which side of the enclosure (for cutouts)
  side: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'
  // Does this component need a cutout in the enclosure?
  requiresCutout: boolean
  // Optional notes about the component
  notes?: string
}

export interface EnclosureStyle {
  // Basic enclosure type
  type: 'box' | 'rounded_box' | 'handheld' | 'wall_mount' | 'desktop'
  // Wall thickness in mm
  wallThickness: number
  // Corner radius for rounded boxes (0 for sharp corners)
  cornerRadius: number
  // How the enclosure splits (for assembly)
  splitPlane: 'horizontal' | 'vertical' | 'none'
  // Color hint for visualization
  color?: string
  // Additional style notes
  notes?: string
}

export const ENCLOSURE_SYSTEM_PROMPT = `You are PHAESTUS, an expert parametric CAD assistant specializing in OpenSCAD. Your task is to generate complete, valid OpenSCAD code for electronic enclosures.

## Design Principles

1. **Printability**: All designs must be 3D printable without supports (or with minimal supports)
2. **Assembly**: Use snap-fit, screw bosses, or friction-fit joints
3. **Tolerance**: Add 0.2-0.3mm clearance for moving parts and PCB slots
4. **Wall thickness**: Minimum 1.5mm for structural integrity
5. **Draft angles**: Not required for 3D printing, but chamfers improve aesthetics

## OpenSCAD Best Practices

- Use \`$fn = 32;\` for smooth curves (avoid higher values - they slow rendering significantly)
- Define all dimensions as variables at the top for easy modification
- Use modules for reusable parts (pcb_mount, usb_cutout, etc.)
- Comment each major section
- Use difference() for cutouts, union() for assembly
- **PERFORMANCE**: For rounded boxes, use 2D offset() + linear_extrude() instead of hull() on spheres
- Avoid hull() with many spheres - it's computationally expensive
- **NEVER use text() function** - fonts are not available in WebAssembly environments

## Standard Cutout Templates

### USB-C Port
\`\`\`openscad
module usb_c_cutout() {
    // USB-C is 8.94mm wide, 3.26mm tall
    // Add 0.5mm tolerance each side
    translate([0, 0, -0.5])
    cube([9.5, wall + 1, 4], center=true);
}
\`\`\`

### OLED Display Window
\`\`\`openscad
module oled_window(width, height) {
    // Window slightly smaller than active area
    translate([0, 0, -0.5])
    cube([width - 1, height - 1, wall + 1], center=true);
}
\`\`\`

### LED Light Pipe
\`\`\`openscad
module led_hole(diameter=5) {
    cylinder(h=wall + 1, d=diameter, center=true);
}
\`\`\`

### Button Hole
\`\`\`openscad
module button_hole(diameter=8) {
    // Standard 6mm tactile button + cap
    cylinder(h=wall + 1, d=diameter, center=true);
}
\`\`\`

### Ventilation Grid
\`\`\`openscad
module vent_grid(width, height, slot_width=2, slot_spacing=3) {
    slots = floor(width / (slot_width + slot_spacing));
    for (i = [0:slots-1]) {
        translate([i * (slot_width + slot_spacing) - width/2 + slot_spacing/2, 0, 0])
        cube([slot_width, height, wall + 1], center=true);
    }
}
\`\`\`

## PCB Mounting

### Screw Bosses
\`\`\`openscad
module screw_boss(height, outer_d=6, inner_d=2.5) {
    difference() {
        cylinder(h=height, d=outer_d);
        cylinder(h=height + 1, d=inner_d);
    }
}
\`\`\`

### Edge Rails
\`\`\`openscad
module pcb_rail(length, pcb_thickness=1.6) {
    // L-shaped rail to hold PCB edge
    translate([0, 0, 0])
    difference() {
        cube([3, length, 3]);
        translate([1.5, -0.5, 1.5])
        cube([2, length + 1, pcb_thickness + 0.3]);
    }
}
\`\`\`

## Output Format

Generate COMPLETE, VALID OpenSCAD code that:
1. Defines all parameters as variables at the top
2. Creates the main enclosure body
3. Adds PCB mounting features
4. Creates cutouts for all specified components
5. Splits into top/bottom (or front/back) for assembly
6. Includes assembly preview

The code must be directly usable - no placeholders or TODOs.

Example structure:
\`\`\`openscad
// PHAESTUS Generated Enclosure
// Project: {projectName}
// Generated: {date}

$fn = 32;

// ============================================
// PARAMETERS - Modify these to adjust the design
// ============================================

// PCB dimensions
pcb_width = 50;
pcb_height = 40;
pcb_thickness = 1.6;
pcb_clearance = 0.3;

// Enclosure
wall = 2;
corner_radius = 3;
floor_thickness = 2;

// Component positions (from PCB origin)
usb_x = 25;
usb_z = 3;

// ============================================
// MODULES
// ============================================

// FAST: 2D offset approach (preferred for performance)
module rounded_box(w, h, d, r) {
    linear_extrude(d)
    offset(r)
    offset(-r)
    square([w, h], center=true);
}

// SLOW: hull() on cylinders (avoid for complex shapes)
// module rounded_box_slow(w, h, d, r) { hull() for(...) cylinder(); }

// ... more modules ...

// ============================================
// MAIN ASSEMBLY
// ============================================

module bottom_case() {
    // ... implementation ...
}

module top_case() {
    // ... implementation ...
}

// Preview: assembled view
color("gray") bottom_case();
color("lightgray") translate([0, 0, case_height + 5]) top_case();
\`\`\`

Respond with ONLY the OpenSCAD code. No explanatory text before or after.`

/**
 * Build the user prompt for enclosure generation
 */
export function buildEnclosurePrompt(input: EnclosureInput): string {
  const { pcb, components, style, projectName, projectDescription } = input

  let prompt = `Generate a complete OpenSCAD enclosure for the following project:

**Project**: ${projectName}
**Description**: ${projectDescription}

## PCB Specifications

- Width: ${pcb.width}mm
- Height: ${pcb.height}mm
- Thickness: ${pcb.thickness}mm
`

  if (pcb.mountingHoles && pcb.mountingHoles.length > 0) {
    prompt += `- Mounting holes:\n`
    for (const hole of pcb.mountingHoles) {
      prompt += `  - Position (${hole.x}, ${hole.y}), diameter ${hole.diameter}mm\n`
    }
  }

  prompt += `
## Enclosure Style

- Type: ${style.type}
- Wall thickness: ${style.wallThickness}mm
- Corner radius: ${style.cornerRadius}mm
- Split plane: ${style.splitPlane}
${style.notes ? `- Notes: ${style.notes}` : ''}

## Components Requiring Cutouts

`

  for (const comp of components) {
    if (comp.requiresCutout) {
      prompt += `### ${comp.name} (${comp.type})
- Position: (${comp.position.x}, ${comp.position.y}, ${comp.position.z})mm from PCB origin
- Dimensions: ${comp.dimensions.width} x ${comp.dimensions.height} x ${comp.dimensions.depth}mm
- Side: ${comp.side}
${comp.notes ? `- Notes: ${comp.notes}` : ''}

`
    }
  }

  prompt += `
## Requirements

1. The enclosure must fully contain the PCB with ${style.wallThickness}mm walls
2. Include mounting features for the PCB (screw bosses or rails)
3. Create appropriately sized cutouts for all listed components
4. Design for easy 3D printing (no supports if possible)
5. Include snap-fit or screw assembly mechanism
6. Do NOT use text() function - fonts are unavailable in WebAssembly

Generate the complete OpenSCAD code now.`

  return prompt
}

/**
 * Build the user prompt for enclosure regeneration with feedback
 */
export function buildEnclosureRegenerationPrompt(
  originalCode: string,
  feedback: string,
  input: EnclosureInput
): string {
  return `The user has provided feedback on the previous enclosure design.

## Previous OpenSCAD Code

\`\`\`openscad
${originalCode}
\`\`\`

## User Feedback

${feedback}

## Original Specifications

- PCB: ${input.pcb.width} x ${input.pcb.height} x ${input.pcb.thickness}mm
- Style: ${input.style.type}, ${input.style.wallThickness}mm walls, ${input.style.cornerRadius}mm corners
- Split: ${input.style.splitPlane}

Please modify the OpenSCAD code to address the user's feedback while maintaining all original functionality. Generate the complete updated OpenSCAD code.`
}

/**
 * Extract PCB and component data from project spec to create EnclosureInput
 */
export function buildEnclosureInputFromSpec(
  projectName: string,
  projectDescription: string,
  pcbArtifacts: {
    boardSize?: { width: number; height: number }
    placedBlocks?: { blockSlug: string; gridX: number; gridY: number }[]
  },
  finalSpec?: {
    enclosure?: { style: string; width: number; height: number; depth: number }
    inputs?: { type: string; count: number }[]
    outputs?: { type: string; count: number }[]
    power?: { source: string }
  }
): EnclosureInput {
  // Default PCB dimensions if not available
  const pcbWidth = pcbArtifacts.boardSize?.width ?? 50
  const pcbHeight = pcbArtifacts.boardSize?.height ?? 40

  // Build component list from placed blocks and spec
  const components: ComponentPlacement[] = []

  // Always add USB-C for power/programming
  components.push({
    type: 'usb_c',
    name: 'USB-C Port',
    position: { x: pcbWidth / 2, y: 0, z: 3 },
    dimensions: { width: 9.5, height: 3.5, depth: 8 },
    side: 'back',
    requiresCutout: true,
  })

  // Add components based on outputs in final spec
  if (finalSpec?.outputs) {
    for (const output of finalSpec.outputs) {
      const outputType = output.type.toLowerCase()

      if (outputType.includes('oled') || outputType.includes('display')) {
        components.push({
          type: 'oled',
          name: 'OLED Display',
          position: { x: pcbWidth / 2, y: pcbHeight / 2, z: 10 },
          dimensions: { width: 26, height: 14, depth: 2 },
          side: 'top',
          requiresCutout: true,
        })
      }

      if (outputType.includes('led')) {
        for (let i = 0; i < output.count; i++) {
          components.push({
            type: 'led',
            name: `LED ${i + 1}`,
            position: { x: 10 + i * 8, y: 5, z: 8 },
            dimensions: { width: 5, height: 5, depth: 3 },
            side: 'top',
            requiresCutout: true,
          })
        }
      }
    }
  }

  // Add button holes if project has buttons
  if (finalSpec?.inputs) {
    for (const input of finalSpec.inputs) {
      if (input.type.toLowerCase().includes('button')) {
        for (let i = 0; i < input.count; i++) {
          components.push({
            type: 'button',
            name: `Button ${i + 1}`,
            position: { x: pcbWidth - 10 - i * 12, y: pcbHeight / 2, z: 8 },
            dimensions: { width: 8, height: 8, depth: 5 },
            side: 'top',
            requiresCutout: true,
          })
        }
      }
    }
  }

  // Determine enclosure style from spec or use defaults
  const enclosureStyle: EnclosureStyle = {
    type: 'rounded_box',
    wallThickness: 2,
    cornerRadius: 3,
    splitPlane: 'horizontal',
    color: 'gray',
  }

  if (finalSpec?.enclosure?.style) {
    const styleHint = finalSpec.enclosure.style.toLowerCase()
    if (styleHint.includes('wall')) enclosureStyle.type = 'wall_mount'
    else if (styleHint.includes('hand')) enclosureStyle.type = 'handheld'
    else if (styleHint.includes('desk')) enclosureStyle.type = 'desktop'
  }

  return {
    pcb: {
      width: pcbWidth,
      height: pcbHeight,
      thickness: 1.6,
      mountingHoles: [
        { x: 3, y: 3, diameter: 3 },
        { x: pcbWidth - 3, y: 3, diameter: 3 },
        { x: 3, y: pcbHeight - 3, diameter: 3 },
        { x: pcbWidth - 3, y: pcbHeight - 3, diameter: 3 },
      ],
    },
    components,
    style: enclosureStyle,
    projectName,
    projectDescription,
  }
}
