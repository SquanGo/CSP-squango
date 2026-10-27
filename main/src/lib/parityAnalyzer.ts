// ========================================
// Square-1 parity analysis engine.
// Pure logic extracted from the legacy
// "cales-parity-tracer" library (the DOM
// modal parts are handled by the React layer).
// ========================================

import { normalizeScramble } from './normalizer';
import { chooseBottomStart } from './tracingStart';
import { CSP_PREFERENCES_KEY, CSP_PROGRESS_KEY, readCspObject, updateCspObject } from './storage';
import {
  CORNER_IDENTIFIER,
  CORNER_PARTNER,
  EDGE_PIECES,
  sq1AlgToHex,
  stateToHex,
  type CubeState,
} from './cube';
import { renderExpandedLayerSVG } from './drawScrambleCore';

export interface ColorConfig {
  topLayerMainColor: string;
  topLayerColorFullName: string;
  topLayerColorAbbreviation: string;
  bottomLayerMainColor: string;
  bottomLayerColorFullName: string;
  bottomLayerColorAbbreviation: string;
  frontFaceColorForVisualization: string;
  rightFaceColorForVisualization: string;
  backFaceColorForVisualization: string;
  leftFaceColorForVisualization: string;
}

export const DEFAULT_COLOR_CONFIG: ColorConfig = {
  topLayerMainColor: '#FFD700',
  topLayerColorFullName: 'Yellow',
  topLayerColorAbbreviation: 'Y',
  bottomLayerMainColor: '#FFFFFF',
  bottomLayerColorFullName: 'White',
  bottomLayerColorAbbreviation: 'W',
  frontFaceColorForVisualization: '#CC0000',
  rightFaceColorForVisualization: '#00AA00',
  backFaceColorForVisualization: '#FF8C00',
  leftFaceColorForVisualization: '#0066CC',
};

let colorConfig: ColorConfig = { ...DEFAULT_COLOR_CONFIG };

export function getColorConfig(): ColorConfig {
  return colorConfig;
}

export function setColorConfig(config: Partial<ColorConfig>): void {
  colorConfig = { ...colorConfig, ...config };
}

export const PIECE_LABELS: Record<string, string> = {
  A: 'YOG', B: 'YOG', C: 'YG', D: 'YGR', E: 'YGR', F: 'YR',
  G: 'YRB', H: 'YRB', I: 'YB', J: 'YBO', K: 'YBO', L: 'YO',
  M: 'WR', N: 'WRG', O: 'WRG', P: 'WG', Q: 'WGO', R: 'WGO', S: 'WO',
  T: 'WOB', U: 'WOB', V: 'WB', W: 'WBR', X: 'WBR',
};

const createColorLabelHTML = (str: string): string =>
  str.replace(/[WYGBRO]/g, (m) => `<span class="color-dot ${m}"></span>`);

export const PIECE_LABEL_HTML: Record<string, string> = {};
for (const key of Object.keys(PIECE_LABELS)) {
  PIECE_LABEL_HTML[key] = createColorLabelHTML(PIECE_LABELS[key]);
}

export const SOLVED_EDGES = ['C', 'F', 'I', 'L', 'M', 'P', 'S', 'V'];
export const SOLVED_CORNERS = ['AB', 'DE', 'GH', 'JK', 'NO', 'QR', 'TU', 'WX'];

export function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export function adjustColorBrightness(hexColor: string, percent: number): string {
  const num = parseInt(hexColor.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// Patterns use binary notation: 0 = edge (E), 1 = corner (C).
export const DEFAULT_SHAPE_PATTERNS: Record<string, string> = {
  '01010101': 'Square',
  '00101101': 'Kite',
  '00110011': 'Barrel',
  '00110101': 'Left Fist',
  '00101011': 'Right Fist',
  '00100111': 'Shield',
  '00011011': 'Muffin',
  '00010111': 'Left Pawn',
  '01000111': 'Right Pawn',
  '00001111': 'Scallop',
  '0011111': 'Pair',
  '0101111': 'L-Shape',
  '0111011': 'Line',
  '000000111': '6-0',
  '010000011': 'Right 5-1',
  '000001011': 'Left 5-1',
  '001000011': 'Right 4-2',
  '000010011': 'Left 4-2',
  '000010101': '4-1-1',
  '000100011': '3-3',
  '010010001': '3-1-2',
  '010001001': '3-2-1',
  '001001001': '2-2-2',
  '0000000011': '8-0',
  '0000001001': '6-2',
  '0000100001': '4-4',
  '0000000101': '7-1',
  '0000010001': '5-3',
  '111111': 'Star',
};

function toBinaryPattern(pat: string): string {
  if (/[EC]/.test(pat)) return pat.replace(/E/g, '0').replace(/C/g, '1');
  return pat;
}

function migratePatterns(patterns: Record<string, string>): Record<string, string> {
  const migrated: Record<string, string> = {};
  for (const [pat, name] of Object.entries(patterns)) {
    migrated[toBinaryPattern(pat)] = String(name);
  }
  return migrated;
}

export function loadShapes(): Record<string, string> {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SHAPE_PATTERNS };
  const stored = readCspObject(CSP_PROGRESS_KEY).tracingPositions;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const migrated = migratePatterns(stored as Record<string, string>);
    if (JSON.stringify(migrated) !== JSON.stringify(stored)) {
      updateCspObject(CSP_PROGRESS_KEY, { tracingPositions: migrated });
    }
    return migrated;
  }
  return { ...DEFAULT_SHAPE_PATTERNS };
}

