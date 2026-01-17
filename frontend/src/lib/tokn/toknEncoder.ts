/**
 * TOKN encoder - converts KiCad schematics to TOKN format.
 */

import { Schematic, Component, parseSchematic } from './kicadSch';
import { Netlist, analyzeConnectivity } from './connectivity';

// Type normalization rules
const TYPE_NORMALIZATION: Record<string, string> = {
  'Device:R': 'R',
  'Device:R_Small': 'R',
  'Device:R_US': 'R',
  'Device:R_POT': 'RPOT',
  'Device:C': 'C',
  'Device:C_Small': 'C',
  'Device:C_Polarized': 'CP',
  'Device:C_Polarized_US': 'CP',
  'Device:L': 'L',
  'Device:L_Small': 'L',
  'Device:D': 'D',
  'Device:D_Small': 'D',
  'Device:D_Zener': 'DZ',
  'Device:D_Schottky': 'DS',
  'Device:LED': 'LED',
  'Device:LED_Small': 'LED',
  'Device:Q_NPN_BCE': 'QNPN',
  'Device:Q_NPN_BEC': 'QNPN',
  'Device:Q_NPN_CBE': 'QNPN',
  'Device:Q_NPN_CEB': 'QNPN',
  'Device:Q_NPN_ECB': 'QNPN',
  'Device:Q_NPN_EBC': 'QNPN',
  'Device:Q_PNP_BCE': 'QPNP',
  'Device:Q_PNP_BEC': 'QPNP',
  'Device:Q_PNP_CBE': 'QPNP',
  'Device:Q_PNP_CEB': 'QPNP',
  'Device:Q_PNP_ECB': 'QPNP',
  'Device:Q_PNP_EBC': 'QPNP',
  'Device:Q_NMOS_GDS': 'NMOS',
  'Device:Q_NMOS_GSD': 'NMOS',
  'Device:Q_NMOS_DGS': 'NMOS',
  'Device:Q_NMOS_DSG': 'NMOS',
  'Device:Q_NMOS_SGD': 'NMOS',
  'Device:Q_NMOS_SDG': 'NMOS',
  'Device:Q_PMOS_GDS': 'PMOS',
  'Device:Q_PMOS_GSD': 'PMOS',
  'Device:Q_PMOS_DGS': 'PMOS',
  'Device:Q_PMOS_DSG': 'PMOS',
  'Device:Q_PMOS_SGD': 'PMOS',
  'Device:Q_PMOS_SDG': 'PMOS',
  'Device:Crystal': 'XTAL',
  'Device:Crystal_Small': 'XTAL',
  'Device:Fuse': 'F',
  'Device:Fuse_Small': 'F',
  'Device:Ferrite_Bead': 'FB',
  'Device:Ferrite_Bead_Small': 'FB',
  'Connector:Conn_01x01': 'CONN1',
  'Connector:Conn_01x02': 'CONN2',
  'Connector:Conn_01x03': 'CONN3',
  'Connector:Conn_01x04': 'CONN4',
};

// Footprint shorthand
const FOOTPRINT_SHORTHAND: Record<string, string> = {
  'Resistor_SMD:R_0402_1005Metric': '0402',
  'Resistor_SMD:R_0603_1608Metric': '0603',
  'Resistor_SMD:R_0805_2012Metric': '0805',
  'Resistor_SMD:R_1206_3216Metric': '1206',
  'Capacitor_SMD:C_0402_1005Metric': '0402',
  'Capacitor_SMD:C_0603_1608Metric': '0603',
  'Capacitor_SMD:C_0805_2012Metric': '0805',
  'Capacitor_SMD:C_1206_3216Metric': '1206',
};

/**
 * Normalize a lib_id to a short type code.
 */
export function normalizeType(libId: string): string {
  // Check direct mapping
  if (libId in TYPE_NORMALIZATION) {
    return TYPE_NORMALIZATION[libId];
  }

  // For ICs, extract the part number
  if (libId.includes(':')) {
    const [library, part] = libId.split(':', 2);
    // Skip power symbols
    if (library === 'power') {
      return part;
    }

    // For specific ICs, use the part name
    // Strip common suffixes like package variants
    const cleaned = part.replace(/[-_](I|E|P)[-_]?(SN|SO|P|N|AU|PU)?$/, '');
    return cleaned;
  }

  return libId;
}

