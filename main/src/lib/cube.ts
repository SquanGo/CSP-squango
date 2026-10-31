// ========================================
// Square-1 core cube primitives.
// Single source of truth for shared state
// manipulation and hex encoding.
// ========================================

export type Piece = string;

/** A cube is a 24-slot array of piece letters (A–X). */
export type CubeState = Piece[];

export interface TurnToken {
  type: 'turn';
  top: number;
  bottom: number;
  slash: boolean;
}

export interface SlashToken {
  type: 'slash';
}

export type MoveToken = TurnToken | SlashToken;

/** Sticker groups per piece letter. */
export const PIECE_LABELS: Record<string, string> = {
  A: 'YOG', B: 'YOG', C: 'YG', D: 'YGR', E: 'YGR', F: 'YR',
  G: 'YRB', H: 'YRB', I: 'YB', J: 'YBO', K: 'YBO', L: 'YO',
  M: 'WR', N: 'WRG', O: 'WRG', P: 'WG', Q: 'WGO', R: 'WGO', S: 'WO',
  T: 'WOB', U: 'WOB', V: 'WB', W: 'WBR', X: 'WBR',
};

/** Letters that represent edges (single stickers). */
export const EDGE_PIECES: ReadonlySet<string> = new Set(['C', 'F', 'I', 'L', 'M', 'P', 'S', 'V']);

/** Which corner each corner letter pairs with in the solved state. */
export const CORNER_PARTNER: Record<string, string> = {
  A: 'B', B: 'A', D: 'E', E: 'D', G: 'H', H: 'G', J: 'K', K: 'J',
  N: 'O', O: 'N', Q: 'R', R: 'Q', T: 'U', U: 'T', W: 'X', X: 'W',
};

/** Sticker group -> hex digit used for compact state encoding. */
export const PIECE_TO_HEX: Record<string, string> = {
  YO: '0', YOG: '77', YG: '6', YGR: '55', YR: '4', YRB: '33',
  YB: '2', YBO: '11', WR: 'a', WRG: 'bb', WG: '8', WGO: '99',
  WO: 'e', WOB: 'ff', WB: 'c', WBR: 'dd',
};

/** Hex digit -> sticker group (inverse of PIECE_TO_HEX). */
export const HEX_TO_PIECE: Record<string, string> = {
  '0': 'YO', '77': 'YOG', '6': 'YG', '55': 'YGR', '4': 'YR', '33': 'YRB',
  '2': 'YB', '11': 'YBO', 'a': 'WR', 'bb': 'WRG', '8': 'WG', '99': 'WGO',
  'e': 'WO', 'ff': 'WOB', 'c': 'WB', 'dd': 'WBR',
};

/** Canonical identifier (pair name) for each corner letter. */
export const CORNER_IDENTIFIER: Record<string, string> = {
  A: 'AB', B: 'AB', D: 'DE', E: 'DE', G: 'GH', H: 'GH', J: 'JK', K: 'JK',
  N: 'NO', O: 'NO', Q: 'QR', R: 'QR', T: 'TU', U: 'TU', W: 'WX', X: 'WX',
};

// === ROTATION HELPERS ===

export function rotateString(str: string, k: number): string {
  const n = str.length;
  const rot = ((k % n) + n) % n;
  return str.slice(rot) + str.slice(0, rot);
}

export function rotateArray<T>(arr: T[], k: number): T[] {
  const n = arr.length;
  const rot = ((k % n) + n) % n;
  return arr.slice(rot).concat(arr.slice(0, rot));
}

// === CORE STATE FUNCTIONS ===

export function createSolvedState(): CubeState {
  return 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');
}

/** Rotates a contiguous section of a cube state in place. */
export function rotateSection(arr: CubeState, start: number, len: number, k: number): void {
  const n = ((k % len) + len) % len;
  if (n === 0) return;
  const seg = arr.slice(start, start + len);
  const out: Piece[] = [];
  for (let i = 0; i < len; i++) out[(i + n) % len] = seg[i];
  for (let i = 0; i < len; i++) arr[start + i] = out[i];
}

/** Swaps the top and bottom layers (the "/" move) in place. */
export function sliceSwap(arr: CubeState): void {
  for (let i = 0; i < 6; i++) [arr[i], arr[12 + i]] = [arr[12 + i], arr[i]];
}

/**
 * Lazily parses a Square-1 scramble string into move tokens.
 * Handles whitespace, "(a,b)", "a,b" and "/" syntax.
 */