export function saveShapes(shapes: Record<string, string>): void {
  updateCspObject(CSP_PROGRESS_KEY, { tracingPositions: shapes });
}

let shapePatterns = loadShapes();
let shapePatternsSource = readShapesSource();

function readShapesSource(): string | null {
  const tracingPositions = readCspObject(CSP_PROGRESS_KEY).tracingPositions;
  return tracingPositions && typeof tracingPositions === 'object'
    ? JSON.stringify(tracingPositions)
    : null;
}

/** Live patterns; reloads when storage was changed externally (preset/state restore). */
export function getShapePatterns(): Record<string, string> {
  if (
    !shapePatterns ||
    Object.keys(shapePatterns).length === 0 ||
    readShapesSource() !== shapePatternsSource
  ) {
    shapePatterns = loadShapes();
    shapePatternsSource = readShapesSource();
  }
  return shapePatterns;
}

export function setShapePatterns(patterns: Record<string, string>): void {
  shapePatterns = { ...patterns };
  saveShapes(shapePatterns);
  shapePatternsSource = readShapesSource();
}

export interface UtilityState {
  z2Enabled: boolean;
  y2Enabled: boolean;
  flipColorEnabled: boolean;
}

export interface ArrowSettings {
  color: string;
  opacity: number;
  strokeWidth: number;
  radius: number;
}

let z2TracingModeEnabled = (() => {
  return readCspObject(CSP_PREFERENCES_KEY).z2Tracing !== false;
})();

export function getZ2TracingMode(): boolean {
  return z2TracingModeEnabled;
}

export function setZ2TracingMode(enabled: boolean): void {
  z2TracingModeEnabled = enabled;
  updateCspObject(CSP_PREFERENCES_KEY, { z2Tracing: enabled });
}

let parityTracerImageSize = (() => {
  return Number(readCspObject(CSP_PREFERENCES_KEY).ptImageSize) || 280;
})();

export function getParityTracerImageSize(): number {
  return parityTracerImageSize;
}

export function setParityTracerImageSize(size: number): void {
  parityTracerImageSize = size;
  updateCspObject(CSP_PREFERENCES_KEY, { ptImageSize: size });
}

let showCircularArrow = (() => {
  const arrow = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
  return !arrow || typeof arrow !== 'object' || (arrow as { enabled?: boolean }).enabled !== false;
})();

export const DEFAULT_ARROW_SETTINGS: ArrowSettings = {
  color: 'rgba(253, 34, 34, 0.7)',
  opacity: 0.7,
  strokeWidth: 1.6,
  radius: 0.3,
};

let arrowSettings: ArrowSettings = (() => {
  const arrow = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
  return arrow && typeof arrow === 'object'
    ? { ...DEFAULT_ARROW_SETTINGS, ...arrow as Partial<ArrowSettings> }
    : DEFAULT_ARROW_SETTINGS;
})();

export function getShowCircularArrow(): boolean {
  return showCircularArrow;
}

export function setShowCircularArrow(enabled: boolean): void {
  showCircularArrow = enabled;
  const current = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
  updateCspObject(CSP_PREFERENCES_KEY, {
    ptArrow: { ...(current && typeof current === 'object' ? current : {}), enabled },
  });
}

export function getArrowSettings(): ArrowSettings {
  return arrowSettings;
}

export function setArrowSettings(settings: Partial<ArrowSettings>): void {
  arrowSettings = { ...arrowSettings, ...settings };
  const current = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
  updateCspObject(CSP_PREFERENCES_KEY, {
    ptArrow: { ...(current && typeof current === 'object' ? current : {}), ...arrowSettings },
  });
}

export interface EvilnessConfig {
  factor: boolean;
  stringReturn: boolean;
  map: Record<string, boolean>;
}

const defaultEvilness: EvilnessConfig = { factor: false, stringReturn: false, map: {} };
let evilness: EvilnessConfig = { ...defaultEvilness };
let caseNameResolver: ((scramble: string) => string | null) | null = null;

export function setEvilnessConfig(config: Partial<EvilnessConfig>): void {
  evilness = { ...evilness, ...config };
}

export function getEvilnessConfig(): EvilnessConfig {
  return evilness;
}

