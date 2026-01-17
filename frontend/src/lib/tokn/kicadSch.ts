/**
 * KiCad schematic (.kicad_sch) parser.
 *
 * Extracts components, wires, junctions, and labels from KiCad schematics.
 */

import type { SExpr } from './sexpr';
import { parse, get, getAll, getValue } from './sexpr';

export interface Point {
  x: number;
  y: number;
}

export function pointsEqual(a: Point, b: Point, tolerance: number = 0.0001): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance
  );
}

export function pointHash(p: Point): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
}

export interface Pin {
  number: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  pinType: string;
}

export interface LibSymbol {
  libId: string;
  pins: Pin[];
  isPower: boolean;
}

export interface Component {
  libId: string;
  reference: string;
  value: string;
  footprint: string;
  x: number;
  y: number;
  angle: number;
  mirror: 'x' | 'y' | null;
  unit: number;
  dnp: boolean;
  uuid: string;
  pins: Map<string, Point>;
}

export interface Wire {
  points: Point[];
  uuid: string;
}

export interface Junction {
  x: number;
  y: number;
  uuid: string;
}

export interface Label {
  name: string;
  x: number;
  y: number;
  angle: number;
  labelType: 'local' | 'global' | 'hierarchical';
  uuid: string;
}

export interface Schematic {
  title: string;
  libSymbols: Map<string, LibSymbol>;
  components: Component[];
  wires: Wire[];
  junctions: Junction[];
  labels: Label[];
}

export function parseSchematic(text: string): Schematic {
  const expr = parse(text);
  return parseSchematicExpr(expr);
}

function parseSchematicExpr(expr: SExpr): Schematic {
  if (!Array.isArray(expr) || expr[0] !== 'kicad_sch') {
    throw new Error('Not a valid KiCad schematic');
  }

  const sch: Schematic = {
    title: '',
    libSymbols: new Map(),
    components: [],
    wires: [],
    junctions: [],
    labels: [],
  };

  const titleBlock = get(expr, 'title_block');
  if (titleBlock) {
    sch.title = getValue(titleBlock, 'title') || '';
  }

  const libSymbols = get(expr, 'lib_symbols');
  if (libSymbols) {
    for (const symExpr of getAll(libSymbols, 'symbol')) {
      const libSym = parseLibSymbol(symExpr);
      if (libSym) {
        sch.libSymbols.set(libSym.libId, libSym);
      }
    }
  }

  for (const symExpr of getAll(expr, 'symbol')) {
    const comp = parseComponent(symExpr, sch.libSymbols);
    if (comp) {
      sch.components.push(comp);
    }
  }

  for (const wireExpr of getAll(expr, 'wire')) {
    const wire = parseWire(wireExpr);
    if (wire) {
      sch.wires.push(wire);
    }
  }

  for (const juncExpr of getAll(expr, 'junction')) {
    const junc = parseJunction(juncExpr);
    if (junc) {
      sch.junctions.push(junc);
    }
  }

  for (const labelExpr of getAll(expr, 'label')) {
    const label = parseLabel(labelExpr, 'local');
    if (label) {
      sch.labels.push(label);
    }
  }

  for (const labelExpr of getAll(expr, 'global_label')) {
    const label = parseLabel(labelExpr, 'global');
    if (label) {
      sch.labels.push(label);
    }
  }

  for (const labelExpr of getAll(expr, 'hierarchical_label')) {
    const label = parseLabel(labelExpr, 'hierarchical');
    if (label) {
      sch.labels.push(label);
    }
  }

  return sch;
}

function parseLibSymbol(expr: SExpr[]): LibSymbol | null {
  if (!Array.isArray(expr) || expr.length < 2) {
    return null;
  }

  const libId = expr[1];
  if (typeof libId !== 'string') {
    return null;
  }

  const isPower = get(expr, 'power') !== undefined;

  const pins: Pin[] = [];
  for (const subSym of getAll(expr, 'symbol')) {
    if (Array.isArray(subSym) && subSym.length > 1) {
      for (const pinExpr of getAll(subSym, 'pin')) {
        const pin = parsePin(pinExpr);
        if (pin) {
          pins.push(pin);
        }
      }
    }
  }

  return { libId, pins, isPower };
}

function parsePin(expr: SExpr[]): Pin | null {
  if (!Array.isArray(expr) || expr.length < 3) {
    return null;
  }

  const pinType = typeof expr[1] === 'string' ? expr[1] : 'passive';

  const at = get(expr, 'at');
  if (!at || at.length < 4) {
    return null;
  }

  const x = parseFloat(at[1] as string);
  const y = parseFloat(at[2] as string);
  const angle = at.length > 3 ? parseFloat(at[3] as string) : 0;

  const nameExpr = get(expr, 'name');
  const name = nameExpr && nameExpr.length > 1 && typeof nameExpr[1] === 'string'
    ? nameExpr[1]
    : '';

  const numberExpr = get(expr, 'number');
  const number = numberExpr && numberExpr.length > 1
    ? String(numberExpr[1])
    : '';

  return { number, name, x, y, angle, pinType };
}

