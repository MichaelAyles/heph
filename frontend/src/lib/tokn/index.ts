/**
 * TOKN TypeScript Implementation
 *
 * Token-Optimised KiCad Notation encoder for converting KiCad schematics
 * to the compact TOKN format.
 */

// Main encoder API
export {
  convertToTokn,
  encodeTokn,
  normalizeType,
  normalizeFootprint,
} from './toknEncoder';

// KiCad schematic parser
export { parseSchematic } from './kicadSch';
export type {
  Point,
  Pin,
  LibSymbol,
  Component,
  Wire,
  Junction,
  Label,
  Schematic,
} from './kicadSch';

// Connectivity analyzer
export { analyzeConnectivity } from './connectivity';
export type {
  WireSegment,
  Net,
  Netlist,
} from './connectivity';

// S-expression parser (low-level)
export {
  parse as parseSExpr,
  get,
  getAll,
  getValue,
} from './sexpr';
export type { SExpr } from './sexpr';