export function setCaseNameResolver(resolver: ((scramble: string) => string | null) | null): void {
  caseNameResolver = resolver;
}

export function isScrambleEvilInternal(scramble: string): boolean {
  if (!evilness.factor) return false;
  if (!caseNameResolver) return false;
  const caseName = caseNameResolver(scramble);
  if (!caseName) return false;
  return evilness.map[caseName] === true;
}

export function applyUtilityTransformationsToScramble(scramble: string, utility: UtilityState): string {
  let normalized = scramble;
  if (normalizeScramble) {
    normalized = normalizeScramble(scramble);
  }

  let tokens = normalized
    .split(/(\/)/)
    .map((t) => t.trim())
    .filter((t) => t);

  if (utility.flipColorEnabled) tokens.unshift('(6,6)');
  if (utility.y2Enabled) tokens.push('(6,6)');
  if (utility.z2Enabled) {
    tokens.push('/');
    tokens.push('(6,6)');
    tokens.push('/');
  }

  tokens = simplifyTokens(tokens);

  const result = tokens
    .map((tok, i) => {
      if (tok === '/') return '/';
      if (i === 0) return tok;
      return ' ' + tok;
    })
    .join('')
    .replace(/\/\s*\(/g, '/(');

  return result;
}

function simplifyTokens(tokens: string[]): string[] {
  const result = [...tokens];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === '/' && result[i + 1] === '/') {
        result.splice(i, 2);
        changed = true;
        break;
      }
    }
    if (changed) continue;

    for (let i = 0; i < result.length - 1; i++) {
      if (result[i].startsWith('(') && result[i + 1].startsWith('(')) {
        result.splice(i, 2, addSets(result[i], result[i + 1]));
        changed = true;
        break;
      }
    }
    if (changed) continue;

    for (let i = 0; i < result.length; i++) {
      if (result[i] === '(0,0)') {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }

  return result;
}

export function addSets(a: string, b: string): string {
  const m = /\((-?\d+),(-?\d+)\)/.exec(a);
  const n = /\((-?\d+),(-?\d+)\)/.exec(b);
  if (!m || !n) return a;
  let x = parseInt(m[1], 10) + parseInt(n[1], 10);
  let y = parseInt(m[2], 10) + parseInt(n[2], 10);

  const norm = (v: number): number => {
    if (v > 6) v -= 12;
    if (v < -6) v += 12;
    return v;
  };

  x = norm(x);
  y = norm(y);
  return `(${x},${y})`;
}

export interface CornerValidationResult {
  ok: boolean;
  pair?: [string, string];
  reason?: string;
}

export function validateCorners(state: CubeState): CornerValidationResult {
  const pairs: [string, string][] = [
    ['A', 'B'], ['D', 'E'], ['G', 'H'], ['J', 'K'], ['N', 'O'], ['Q', 'R'], ['T', 'U'], ['W', 'X'],
  ];
  for (const [x, y] of pairs) {
    const ix = state.indexOf(x);
    const iy = state.indexOf(y);
    const layerX = Math.floor(ix / 12);
    const layerY = Math.floor(iy / 12);
    if (layerX !== layerY) return { ok: false, pair: [x, y], reason: 'split across layers' };
    const a = ix % 12;
    const b = iy % 12;
    const adjacent = (a + 1) % 12 === b || (b + 1) % 12 === a;
    if (!adjacent) return { ok: false, pair: [x, y], reason: 'separated by other pieces' };
  }
  return { ok: true };
}

export interface ShapeUnit {
  type: 'E' | 'C';
  edge?: string;
  pair?: string;
  rep?: string;
}

export interface BuiltUnits {
  types: string;
  units: ShapeUnit[];
}

export function buildUnits(state: CubeState, start: number): BuiltUnits {
  const units: ShapeUnit[] = [];
  let i = 0;
  while (i < 12) {
    const ch = state[start + i];
    if (EDGE_PIECES.has(ch)) {
      units.push({ type: 'E', edge: ch });
      i += 1;
      continue;
    }
    const nextCh = state[start + ((i + 1) % 12)];
    if (CORNER_PARTNER[ch] === nextCh) {
      units.push({ type: 'C', pair: CORNER_IDENTIFIER[ch], rep: ch });
      i += 2;
    } else {
      units.push({ type: 'C', pair: CORNER_IDENTIFIER[ch] || '??', rep: ch });
      i += 1;
    }
  }
  const types = units.map((u) => u.type).join('');
  return { types, units };
}

const SYMMETRIC_SHAPES: Record<string, number> = {
  Square: 4,
  Barrel: 2,
  '2-2-2': 3,
  '4-4': 2,
  Star: 6,
};

export interface MatchedShape {
  name: string;
  pat: string;
  rot: number;
  originalPat: string;
  symmetryDegree: number;
}