export function* tokenizeScramble(s: string): Generator<MoveToken, void, undefined> {
  let i = 0;
  const len = s.length;
  const whitespace = /\s/;
  const integer = /^([+-]?\d+)/;
  const skip = () => {
    while (i < len && whitespace.test(s[i])) i++;
  };

  while (i < len) {
    skip();
    if (i >= len) break;
    const ch = s[i];
    if (ch === '(') {
      i++;
      skip();
      let m = s.slice(i).match(integer);
      if (!m) {
        i++;
        continue;
      }
      const top = +m[1];
      i += m[1].length;
      skip();
      if (s[i] === ',') i++;
      skip();
      m = s.slice(i).match(integer);
      if (!m) {
        i++;
        continue;
      }
      const bottom = +m[1];
      i += m[1].length;
      skip();
      if (s[i] === ')') i++;
      skip();
      const slash = s[i] === '/';
      if (slash) i++;
      yield { type: 'turn', top, bottom, slash };
    } else if (ch === '/') {
      i++;
      yield { type: 'slash' };
    } else {
      i++;
    }
  }
}

/** Applies a scramble string to a cube state (defaults to solved) and returns it. */
export function applyScramble(scr: string, state?: CubeState): CubeState {
  const current = state ?? createSolvedState();
  for (const token of tokenizeScramble(scr)) {
    if (token.type === 'turn') {
      // Legacy port note: legacy/js/tools/utils.js:109-110 read the move amounts as
      //   const top = tok.t || tok.top;
      //   const bot = tok.b || tok.bottom;
      // Because 0 is falsy, a (x,0)/(0,x) move silently became undefined, writing
      // NaN entries into the state and corrupting the parity result in the legacy
      // app. The tokenizer here always yields numeric amounts, so 0 applies cleanly.
      rotateSection(current, 0, 12, token.top);
      rotateSection(current, 12, 12, token.bottom);
      if (token.slash) sliceSwap(current);
    } else {
      sliceSwap(current);
    }
  }
  return current;
}

export function scrambleToState(scr: string): CubeState {
  return applyScramble(scr);
}

/** Hex-encodes a cube state as "topHex|bottomHex". Returns an error message if invalid. */
export function stateToHex(state: CubeState): string {
  const topPieces: string[] = [];
  const bottomPieces: string[] = [];
  let idx = 0;

  while (idx < 12) {
    const ch = state[idx];
    if (EDGE_PIECES.has(ch)) {
      topPieces.push(PIECE_LABELS[ch]);
      idx++;
    } else {
      const nextCh = state[(idx + 1) % 12];
      if (CORNER_PARTNER[ch] === nextCh) {
        topPieces.push(PIECE_LABELS[ch]);
        idx += 2;
      } else {
        return 'Error: Invalid corner pairing in top layer';
      }
    }
  }

  idx = 12;
  while (idx < 24) {
    const ch = state[idx];
    if (EDGE_PIECES.has(ch)) {
      bottomPieces.push(PIECE_LABELS[ch]);
      idx++;
    } else {
      const nextCh = state[12 + ((idx - 12 + 1) % 12)];
      if (CORNER_PARTNER[ch] === nextCh) {
        bottomPieces.push(PIECE_LABELS[ch]);
        idx += 2;
      } else {
        return 'Error: Invalid corner pairing in bottom layer';
      }
    }
  }

  const topHex = topPieces.map((p) => PIECE_TO_HEX[p] || '?').join('');
  const bottomHex = bottomPieces.map((p) => PIECE_TO_HEX[p] || '?').join('');

  if (topHex.includes('?') || bottomHex.includes('?')) return 'Error: Unknown piece mapping';
  if (topHex.length !== 12 || bottomHex.length !== 12) return 'Error: Invalid hex length';

  const leftTopReversed = topHex.split('').reverse().join('');
  const rightBottom1Reversed = bottomHex.slice(0, 6).split('').reverse().join('');
  const rightBottom2Reversed = bottomHex.slice(6, 12).split('').reverse().join('');

  return `${leftTopReversed}|${rightBottom1Reversed}${rightBottom2Reversed}`;
}

export function scrambleToHex(scr: string): string {
  return stateToHex(scrambleToState(scr));
}

/** Inverts a scramble string: reverses the move order and negates every angle. */
export function invertScramble(scrambleString: string): string {
  if (!scrambleString) return scrambleString;
  const str = String(scrambleString).trim();
  const parts = str.split('/');
  const reversed = parts.slice().reverse();
  const invertNum = (v: string): string => {
    const num = parseInt(v);
    if (isNaN(num)) return v;
    const inv = ((-num) % 12 + 12) % 12;
    return String(inv > 6 ? inv - 12 : inv);
  };
  const inverted = reversed.map((part) => {
    part = part.trim();
    const turnMatch = part.match(/\(([^)]+)\)/);
    if (turnMatch) {
      const values = turnMatch[1].split(',').map((v) => v.trim());
      return '(' + values.map(invertNum).join(',') + ')';
    }
    if (part.includes(',')) {
      const values = part.split(',').map((v) => v.trim());
      return values.map(invertNum).join(',');
    }
    return part;
  });
  return inverted.join('/');
}