/**
 * Normalize a footprint to shorthand.
 */
export function normalizeFootprint(footprint: string): string {
  if (!footprint) {
    return '';
  }

  // Check direct mapping
  if (footprint in FOOTPRINT_SHORTHAND) {
    return FOOTPRINT_SHORTHAND[footprint];
  }

  // Extract the last part of the path
  let fp = footprint;
  if (fp.includes(':')) {
    fp = fp.split(':').pop()!;
  }

  // IPC-7351 format: SOIC127P1030X265-20N -> SOIC-20
  // Pattern: PKG + pitch(3 digits) + P + dimensions + -PINS + suffix
  const ipcMatch = fp.match(/^(SOIC|TSSOP|SSOP|QFP|LQFP|TQFP|QFN|DFN|BGA)\d{2,3}P.*-(\d+)[A-Z]?$/);
  if (ipcMatch) {
    const pkg = ipcMatch[1];
    const pins = ipcMatch[2];
    return `${pkg}-${pins}`;
  }

  // KiCad format: SOIC-8_3.9x4.9mm_P1.27mm -> SOIC-8
  const kicadMatch = fp.match(/^(SOIC|TSSOP|SSOP|QFP|LQFP|TQFP|BGA|QFN|DFN|TO-\d+)[-_](\d+)/);
  if (kicadMatch) {
    const pkg = kicadMatch[1];
    const pins = kicadMatch[2];
    return `${pkg}-${pins}`;
  }

  return fp;
}

/**
 * Check if a value needs to be quoted in TOKN format.
 */
function needsQuoting(value: string): boolean {
  if (!value) {
    return false;
  }
  // Quote if contains comma, quote, backslash, or is reserved word
  if (value.includes(',') || value.includes('"') || value.includes('\\')) {
    return true;
  }
  if (['true', 'false', 'null'].includes(value.toLowerCase())) {
    return true;
  }
  // Quote if looks like a number but isn't meant to be
  if (/^-?\d+\.?\d*$/.test(value)) {
    return false; // Actual numbers don't need quoting
  }
  return false;
}

/**
 * Quote a value if necessary.
 */
