/**
 * Code Parsing Utilities
 *
 * Extract information from generated code (OpenSCAD, C++, etc.)
 */

/**
 * Extract key dimensions from OpenSCAD code for decision-making.
 * Returns structured dimensions that the orchestrator can reason about.
 */
export function extractEnclosureDimensions(code: string): Record<string, number | string> | null {
  if (!code) return null

  const dimensions: Record<string, number | string> = {}

  // Extract common dimension variables
  const patterns = [
    { name: 'case_w', regex: /case_w\s*=\s*([\d.]+)/ },
    { name: 'case_h', regex: /case_h\s*=\s*([\d.]+)/ },
    { name: 'case_d', regex: /case_d\s*=\s*([\d.]+)/ },
    { name: 'wall', regex: /wall(?:_thickness)?\s*=\s*([\d.]+)/ },
    { name: 'pcb_w', regex: /pcb_w\s*=\s*([\d.]+)/ },
    { name: 'pcb_h', regex: /pcb_h\s*=\s*([\d.]+)/ },
    { name: 'corner_radius', regex: /corner_radius\s*=\s*([\d.]+)/ },
  ]

  for (const { name, regex } of patterns) {
    const match = code.match(regex)
    if (match) {
      dimensions[name] = parseFloat(match[1])
    }
  }

  // Count features
  const buttonHoles = (code.match(/button_hole|btn_.*_pos/g) || []).length
  const usbCutout = code.includes('usb') ? 1 : 0
  const ledHoles = (code.match(/led_hole|led_pos/g) || []).length

  if (buttonHoles) dimensions.buttonHoles = buttonHoles
  if (usbCutout) dimensions.hasUsbCutout = 'yes'
  if (ledHoles) dimensions.ledHoles = ledHoles

  return Object.keys(dimensions).length > 0 ? dimensions : null
}

/**
 * Extract feature information from OpenSCAD code.
 * Identifies cutouts, mounting points, and design features.
 */
export function extractEnclosureFeatures(code: string): Record<string, unknown> | null {
  if (!code) return null

  const features: Record<string, unknown> = {}

  // Count button cutouts
  const buttonMatches = code.match(/button|btn/gi)
  if (buttonMatches) {
    features.buttonCount = buttonMatches.length
  }

  // Check for USB cutout
  if (/usb|type.?c/i.test(code)) {
    features.hasUsbCutout = true
  }

  // Check for LED holes/light pipes
  const ledMatches = code.match(/led|light.?pipe/gi)
  if (ledMatches) {
    features.ledCount = ledMatches.length
  }

  // Check for mounting holes/screw bosses
  const mountMatches = code.match(/mount|screw|boss/gi)
  if (mountMatches) {
    features.hasMountingHoles = true
    features.mountingCount = mountMatches.length
  }

  // Check for sensor openings
  if (/sensor|pir|vent|opening/i.test(code)) {
    features.hasSensorOpenings = true
  }

  // Check for lid/base design
  if (/lid|base|top|bottom/i.test(code)) {
    features.hasLidDesign = true
  }

  // Check for snap fits or other assembly features
  if (/snap|clip|latch|hinge/i.test(code)) {
    features.hasSnapFits = true
  }

  // Identify enclosure style
  if (/rounded|fillet|chamfer/i.test(code)) {
    features.style = 'rounded'
  } else if (/wall.?mount/i.test(code)) {
    features.style = 'wall_mount'
  } else if (/handheld|ergonomic/i.test(code)) {
    features.style = 'handheld'
  } else {
    features.style = 'box'
  }

  return Object.keys(features).length > 0 ? features : null
}