export function matchPattern(typeStr: string): MatchedShape {
  const patterns = getShapePatterns();
  const binaryType = toBinaryPattern(typeStr);

  for (const [pat, name] of Object.entries(patterns)) {
    if (pat.length !== binaryType.length) continue;

    const maxRotations = binaryType.length;
    const rotationOrder = [0];
    for (let distance = 1; distance < maxRotations; distance++) {
      rotationOrder.push(-distance);
      rotationOrder.push(distance);
    }

    for (const rotationAmount of rotationOrder) {
      const normalizedRotation =
        ((rotationAmount % binaryType.length) + binaryType.length) % binaryType.length;
      if (rotateString(binaryType, normalizedRotation) === pat) {
        return {
          name,
          pat,
          rot: normalizedRotation,
          originalPat: pat,
          symmetryDegree: SYMMETRIC_SHAPES[name] || 1,
        };
      }
    }
  }
  return { name: 'Unknown', pat: binaryType, rot: 0, originalPat: binaryType, symmetryDegree: 1 };
}

function rotateString(s: string, k: number): string {
  const n = s.length;
  k = ((k % n) + n) % n;
  return s.slice(k) + s.slice(0, k);
}

export function countPieces(units: ShapeUnit[]): { e: number; c: number; label: string } {
  const e = units.filter((u) => u.type === 'E').length;
  const c = units.length - e;
  return { e, c, label: `${e}E${c}C` };
}

export interface ParityStep {
  name: string;
  result: number;
  hexPerm: string[];
  codenames?: string[];
  isLayer?: boolean;
  topCount?: number;
}

export interface SixStepParity {
  steps: ParityStep[];
  total: number;
  isOdd: boolean;
  evilStep: number | null;
  isOddWithEvil: boolean;
  topUnits: string[];
  botUnits: string[];
  topMatch: MatchedShape;
  botMatch: MatchedShape;
  topTraceRotation: number;
  botTraceRotation: number;
  topBits: string;
  botBits: string;
  wasSwapped: boolean;
}

// hex digit → parity color code (CCW sticker mode)
const hexToColors_ccw: Record<string, string> = {
  '0': 'O', '2': 'B', '4': 'R', '6': 'G',          // top edges
  '8': 'G', 'a': 'R', 'c': 'B', 'e': 'O',          // bottom edges
  '1': 'B', '3': 'R', '5': 'G', '7': 'O',          // top corners CCW
  '9': 'G', 'b': 'R', 'd': 'B', 'f': 'O',          // bottom corners CCW
};
// CW sticker mode
const hexToColors_cw: Record<string, string> = {
  '0': 'O', '2': 'B', '4': 'R', '6': 'G',          // top edges
  '8': 'G', 'a': 'R', 'c': 'B', 'e': 'O',          // bottom edges
  '1': 'O', '3': 'B', '5': 'R', '7': 'G',          // top corners CW
  '9': 'O', 'b': 'G', 'd': 'R', 'f': 'B',          // bottom corners CW
};
export const TOP_HEX = new Set(['0', '1', '2', '3', '4', '5', '6', '7']);
const CORNER_HEX = new Set(['1', '3', '5', '7', '9', 'b', 'd', 'f']);

/**
 * Takes raw sq1AlgToHex output {tlHex, blHex} (each 12 chars, corners doubled).
 * Returns {topUnits, botUnits} as arrays of hex chars (unexpanded, variable length)
 * and {topBits, botBits} as bitstrings for shape matching.
 */
export function hexToUnits(
  tlHex: string,
  blHex: string,
): { topUnits: string[]; botUnits: string[]; topBits: string; botBits: string } {
  function walkLayer(raw: string): { units: string[]; bits: string } {
    // raw is 12 chars from sq1AlgToHex, read right-to-left (undo reversal)
    const units: string[] = [];
    let bits = '';
    let i = raw.length - 1;
    while (i >= 0) {
      const c = raw[i];
      if (CORNER_HEX.has(c)) {
        units.push(c);
        bits += '1';
        i -= 2; // skip the doubled char
      } else {
        units.push(c);
        bits += '0';
        i -= 1;
      }
    }
    return { units, bits };
  }
  const top = walkLayer(tlHex);
  const bot = walkLayer(blHex);
  return {
    topUnits: top.units,
    topBits: top.bits,
    botUnits: bot.units,
    botBits: bot.bits,
  };
}

// Lookup tables instead of algorithmic analysis for speed
const blackEdgeParityMap: Record<string, number> = {
  '0246': 0, '0264': 1, '0426': 1, '0462': 0, '0624': 0, '0642': 1, '2046': 1, '2064': 0, '2406': 0, '2460': 1, '2604': 1, '2640': 0, '4026': 0, '4062': 1, '4206': 1, '4260': 0, '4602': 0, '4620': 1, '6024': 1, '6042': 0, '6204': 0, '6240': 1, '6402': 1, '6420': 0,
};