// === SHAPE CUBIE CLASS ===

/** A full Square-1 cubie represented as four packed 24-bit registers. */
export class Square1Cubie {
  ul = 0x011233;
  ur = 0x455677;
  dl = 0x998bba;
  dr = 0xddcffe;
  ml = 0;

  toString(): string {
    return (
      this.ul.toString(16).padStart(6, '0') +
      this.ur.toString(16).padStart(6, '0') +
      '|/'.charAt(this.ml) +
      this.dl.toString(16).padStart(6, '0') +
      this.dr.toString(16).padStart(6, '0')
    );
  }

  setPiece(idx: number, value: number): void {
    if (idx < 6) {
      this.ul &= ~(0xf << ((5 - idx) << 2));
      this.ul |= value << ((5 - idx) << 2);
    } else if (idx < 12) {
      this.ur &= ~(0xf << ((11 - idx) << 2));
      this.ur |= value << ((11 - idx) << 2);
    } else if (idx < 18) {
      this.dl &= ~(0xf << ((17 - idx) << 2));
      this.dl |= value << ((17 - idx) << 2);
    } else {
      this.dr &= ~(0xf << ((23 - idx) << 2));
      this.dr |= value << ((23 - idx) << 2);
    }
  }

  pieceAt(idx: number): number {
    let value: number;
    if (idx < 6) {
      value = this.ul >> ((5 - idx) << 2);
    } else if (idx < 12) {
      value = this.ur >> ((11 - idx) << 2);
    } else if (idx < 18) {
      value = this.dl >> ((17 - idx) << 2);
    } else {
      value = this.dr >> ((23 - idx) << 2);
    }
    return value & 0xf;
  }
}

// === SHAPE INDEX ===

export const HALF_LAYER_SHAPES = [0, 3, 6, 12, 15, 24, 27, 30, 48, 51, 54, 60, 63];

let validShapeIndices: number[] | null = null;

/** Builds the table of all valid shape values (16 pieces set). */
export function initShapes(): number[] {
  if (validShapeIndices) return validShapeIndices;
  const shapes: number[] = [];
  for (let i = 0; i < 28561; i++) {
    const dr = HALF_LAYER_SHAPES[i % 13];
    const dl = HALF_LAYER_SHAPES[Math.floor(i / 13) % 13];
    const ur = HALF_LAYER_SHAPES[Math.floor(Math.floor(i / 13) / 13) % 13];
    const ul = HALF_LAYER_SHAPES[Math.floor(Math.floor(Math.floor(i / 13) / 13) / 13)];
    const value = (ul << 18) | (ur << 12) | (dl << 6) | dr;

    let bitCount = 0;
    let temp = value;
    while (temp) {
      bitCount += temp & 1;
      temp >>= 1;
    }

    if (bitCount === 16) {
      shapes.push(value);
    }
  }
  validShapeIndices = shapes;
  return shapes;
}

/** Creates a random cubie with the given shape index (random piece permutation). */
export function cubeFromShape(shapeIndex: number): Square1Cubie {
  const shapes = initShapes();
  const cubie = new Square1Cubie();
  const shape = shapes[shapeIndex];
  let corner = 0x01234567 << 1 | 0x11111111;
  let edge = 0x01234567 << 1;
  let cornerCount = 8;
  let edgeCount = 8;

  for (let i = 0; i < 24; i++) {
    if (((shape >> i) & 1) === 0) {
      const rnd = Math.floor(Math.random() * edgeCount) << 2;
      cubie.setPiece(23 - i, (edge >> rnd) & 0xf);
      const mask = (1 << rnd) - 1;
      edge = (edge & mask) + ((edge >> 4) & ~mask);
      edgeCount--;
    } else {
      const rnd = Math.floor(Math.random() * cornerCount) << 2;
      cubie.setPiece(23 - i, (corner >> rnd) & 0xf);
      cubie.setPiece(22 - i, (corner >> rnd) & 0xf);
      const mask = (1 << rnd) - 1;
      corner = (corner & mask) + ((corner >> 4) & ~mask);
      cornerCount--;
      i++;
    }
  }
  cubie.ml = Math.floor(Math.random() * 2);
  return cubie;
}

export function shapeIndexToHex(shapeIndex: number): string {
  const cube = cubeFromShape(shapeIndex);
  return cube.toString().replace('/', '|');
}

// === HEX SCRAMBLE PARSING ===

interface ParsedMove {
  type: 'twist' | 'turn';
  top?: number;
  bottom?: number;
}