function quoteValue(value: string): string {
  if (needsQuoting(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Sort components by reference designator.
 */
function sortComponents(components: Component[]): Component[] {
  return [...components].sort((a, b) => {
    const prefixA = a.reference.replace(/\d+$/, '') || '';
    const prefixB = b.reference.replace(/\d+$/, '') || '';

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB);
    }

    const numMatchA = a.reference.match(/\d+/);
    const numMatchB = b.reference.match(/\d+/);
    const numA = numMatchA ? parseInt(numMatchA[0], 10) : 0;
    const numB = numMatchB ? parseInt(numMatchB[0], 10) : 0;

    return numA - numB;
  });
}

/**
 * Encode a schematic as TOKN format.
 */
export function encodeTokn(sch: Schematic, netlist: Netlist): string {
  const lines: string[] = ['# TOKN v1'];

  if (sch.title) {
    lines.push(`title: ${sch.title}`);
  }

  lines.push('');

  // Components section
  // Sort components by reference
  const components = sortComponents(netlist.components);

  if (components.length > 0) {
    lines.push(`components[${components.length}]{ref,type,value,fp,x,y,w,h,a}:`);
    for (const comp of components) {
      const ref = comp.reference;
      const compType = normalizeType(comp.libId);
      const value = comp.value || '';
      const fp = normalizeFootprint(comp.footprint);
      const angle = comp.angle; // Rotation angle in degrees

      // Calculate center and size from pin positions (more accurate than component origin)
      let x: number, y: number, w: number, h: number;
      if (comp.pins.size > 0) {
        const pinXs = Array.from(comp.pins.values()).map(p => p.x);
        const pinYs = Array.from(comp.pins.values()).map(p => p.y);
        // Use pin bounding box center as component center
        x = (Math.min(...pinXs) + Math.max(...pinXs)) / 2;
        y = (Math.min(...pinYs) + Math.max(...pinYs)) / 2;
        w = Math.max(...pinXs) - Math.min(...pinXs);
        h = Math.max(...pinYs) - Math.min(...pinYs);
      } else {
        x = comp.x;
        y = comp.y;
        w = 0;
        h = 0;
      }

      // Quote values if needed
      const quotedValue = quoteValue(value);
      const quotedFp = quoteValue(fp);

      lines.push(`  ${ref},${compType},${quotedValue},${quotedFp},${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)},${angle.toFixed(0)}`);
    }
  }

  lines.push('');

  // Pins section - list pin definitions for ICs (components with meaningful pin names)
  // Skip simple passives (R, C, L, D, etc.) where pin names aren't informative
  const passiveTypes = new Set(['R', 'C', 'CP', 'L', 'D', 'DZ', 'DS', 'LED', 'F', 'FB']);

  // Group pins by component reference
  const componentPins = new Map<string, [string, string][]>(); // ref -> [[num, name], ...]

  for (const comp of components) {
    const compType = normalizeType(comp.libId);
    if (passiveTypes.has(compType)) {
      continue;
    }

    // Get pin info from lib_symbol
    const libSym = sch.libSymbols.get(comp.libId);

    if (libSym) {
      const pinsForComp: [string, string][] = [];
      for (const pin of libSym.pins) {
        // Include all pins with names (even power/ground - full datasheet info)
        if (pin.name && pin.name !== '~') {
          pinsForComp.push([pin.number, pin.name]);
        }
      }

      if (pinsForComp.length > 0) {
        componentPins.set(comp.reference, pinsForComp);
      }
    }
  }

  // Output pins grouped by component
  if (componentPins.size > 0) {
    // Sort components by reference
    const sortedRefs = Array.from(componentPins.keys()).sort((a, b) => {
      const prefixA = a.replace(/\d+$/, '') || '';
      const prefixB = b.replace(/\d+$/, '') || '';

      if (prefixA !== prefixB) {
        return prefixA.localeCompare(prefixB);
      }

      const numMatchA = a.match(/\d+/);
      const numMatchB = b.match(/\d+/);
      const numA = numMatchA ? parseInt(numMatchA[0], 10) : 0;
      const numB = numMatchB ? parseInt(numMatchB[0], 10) : 0;

      return numA - numB;
    });

    for (const ref of sortedRefs) {
      const pinsList = componentPins.get(ref)!;
      lines.push(`pins{${ref}}[${pinsList.length}]:`);
      for (const [num, name] of pinsList) {
        lines.push(`  ${num},${quoteValue(name)}`);
      }
    }

    lines.push('');
  }

  // Nets section
  if (netlist.nets.length > 0) {
    lines.push(`nets[${netlist.nets.length}]{name,pins}:`);
    for (const net of netlist.nets) {
      const name = quoteValue(net.name);
      const pinsList = net.pins.map(([ref, pinNum]) => `${ref}.${pinNum}`);
      let pinsStr = pinsList.join(',');
      // Quote pins if there are multiple (contains comma)
      if (pinsList.length > 1) {
        pinsStr = `"${pinsStr}"`;
      }

      lines.push(`  ${name},${pinsStr}`);
    }
  }

  lines.push('');

  // Wires section - collect all wire segments with their net names
  const allWires: [string, [number, number][]][] = [];
  for (const net of netlist.nets) {
    for (const wire of net.wires) {
      allWires.push([net.name, wire.points]);
    }
  }

  if (allWires.length > 0) {
    lines.push(`wires[${allWires.length}]{net,pts}:`);
    for (const [netName, points] of allWires) {
      const name = quoteValue(netName);
      // Format points as "x1 y1,x2 y2,..."
      const ptsStr = points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(',');
      lines.push(`  ${name},"${ptsStr}"`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Convert KiCad schematic text to TOKN format.
 */
export function convertToTokn(schematicText: string): string {
  const sch = parseSchematic(schematicText);
  const netlist = analyzeConnectivity(sch);
  return encodeTokn(sch, netlist);
}

// Re-export for convenience
export { parseSchematic } from './kicadSch';
export { analyzeConnectivity } from './connectivity';