const whiteEdgeParityMap: Record<string, number> = {
  '8ace': 0, '8aec': 1, '8cae': 1, '8cea': 0, '8eac': 0, '8eca': 1, 'a8ce': 1, 'a8ec': 0, 'ac8e': 0, 'ace8': 1, 'ae8c': 1, 'aec8': 0, 'c8ae': 0, 'c8ea': 1, 'ca8e': 1, 'cae8': 0, 'ce8a': 0, 'cea8': 1, 'e8ac': 1, 'e8ca': 0, 'ea8c': 0, 'eac8': 1, 'ec8a': 1, 'eca8': 0,
};

const blackCornerParityMap: Record<string, number> = {
  '1357': 0, '1375': 1, '1537': 1, '1573': 0, '1735': 0, '1753': 1, '3157': 1, '3175': 0, '3517': 0, '3571': 1, '3715': 1, '3751': 0, '5137': 0, '5173': 1, '5317': 1, '5371': 0, '5713': 0, '5731': 1, '7135': 1, '7153': 0, '7315': 0, '7351': 1, '7513': 1, '7531': 0,
};

const whiteCornerParityMap: Record<string, number> = {
  '9bdf': 1, '9bfd': 0, '9dbf': 0, '9dfb': 1, '9fbd': 1, '9fdb': 0, 'b9df': 0, 'b9fd': 1, 'bd9f': 1, 'bdf9': 0, 'bf9d': 0, 'bfd9': 1, 'd9bf': 1, 'd9fb': 0, 'db9f': 0, 'dbf9': 1, 'df9b': 1, 'dfb9': 0, 'f9bd': 0, 'f9db': 1, 'fb9d': 1, 'fbd9': 0, 'fd9b': 0, 'fdb9': 1,
};

export function getSymmetryOffsetKey(tlHex: string, blHex: string): string {
  return `${tlHex}${blHex}`;
}

// In-memory symmetry click offsets, keyed by hex layer pair (mirrors Refactor's
// window.parityTracerSymmetryOffsets). Reset on reload.
const parityTracerSymmetryOffsets: Record<string, { top: number; bottom: number }> = {};

export function getParityTracerSymmetryOffset(
  offsetKey: string,
): { top: number; bottom: number } {
  if (!parityTracerSymmetryOffsets[offsetKey])
    parityTracerSymmetryOffsets[offsetKey] = { top: 0, bottom: 0 };
  return parityTracerSymmetryOffsets[offsetKey];
}

function symRotation(match: MatchedShape, offset: number, unitLen: number): number {
  if (offset === 0) return 0;
  const piecesPerSymmetry = match.name === 'Star' ? 3 : Math.floor(unitLen / match.symmetryDegree);
  return piecesPerSymmetry * offset;
}


/**
 * O(1) parity pipeline: hex layers → units → shape match → lookup tables.
 * Verbatim port of Refactor's calculateParityFromHex.
 */