/** Parses a scramble into move primitives (twist or turn with top/bottom angles). */
function parseScramble(scramble: string): ParsedMove[] {
  const moves: ParsedMove[] = [];
  let i = 0;
  while (i < scramble.length) {
    const char = scramble[i];
    if (char === '/' || char === '\\') {
      moves.push({ type: 'twist' });
      i++;
    } else if (char === '(' || char === '-' || /\d/.test(char)) {
      let moveStr = '';
      let parenDepth = 0;
      while (i < scramble.length) {
        const c = scramble[i];
        if (c === '(') parenDepth++;
        if (c === ')') parenDepth--;
        if (c === '/' || c === '\\') break;
        if ((c === ',' || c === '-' || /\d/.test(c) || c === '(' || c === ')') && parenDepth >= 0) {
          moveStr += c;
        }
        i++;
        if (parenDepth === 0 && moveStr.includes(',')) break;
      }
      const cleaned = moveStr.replace(/[()]/g, '').trim();
      if (cleaned.includes(',')) {
        const [top, bottom] = cleaned.split(',').map((n) => parseInt(n.trim()));
        moves.push({ type: 'turn', top, bottom });
      }
    } else {
      i++;
    }
  }
  return moves;
}

/** Swaps the top half of the layers to represent a "/" move on hex strings. */
function twistTopLayers(tlHex: string, blHex: string): { tlHex: string; blHex: string } {
  return {
    tlHex: tlHex.slice(0, 6) + blHex.slice(0, 6),
    blHex: tlHex.slice(6) + blHex.slice(6),
  };
}

/** Rotates a hex layer string by a number of slots. */
function cycleLayerLeft(hex: string, places: number): string {
  const normalized = ((places % 12) + 12) % 12;
  return hex.slice(normalized) + hex.slice(0, normalized);
}

/** Applies a scramble to hex-encoded layers and returns the resulting layers. */
export function sq1AlgToHex(scramble: string): { tlHex: string; blHex: string } {
  let tlHex = '011233455677';
  let blHex = '998bbaddcffe';
  const moves = parseScramble(scramble);
  for (const move of moves) {
    if (move.type === 'twist') {
      const result = twistTopLayers(tlHex, blHex);
      tlHex = result.tlHex;
      blHex = result.blHex;
    } else if (move.type === 'turn') {
      tlHex = cycleLayerLeft(tlHex, move.top ?? 0);
      blHex = cycleLayerLeft(blHex, move.bottom ?? 0);
    }
  }
  return { tlHex, blHex };
}

const CORNER_HEX_DIGITS = ['1', '3', '5', '7', '9', 'b', 'd', 'f'];

/** Resolves the shape index (0–3677) for a hex-encoded layer pair. */
export function getShapeIndexFromHex(tlHex: string, blHex: string): number {
  const hexCode = tlHex + '|' + blHex;
  if (hexCode.length !== 25) {
    throw new Error('Invalid hex format - needs 25 characters!');
  }
  const shapeArray = new Array<number>(24);
  let scrambleIdx = 0;
  for (let i = 0; i < 12; i++) {
    if (scrambleIdx === 12) scrambleIdx++;
    const piece = hexCode[scrambleIdx];
    shapeArray[i] = CORNER_HEX_DIGITS.includes(piece.toLowerCase()) ? 1 : 0;
    scrambleIdx++;
  }
  scrambleIdx = 13;
  for (let i = 12; i < 24; i++) {
    const piece = hexCode[scrambleIdx];
    shapeArray[i] = CORNER_HEX_DIGITS.includes(piece.toLowerCase()) ? 1 : 0;
    scrambleIdx++;
  }
  let shapeValue = 0;
  for (let i = 0; i < 24; i++) {
    shapeValue |= shapeArray[23 - i] << i;
  }
  const shapeIndex = initShapes().indexOf(shapeValue);
  if (shapeIndex === -1) {
    throw new Error('Invalid shape - not found in shape index array');
  }
  return shapeIndex;
}

// === ALG TO SHAPE INDEX PIPELINE ===

export interface AlgShapeAnalysis {
  original: string;
  inverted: string;
  tlHex: string;
  blHex: string;
  shapeIndex: number;
}

/**
 * Analyzes an algorithm string to determine the cubeshape it produces
 * (inverting internally so the input reads as a solution).
 */
export function algToShapeIndex(scrambleText: string): AlgShapeAnalysis {
  const invertedScramble = invertScramble(scrambleText);
  const { tlHex, blHex } = sq1AlgToHex(invertedScramble);
  const shapeIndex = getShapeIndexFromHex(tlHex, blHex);
  return {
    original: scrambleText,
    inverted: invertedScramble,
    tlHex,
    blHex,
    shapeIndex,
  };
}