function parseComponent(expr: SExpr[], libSymbols: Map<string, LibSymbol>): Component | null {
  if (!Array.isArray(expr)) {
    return null;
  }

  const libIdExpr = get(expr, 'lib_id');
  if (!libIdExpr || libIdExpr.length < 2 || typeof libIdExpr[1] !== 'string') {
    return null;
  }
  const libId = libIdExpr[1];

  const at = get(expr, 'at');
  if (!at || at.length < 3) {
    return null;
  }
  const x = parseFloat(at[1] as string);
  const y = parseFloat(at[2] as string);
  const angle = at.length > 3 ? parseFloat(at[3] as string) : 0;

  let mirror: 'x' | 'y' | null = null;
  const mirrorExpr = get(expr, 'mirror');
  if (mirrorExpr && mirrorExpr.length > 1) {
    const m = mirrorExpr[1];
    if (m === 'x' || m === 'y') {
      mirror = m;
    }
  }

  let unit = 1;
  const unitExpr = get(expr, 'unit');
  if (unitExpr && unitExpr.length > 1) {
    unit = parseInt(unitExpr[1] as string, 10);
  }

  let dnp = false;
  const dnpExpr = get(expr, 'dnp');
  if (dnpExpr && dnpExpr.length > 1) {
    dnp = dnpExpr[1] === 'yes';
  }

  let uuid = '';
  const uuidExpr = get(expr, 'uuid');
  if (uuidExpr && uuidExpr.length > 1 && typeof uuidExpr[1] === 'string') {
    uuid = uuidExpr[1];
  }

  let reference = '';
  let value = '';
  let footprint = '';

  for (const prop of getAll(expr, 'property')) {
    if (prop.length >= 3 && typeof prop[1] === 'string' && typeof prop[2] === 'string') {
      const propName = prop[1];
      const propValue = prop[2];
      if (propName === 'Reference') {
        reference = propValue;
      } else if (propName === 'Value') {
        value = propValue;
      } else if (propName === 'Footprint') {
        footprint = propValue;
      }
    }
  }

  const comp: Component = {
    libId,
    reference,
    value,
    footprint,
    x,
    y,
    angle,
    mirror,
    unit,
    dnp,
    uuid,
    pins: new Map(),
  };

  const libNameExpr = get(expr, 'lib_name');
  const libName = libNameExpr && libNameExpr.length > 1 && typeof libNameExpr[1] === 'string'
    ? libNameExpr[1]
    : null;

  const lookupKey = libName && libSymbols.has(libName) ? libName : libId;
  const libSym = libSymbols.get(lookupKey);

  if (libSym) {
    for (const pin of libSym.pins) {
      const absPos = transformPin(pin.x, pin.y, x, y, angle, mirror);
      comp.pins.set(pin.number, absPos);
    }
  }

  return comp;
}

function transformPin(
  pinX: number,
  pinY: number,
  compX: number,
  compY: number,
  angle: number,
  mirror: 'x' | 'y' | null
): Point {
  let px = pinX;
  let py = -pinY;

  if (mirror === 'x') {
    py = -py;
  } else if (mirror === 'y') {
    px = -px;
  }

  const rad = (-angle * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const rx = px * cosA - py * sinA;
  const ry = px * sinA + py * cosA;

  return { x: compX + rx, y: compY + ry };
}

function parseWire(expr: SExpr[]): Wire | null {
  if (!Array.isArray(expr)) {
    return null;
  }

  const pts = get(expr, 'pts');
  if (!pts) {
    return null;
  }

  const points: Point[] = [];
  for (const xy of getAll(pts, 'xy')) {
    if (xy.length >= 3) {
      points.push({
        x: parseFloat(xy[1] as string),
        y: parseFloat(xy[2] as string),
      });
    }
  }

  let uuid = '';
  const uuidExpr = get(expr, 'uuid');
  if (uuidExpr && uuidExpr.length > 1 && typeof uuidExpr[1] === 'string') {
    uuid = uuidExpr[1];
  }

  return points.length > 0 ? { points, uuid } : null;
}

function parseJunction(expr: SExpr[]): Junction | null {
  if (!Array.isArray(expr)) {
    return null;
  }

  const at = get(expr, 'at');
  if (!at || at.length < 3) {
    return null;
  }

  let uuid = '';
  const uuidExpr = get(expr, 'uuid');
  if (uuidExpr && uuidExpr.length > 1 && typeof uuidExpr[1] === 'string') {
    uuid = uuidExpr[1];
  }

  return {
    x: parseFloat(at[1] as string),
    y: parseFloat(at[2] as string),
    uuid,
  };
}

function parseLabel(expr: SExpr[], labelType: 'local' | 'global' | 'hierarchical'): Label | null {
  if (!Array.isArray(expr) || expr.length < 2) {
    return null;
  }

  const name = expr[1];
  if (typeof name !== 'string') {
    return null;
  }

  const at = get(expr, 'at');
  if (!at || at.length < 3) {
    return null;
  }

  const x = parseFloat(at[1] as string);
  const y = parseFloat(at[2] as string);
  const angle = at.length > 3 ? parseFloat(at[3] as string) : 0;

  let uuid = '';
  const uuidExpr = get(expr, 'uuid');
  if (uuidExpr && uuidExpr.length > 1 && typeof uuidExpr[1] === 'string') {
    uuid = uuidExpr[1];
  }

  return { name, x, y, angle, labelType, uuid };
}