export function calculateParityFromHex(
  tlHex: string,
  blHex: string,
  z2Mode: boolean,
  useClockwise: boolean,
  scrambleForEvil?: string,
): SixStepParity {
  const { topUnits, topBits, botUnits, botBits } = hexToUnits(tlHex, blHex);

  const scrambleKey = getSymmetryOffsetKey(tlHex, blHex);
  getParityTracerSymmetryOffset(scrambleKey);

  const topMatch = matchPattern(topBits);
  const botMatch = matchPattern(botBits);

  const topSymOff = getParityTracerSymmetryOffset(scrambleKey).top || 0;
  const botSymOff = getParityTracerSymmetryOffset(scrambleKey).bottom || 0;

  const topRot = (topMatch.rot + symRotation(topMatch, topSymOff, topUnits.length)) % topUnits.length;
  const botSymRotation = symRotation(botMatch, botSymOff, botUnits.length);
  // Bottom start: pattern-derived; symmetric shapes take the valid piece nearest the anchor.
  const botBaseRot =
    botMatch.name === 'Unknown'
      ? botMatch.rot
      : chooseBottomStart(botBits, botMatch.pat, botMatch.rot);
  const botRot = (botBaseRot + botSymRotation) % botUnits.length;

  // rotate units arrays
  const tU = topUnits.slice(topRot).concat(topUnits.slice(0, topRot));
  const bU = botUnits.slice(botRot).concat(botUnits.slice(0, botRot));

  // count edges per layer for z2 swap check
  const topE = tU.filter((c) => !CORNER_HEX.has(c)).length;
  const botE = bU.filter((c) => !CORNER_HEX.has(c)).length;
  const topC = tU.length - topE;
  const botC = bU.length - botE;

  const shouldSwap = z2Mode &&
    ((topE === 2 && topC === 5 && botE === 6 && botC === 3) ||
      (topE === 0 && topC === 6 && botE === 8 && botC === 2));

  const orderedTop = shouldSwap ? bU : tU;
  const orderedBot = shouldSwap ? tU : bU;

  // separate edges and corners in order
  const allEdges: string[] = [];
  const allCorners: string[] = [];
  for (const u of orderedTop) {
    if (CORNER_HEX.has(u)) allCorners.push(u);
    else allEdges.push(u);
  }
  for (const u of orderedBot) {
    if (CORNER_HEX.has(u)) allCorners.push(u);
    else allEdges.push(u);
  }

  const codeMap = useClockwise ? hexToColors_cw : hexToColors_ccw;

  // lines 1-4: trio parity via lookup tables
  const topEdges = allEdges.filter((c) => TOP_HEX.has(c));
  const botEdges = allEdges.filter((c) => !TOP_HEX.has(c));
  const topCorners = allCorners.filter((c) => TOP_HEX.has(c));
  const botCorners = allCorners.filter((c) => !TOP_HEX.has(c));

  const l1 = blackEdgeParityMap[topEdges.join('')];
  const l2 = whiteEdgeParityMap[botEdges.join('')];
  const l3 = blackCornerParityMap[topCorners.join('')];
  const l4 = whiteCornerParityMap[botCorners.join('')];

  // lines 5-6: alternating parity (positions 0,2,4,6 of full ordered arrays)
  const edgeOdd = [allEdges[0], allEdges[2], allEdges[4], allEdges[6]].filter(Boolean);
  const cornerOdd = [allCorners[0], allCorners[2], allCorners[4], allCorners[6]].filter(Boolean);
  const l5tc = edgeOdd.filter((c) => TOP_HEX.has(c)).length;
  const l6tc = cornerOdd.filter((c) => TOP_HEX.has(c)).length;
  const l5 = (l5tc === 1 || l5tc === 3) ? 1 : 0;
  const l6 = (l6tc === 1 || l6tc === 3) ? 1 : 0;

  const evilStep = evilness.factor ? (isScrambleEvilInternal(scrambleForEvil || '') ? 1 : 0) : null;
  const total = l1 + l2 + l3 + l4 + l5 + l6;
  const totalWithEvil = total + (evilStep ?? 0);

  return {
    isOdd: (total % 2) === 1,
    isOddWithEvil: (totalWithEvil % 2) === 1,
    evilStep,
    total,
    steps: [
      { name: `Line 1: ${colorConfig.topLayerColorFullName} Edges`, result: l1, hexPerm: topEdges, codenames: topEdges.map((c) => codeMap[c]) },
      { name: `Line 2: ${colorConfig.bottomLayerColorFullName} Edges`, result: l2, hexPerm: botEdges, codenames: botEdges.map((c) => codeMap[c]) },
      { name: `Line 3: ${colorConfig.topLayerColorFullName} Corners`, result: l3, hexPerm: topCorners, codenames: topCorners.map((c) => codeMap[c]) },
      { name: `Line 4: ${colorConfig.bottomLayerColorFullName} Corners`, result: l4, hexPerm: botCorners, codenames: botCorners.map((c) => codeMap[c]) },
      { name: 'Line 5: Odd Edges', result: l5, hexPerm: edgeOdd, isLayer: true, topCount: l5tc },
      { name: 'Line 6: Odd Corners', result: l6, hexPerm: cornerOdd, isLayer: true, topCount: l6tc },
    ],
    topUnits: tU,
    botUnits: bU,
    topMatch,
    botMatch,
    topTraceRotation: topRot,
    botTraceRotation: botRot,
    topBits,
    botBits,
    wasSwapped: shouldSwap,
  };
}

export interface ClusterSlot {
  type: 'corner' | 'half-corner' | 'edge';
  startLetter: number;
  lettersCount: number;
  label: string;
}

export function buildClusters(shapeArray: number[]): ClusterSlot[] {
  const slots: ClusterSlot[] = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');

  function processLayer(start: number, end: number): void {
    let i = start;
    while (i < end) {
      const isCorner = shapeArray[i] === 1;

      if (isCorner) {
        const nextIdx = ((i - start + 1) % 12) + start;
        if (nextIdx < end && shapeArray[nextIdx] === 1) {
          slots.push({
            type: 'corner',
            startLetter: i,
            lettersCount: 2,
            label: letters[i] + letters[nextIdx],
          });
          i += 2;
        } else {
          slots.push({
            type: 'half-corner',
            startLetter: i,
            lettersCount: 1,
            label: letters[i],
          });
          i += 1;
        }
      } else {
        slots.push({
          type: 'edge',
          startLetter: i,
          lettersCount: 1,
          label: letters[i],
        });
        i += 1;
      }
    }
  }

  processLayer(0, 12);
  processLayer(12, 24);

  return slots;
}

export function encodeState(state: CubeState): string {
  return stateToHex(state);
}

