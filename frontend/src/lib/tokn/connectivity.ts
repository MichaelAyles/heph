/**
 * Connectivity analyzer for KiCad schematics.
 *
 * Builds a net list by tracing wire connections between component pins.
 */

import {
  Schematic,
  Component,
  Point,
  pointHash,
} from './kicadSch';

export interface WireSegment {
  points: [number, number][]; // List of [x, y] coordinates
}

export interface Net {
  name: string;
  pins: [string, string, string][]; // [ref, pin_number, pin_name]
  wires: WireSegment[];
  isPower: boolean;
}

export interface Netlist {
  nets: Net[];
  components: Component[];
}

/**
 * Check if two points are within tolerance of each other.
 */
function pointsMatch(p1: Point, p2: Point, tolerance: number = 0.01): boolean {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

/**
 * Analyze schematic connectivity and build a netlist.
 *
 * Algorithm:
 * 1. Build a graph of all wire segments and junction points
 * 2. Find connected components in this graph (each is a potential net)
 * 3. For each connected component, find all pins that touch it
 * 4. Assign net names from labels or generate anonymous names
 */
export function analyzeConnectivity(sch: Schematic, tolerance: number = 0.01): Netlist {
  // Build point-to-segment mapping
  // Each point can connect to multiple wire segments
  const pointToSegments = new Map<string, number[]>();

  for (let i = 0; i < sch.wires.length; i++) {
    for (const pt of sch.wires[i].points) {
      const key = pointHash(pt);
      if (!pointToSegments.has(key)) {
        pointToSegments.set(key, []);
      }
      pointToSegments.get(key)!.push(i);
    }
  }

  // Build adjacency: which segments connect to which
  const segmentAdj = new Map<number, Set<number>>();

  for (const [, segments] of pointToSegments) {
    // All segments sharing this point are connected
    for (const i of segments) {
      for (const j of segments) {
        if (i !== j) {
          if (!segmentAdj.has(i)) {
            segmentAdj.set(i, new Set());
          }
          segmentAdj.get(i)!.add(j);
        }
      }
    }
  }

  // Also connect segments that share endpoints (wires can chain)
  for (let i = 0; i < sch.wires.length; i++) {
    for (let j = i + 1; j < sch.wires.length; j++) {
      // Check if any endpoint of wire_i matches any endpoint of wire_j
      for (const ptI of sch.wires[i].points) {
        for (const ptJ of sch.wires[j].points) {
          if (pointsMatch(ptI, ptJ, tolerance)) {
            if (!segmentAdj.has(i)) {
              segmentAdj.set(i, new Set());
            }
            if (!segmentAdj.has(j)) {
              segmentAdj.set(j, new Set());
            }
            segmentAdj.get(i)!.add(j);
            segmentAdj.get(j)!.add(i);
          }
        }
      }
    }
  }

  // Find connected components of wire segments using union-find
  const parent = Array.from({ length: sch.wires.length }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) {
      parent[px] = py;
    }
  }

  for (const [i, neighbors] of segmentAdj) {
    for (const j of neighbors) {
      union(i, j);
    }
  }

  // Group segments by their root
  const segmentGroups = new Map<number, number[]>();
  for (let i = 0; i < sch.wires.length; i++) {
    const root = find(i);
    if (!segmentGroups.has(root)) {
      segmentGroups.set(root, []);
    }
    segmentGroups.get(root)!.push(i);
  }

  // For each group, collect all points
  const groupPoints = new Map<number, Set<string>>();
  const groupPointsList = new Map<number, Point[]>();
  for (const [root, segments] of segmentGroups) {
    const pts = new Set<string>();
    const ptsList: Point[] = [];
    for (const segIdx of segments) {
      for (const pt of sch.wires[segIdx].points) {
        const key = pointHash(pt);
        if (!pts.has(key)) {
          pts.add(key);
          ptsList.push(pt);
        }
      }
    }
    groupPoints.set(root, pts);
    groupPointsList.set(root, ptsList);
  }

  // Build pin position to (ref, pin_number, pin_name) mapping
  const pinPositions = new Map<string, [string, string, string][]>();
  for (const comp of sch.components) {
    // Look up pin names from lib_symbol
    const libSym = sch.libSymbols.get(comp.libId);
    const pinNames = new Map<string, string>();
    if (libSym) {
      for (const pin of libSym.pins) {
        pinNames.set(pin.number, pin.name);
      }
    }

    for (const [pinNum, pinPos] of comp.pins) {
      const pinName = pinNames.get(pinNum) || '';
      const key = pointHash(pinPos);
      if (!pinPositions.has(key)) {
        pinPositions.set(key, []);
      }
      pinPositions.get(key)!.push([comp.reference, pinNum, pinName]);
    }
  }

  // Build label position to label name mapping
  const labelPositions = new Map<string, string>();
  for (const label of sch.labels) {
    labelPositions.set(pointHash({ x: label.x, y: label.y }), label.name);
  }

  // For each wire group, find connected pins and labels
  const nets: Net[] = [];
  let anonymousCounter = 1;

  for (const [root, points] of groupPointsList) {
    const pins: [string, string, string][] = [];
    let netName: string | null = null;
    let isPower = false;

    for (const pt of points) {
      // Check for pins at this point (with tolerance)
      for (const [pinKey, pinList] of pinPositions) {
        const [px, py] = pinKey.split(',').map(parseFloat);
        if (pointsMatch(pt, { x: px, y: py }, tolerance)) {
          pins.push(...pinList);
        }
      }

      // Check for labels at this point
      for (const [labelKey, labelName] of labelPositions) {
        const [lx, ly] = labelKey.split(',').map(parseFloat);
        if (pointsMatch(pt, { x: lx, y: ly }, tolerance)) {
          netName = labelName;
        }
      }
    }

    // Check if any connected pin is a power symbol
    for (const [ref, ,] of pins) {
      const comp = sch.components.find(c => c.reference === ref);
      if (comp) {
        const libSym = sch.libSymbols.get(comp.libId);
        if (libSym?.isPower) {
          // Use the value as the net name (e.g., "+5V", "GND")
          netName = comp.value;
          isPower = true;
          break;
        }
      }
    }

    // Remove power symbol pins from the pin list (they define nets, not connections)
    const filteredPins = pins.filter(([ref, ,]) => {
      const comp = sch.components.find(c => c.reference === ref);
      if (comp) {
        const libSym = sch.libSymbols.get(comp.libId);
        return !libSym?.isPower;
      }
      return true;
    });

    // Skip empty nets
    if (filteredPins.length === 0) {
      continue;
    }

    // Assign anonymous name if needed
    if (netName === null) {
      netName = `N${anonymousCounter}`;
      anonymousCounter++;
    }

    // Remove duplicates while preserving order
    const seen = new Set<string>();
    const uniquePins: [string, string, string][] = [];
    for (const pin of filteredPins) {
      const key = `${pin[0]}.${pin[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePins.push(pin);
      }
    }

    // Collect wire segments for this net
    const wireSegments: WireSegment[] = [];
    const segments = segmentGroups.get(root) || [];
    for (const segIdx of segments) {
      const wire = sch.wires[segIdx];
      const segmentPoints: [number, number][] = wire.points.map(p => [p.x, p.y]);
      wireSegments.push({ points: segmentPoints });
    }

    nets.push({ name: netName, pins: uniquePins, wires: wireSegments, isPower });
  }

  // Filter out components that are power symbols
  const realComponents = sch.components.filter(c => {
    const libSym = sch.libSymbols.get(c.libId);
    return !libSym?.isPower;
  });

  // Merge nets with the same name
  const mergedNets = new Map<string, Net>();
  for (const net of nets) {
    if (mergedNets.has(net.name)) {
      // Merge pins and wires into existing net
      const existing = mergedNets.get(net.name)!;
      for (const pin of net.pins) {
        const key = `${pin[0]}.${pin[1]}`;
        const existingKeys = new Set(existing.pins.map(p => `${p[0]}.${p[1]}`));
        if (!existingKeys.has(key)) {
          existing.pins.push(pin);
        }
      }
      existing.wires.push(...net.wires);
      existing.isPower = existing.isPower || net.isPower;
    } else {
      mergedNets.set(net.name, net);
    }
  }

  const sortedNets = Array.from(mergedNets.values());

  // Sort nets: power first, then named, then anonymous
  sortedNets.sort((a, b) => {
    const keyA = netSortKey(a);
    const keyB = netSortKey(b);

    for (let i = 0; i < Math.min(keyA.length, keyB.length); i++) {
      if (keyA[i] < keyB[i]) return -1;
      if (keyA[i] > keyB[i]) return 1;
    }
    return 0;
  });

  // Sort pins within each net
  for (const net of sortedNets) {
    net.pins.sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      const numA = /^\d+$/.test(a[1]) ? parseInt(a[1], 10) : 0;
      const numB = /^\d+$/.test(b[1]) ? parseInt(b[1], 10) : 0;
      if (numA < numB) return -1;
      if (numA > numB) return 1;
      if (a[2] < b[2]) return -1;
      if (a[2] > b[2]) return 1;
      return 0;
    });
  }

  return { nets: sortedNets, components: realComponents };
}

/**
 * Generate sort key for a net.
 */
function netSortKey(net: Net): (number | string)[] {
  const name = net.name;

  if (net.isPower) {
    if (name.startsWith('+')) {
      const match = name.match(/[\d.]+/);
      const voltage = match ? parseFloat(match[0]) : 0;
      return [0, -voltage, name];
    } else if (name === 'GND' || name.startsWith('GND')) {
      return [1, 0, name];
    } else if (name.startsWith('-')) {
      const match = name.match(/[\d.]+/);
      const voltage = match ? parseFloat(match[0]) : 0;
      return [2, voltage, name];
    } else {
      return [0, 0, name];
    }
  } else if (/^N\d+$/.test(name)) {
    // Anonymous nets last
    return [4, parseInt(name.slice(1), 10), name];
  } else {
    // Named nets in between
    return [3, 0, name];
  }
}