export interface ShapeSVGStyle {
  border: string;
  fill: string;
  startColor: string;
  strokeWidthOuter: number;
  strokeWidthInner: number;
}

/** Theme-variable fallback; callers normally pass the homepage image style. */
const DEFAULT_SHAPE_SVG_STYLE: ShapeSVGStyle = {
  border: 'var(--svg-stroke)',
  fill: 'transparent',
  startColor: 'var(--shape-start, #0fc9cd)',
  strokeWidthOuter: 0.012,
  strokeWidthInner: 0.01,
};

export function generateShapeSVG(
  pattern: string,
  size: number,
  idPrefix: string,
  style: ShapeSVGStyle = DEFAULT_SHAPE_SVG_STYLE,
): string {
  let expanded = '';
  for (const [index, piece] of [...pattern].entries()) {
    if (piece === '0') {
      expanded += index === 0 ? '2' : '0';
    } else {
      expanded += index === 0 ? '31' : '11';
    }
  }

  const svg = renderExpandedLayerSVG(expanded, {
    size,
    showSlice: false,
    showSideColors: false,
    colorScheme: {
      top: style.fill,
      bottom: style.fill,
      front: 'transparent',
      right: 'transparent',
      back: 'transparent',
      left: 'transparent',
      border: style.border,
    },
    piecesColors: {
      edgeColors: {
        '0': { inner: 'top', outer: 'top' },
        '2': { inner: style.startColor, outer: style.startColor },
      },
      cornerColors: {
        '1': { top: 'top', left: 'top', right: 'top' },
        '3': { top: style.startColor, left: style.startColor, right: style.startColor },
      },
    },
    styleSettings: {
      layerRatio: 1,
      strokeWidthOuter: style.strokeWidthOuter,
      strokeWidthInner: style.strokeWidthInner,
    },
  });

  let pieceIndex = 0;
  return svg
    .replace(/<polygon class="sticker"/g, () => {
      const replacement = `<polygon class="shape-piece shape-piece-${idPrefix}" data-piece-index="${pieceIndex}"`;
      pieceIndex += 1;
      return replacement;
    })
    .replace(
      '</svg>',
      `<style>
        .shape-piece { cursor: pointer; transition: all 0.15s ease; }
        .shape-piece:hover { fill: var(--accent-hover) !important; }
        .shape-config-item svg.squan { display: block; margin: 0 auto; width: 100% !important; height: auto !important; max-width: 500px; }
      </style></svg>`,
    );
}

export interface ArrowAngle {
  startAngle: number;
  arcDegrees: number;
}

export function calculateArrowAngle(
  rotationAmount: number,
  unitsArray: string[],
  layerType: 'TOP' | 'BOTTOM',
  patternBits: string,
): ArrowAngle {
  const initialAngle = layerType === 'TOP' ? 90 : 300;
  const endsWithCorner = patternBits.endsWith('1');
  const arcDegrees = endsWithCorner ? 300 : 330;

  let totalRotationDegrees = 0;
  for (let i = 0; i < rotationAmount; i++) {
    const pieceDegrees = CORNER_HEX.has(unitsArray[i]) ? 60 : 30;
    totalRotationDegrees += pieceDegrees;
  }

  const finalAngle = initialAngle - totalRotationDegrees;
  return { startAngle: finalAngle, arcDegrees };
}

export function generateArrowSVG(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleDeg: number,
  arcDegrees: number,
  size: number,
  order?: 1 | 2,
): string {
  if (!showCircularArrow) return '';

  const strokeWidth = size * 0.01 * arrowSettings.strokeWidth;
  const arrowColor = arrowSettings.color;
  const opacity = arrowSettings.opacity;
  const adjustedRadius = radius * arrowSettings.radius;

  const arrowSize = strokeWidth * 3;
  const startDiskRadius = strokeWidth * 1.2;

  const arrowTipExtensionDegrees = (arrowSize / adjustedRadius) * (180 / Math.PI);
  const adjustedArcDegrees = arcDegrees - arrowTipExtensionDegrees;

  const startRad = ((startAngleDeg - 15) * Math.PI) / 180;
  const endRad = ((startAngleDeg - 15 - adjustedArcDegrees) * Math.PI) / 180;

  const startX = centerX + adjustedRadius * Math.cos(startRad);
  const startY = centerY - adjustedRadius * Math.sin(startRad);
  const endX = centerX + adjustedRadius * Math.cos(endRad);
  const endY = centerY - adjustedRadius * Math.sin(endRad);

  const largeArcFlag = arcDegrees >= 180 ? 1 : 0;
  const pathD = `M ${startX} ${startY} A ${adjustedRadius} ${adjustedRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;

  const tangentAngle = endRad - Math.PI / 2;

  const arrowTipX = endX + arrowSize * Math.cos(tangentAngle);
  const arrowTipY = endY - arrowSize * Math.sin(tangentAngle);

  const perpAngle1 = tangentAngle + (2 * Math.PI) / 3;
  const perpAngle2 = tangentAngle - (2 * Math.PI) / 3;

  const arrow1X = endX + arrowSize * 0.5 * Math.cos(perpAngle1);
  const arrow1Y = endY - arrowSize * 0.5 * Math.sin(perpAngle1);
  const arrow2X = endX + arrowSize * 0.5 * Math.cos(perpAngle2);
  const arrow2Y = endY - arrowSize * 0.5 * Math.sin(perpAngle2);

  // Numbered badge replaces the start dot when a trace order is given.
  // Drawn outside the opacity group so it stays solid.
  let badge = '';
  if (order) {
    const r = size * 0.055;
    // Dark base keeps the badge solid; the arrow color is layered on top to match it.
    badge = `
        <circle cx="${startX}" cy="${startY}" r="${r}" fill="var(--trace-badge-base)"opacity="${opacity}"/>
        <circle cx="${startX}" cy="${startY}" r="${r}" fill="${arrowColor}"opacity="${opacity}"/>
        <text x="${startX}" y="${startY}" text-anchor="middle" dominant-baseline="central"
              font-family="system-ui, sans-serif" font-weight="700" font-size="${r * 1.35}"
              fill="var(--trace-badge-fg, #fff)">${order}</text>`;
  }

  return `
        <g opacity="${opacity}">
            <path d="${pathD}"
                  fill="none"
                  stroke="${arrowColor}"
                  stroke-width="${strokeWidth}"
                  stroke-dasharray="${size * 0.008},${size * 0.004}"
                  stroke-linecap="round"/>
            ${order ? '' : `<circle cx="${startX}" cy="${startY}" r="${startDiskRadius}"
                    fill="${arrowColor}" stroke="none"/>`}
            <polygon points="${arrowTipX},${arrowTipY} ${arrow1X},${arrow1Y} ${arrow2X},${arrow2Y}"
                     fill="${arrowColor}" stroke="none"/>
        </g>${badge}
    `;
}

// === FULL PARITY PIPELINE ===

export type CornerMode = 'clockwise' | 'counterclockwise';

/**
 * Full parity pipeline: applies the scramble, resolves each layer's shape
 * orientation, collects the piece orders, and runs the six-step parity check.
 * Returns 'Odd', 'Even', or 'Error'.
 */
export function analyzeParity(
  scrambleText: string,
  cornerMode: CornerMode = 'counterclockwise',
): 'Odd' | 'Even' | 'Error' {
  try {
    const { tlHex, blHex } = sq1AlgToHex(scrambleText);
    const parity = calculateParityFromHex(tlHex, blHex, getZ2TracingMode(), cornerMode === 'clockwise', scrambleText);
    const useEvil = getEvilnessConfig().stringReturn && parity.evilStep !== null;
    return (useEvil ? parity.isOddWithEvil : parity.isOdd) ? 'Odd' : 'Even';
  } catch {
    return 'Error';
  }
}

/**
 * Legacy-compatible `getParityText` from `ParityAnalyzerLib`.
 * Takes the legacy color object ({topColor, bottomColor, frontColor,
 * rightColor, backColor, leftColor}), maps it into the internal ColorConfig
 * and returns 'Odd' | 'Even' | 'Error'.
 *
 * NOTE: layer color NAMES are resolved via getColorName and only affect the
 * human-readable step text, never the parity result itself.
 */
export interface LegacyParityColors {
  topColor: string;
  bottomColor: string;
  frontColor: string;
  rightColor: string;
  backColor: string;
  leftColor: string;
}

export function getColorName(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#000000': 'Black',
    '#474747': 'Black',
    '#FFFFFF': 'White',
    '#FFFF00': 'Yellow',
    '#FFD700': 'Yellow',
  };
  return colorMap[hexColor.toUpperCase()] || 'Top';
}

export function getParityText(
  scrambleText: string,
  colors: LegacyParityColors,
  cornerMode: CornerMode = 'counterclockwise',
): 'Odd' | 'Even' | 'Error' {
  // Always use fresh shapes from storage (mirrors legacy behavior).
  shapePatterns = loadShapes();

  const topName = getColorName(colors.topColor);
  const bottomName = getColorName(colors.bottomColor);
  setColorConfig({
    topLayerMainColor: colors.topColor,
    topLayerColorFullName: topName,
    topLayerColorAbbreviation: topName.charAt(0),
    bottomLayerMainColor: colors.bottomColor,
    bottomLayerColorFullName: bottomName,
    bottomLayerColorAbbreviation: bottomName.charAt(0),
    frontFaceColorForVisualization: colors.frontColor,
    rightFaceColorForVisualization: colors.rightColor,
    backFaceColorForVisualization: colors.backColor,
    leftFaceColorForVisualization: colors.leftColor,
  });

  return analyzeParity(scrambleText, cornerMode);
}
