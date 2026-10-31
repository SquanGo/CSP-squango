// ========================================
// Square-1 scramble solver.
// Given a cubie state, finds a short scramble
// that produces it, using precomputed move and
// pruning tables for shape + square phases.
// ========================================

// === NUMERIC HELPERS ===

function getNPerm(arr: number[], n: number): number {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    idx *= n - i;
    for (let j = i + 1; j < n; j++) {
      if (arr[i] > arr[j]) idx++;
    }
  }
  return idx;
}

function setNPerm(arr: number[], idx: number, n: number): void {
  arr.length = n;
  for (let i = n - 1; i >= 0; i--) {
    arr[i] = idx % (n - i);
    idx = ~~(idx / (n - i));
    for (let j = i + 1; j < n; j++) {
      if (arr[j] >= arr[i]) arr[j]++;
    }
  }
}

/** Cycles the values at the given indices one step along the argument order. */
function cyclePositions(arr: number[], ...indices: number[]): void {
  const temp = arr[indices[indices.length - 1]];
  for (let i = indices.length; i > 1; i--) {
    arr[indices[i - 1]] = arr[indices[i - 2]];
  }
  arr[indices[0]] = temp;
}

function randomIndex(n: number): number {
  return Math.floor(Math.random() * n);
}

function bitCount(x: number): number {
  x -= (x >> 1) & 1431655765;
  x = ((x >> 2) & 858993459) + (x & 858993459);
  x = ((x >> 4) + x) & 252645135;
  x += x >> 8;
  x += x >> 16;
  return x & 63;
}

function binarySearch(sortedArray: number[], key: number): number {
  let low = 0;
  let high = sortedArray.length - 1;
  while (low <= high) {
    const mid = low + ((high - low) >> 1);
    const midVal = sortedArray[mid];
    if (midVal < key) {
      low = mid + 1;
    } else if (midVal > key) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return -low - 1;
}

// === CUBIE ===

/** Structural type for the cubie fields the solver reads from its input. */
export interface CubieLike {
  ul: number;
  ur: number;
  dl: number;
  dr: number;
  ml: number;
  pieceAt(idx: number): number;
}

export class SqCubie implements CubieLike {
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

  copyFrom(other: CubieLike): void {
    this.ul = other.ul;
    this.ur = other.ur;
    this.dl = other.dl;
    this.dr = other.dr;
    this.ml = other.ml;
  }

  /**
   * Applies a raw move code:
   *  >0  top turn (increments of 90°), 0 = "/", <0  bottom turn.
   */
  doMove(move: number): void {
    move <<= 2;
    if (move > 24) {
      move = 48 - move;
      const temp = this.ul;
      this.ul = ((this.ul >> move) | (this.ur << (24 - move))) & 0xffffff;
      this.ur = ((this.ur >> move) | (temp << (24 - move))) & 0xffffff;
    } else if (move > 0) {
      const temp = this.ul;
      this.ul = ((this.ul << move) | (this.ur >> (24 - move))) & 0xffffff;
      this.ur = ((this.ur << move) | (temp >> (24 - move))) & 0xffffff;
    } else if (move === 0) {
      const temp = this.ur;
      this.ur = this.dl;
      this.dl = temp;
      this.ml = 1 - this.ml;
    } else if (move >= -24) {
      move = -move;
      const temp = this.dl;
      this.dl = ((this.dl << move) | (this.dr >> (24 - move))) & 0xffffff;
      this.dr = ((this.dr << move) | (temp >> (24 - move))) & 0xffffff;
    } else {
      move = 48 + move;
      const temp = this.dl;
      this.dl = ((this.dl >> move) | (this.dr << (24 - move))) & 0xffffff;
      this.dr = ((this.dr >> move) | (temp << (24 - move))) & 0xffffff;
    }
  }
}

// === MOVE TABLES ===

const SHAPE_PRUNE_LENGTH = 7536;
const SQUARE_PRUNE_LENGTH = 80640;

let halfLayerShapes: number[];
let shapeIdxTable: number[];
let shapePrune: Int32Array;
let shapeTopMove: Int32Array;
let shapeBottomMove: Int32Array;
let shapeTwistMove: Int32Array;

let squarePrune: Int32Array;
let squareTwistMove: Int32Array;
let squareTopMove: Int32Array;
let squareBottomMove: Int32Array;

interface ShapeState {
  top: number;
  bottom: number;
  parity: number;
}

interface SquareState {
  cornperm: number;
  edgeperm: number;
  topEdgeFirst: boolean;
  botEdgeFirst: boolean;
  ml: number;
}

let tablesBuilt = false;

/** Builds every move/pruning table once. Called lazily on first solve. */
export function initSolverTables(): void {
  if (tablesBuilt) return;
  tablesBuilt = true;

  halfLayerShapes = [0, 3, 6, 12, 15, 24, 27, 30, 48, 51, 54, 60, 63];
  shapeIdxTable = [];
  shapePrune = new Int32Array(SHAPE_PRUNE_LENGTH);
  shapeTopMove = new Int32Array(SHAPE_PRUNE_LENGTH);
  shapeBottomMove = new Int32Array(SHAPE_PRUNE_LENGTH);
  shapeTwistMove = new Int32Array(SHAPE_PRUNE_LENGTH);

  squarePrune = new Int32Array(SQUARE_PRUNE_LENGTH);
  squareTwistMove = new Int32Array(40320);
  squareTopMove = new Int32Array(40320);
  squareBottomMove = new Int32Array(40320);

  initShapeTables();
  initSquareTables();
}

// === SHAPE PHASE ===

function shapeGetIdx(state: ShapeState): number {
  const idx = binarySearch(shapeIdxTable, (state.top << 12) | state.bottom) << 1;
  return idx | state.parity;
}

function shapeSetIdx(state: ShapeState, idx: number): void {
  state.parity = idx & 1;
  state.top = shapeIdxTable[idx >> 1];
  state.bottom = state.top & 4095;
  state.top >>= 12;
}

function shapeTopMoveOn(state: ShapeState): number {
  let move = 0;
  let moveParity = 0;
  do {
    if ((state.top & 2048) === 0) {
      move += 1;
      state.top = state.top << 1;
    } else {
      move += 2;
      state.top = (state.top << 2) ^ 12291;
    }
    moveParity = 1 - moveParity;
  } while ((bitCount(state.top & 63) & 1) !== 0);
  if ((bitCount(state.top) & 2) === 0) state.parity ^= moveParity;
  return move;
}

function shapeBottomMoveOn(state: ShapeState): number {
  let move = 0;
  let moveParity = 0;
  do {
    if ((state.bottom & 2048) === 0) {
      move += 1;
      state.bottom = state.bottom << 1;
    } else {
      move += 2;
      state.bottom = (state.bottom << 2) ^ 12291;
    }
    moveParity = 1 - moveParity;
  } while ((bitCount(state.bottom & 63) & 1) !== 0);
  if ((bitCount(state.bottom) & 2) === 0) state.parity ^= moveParity;
  return move;
}

function shapeGetShape2Idx(shp: number): number {
  return (binarySearch(shapeIdxTable, shp & 0xffffff) << 1) | (shp >> 24);
}

function initShapeTables(): void {
  let count = 0;
  for (let i = 0; i < 28561; ++i) {
    const dr = halfLayerShapes[i % 13];
    const dl = halfLayerShapes[~~(i / 13) % 13];
    const ur = halfLayerShapes[~~(~~(i / 13) / 13) % 13];
    const ul = halfLayerShapes[~~(~~(~~(i / 13) / 13) / 13)];
    const value = (ul << 18) | (ur << 12) | (dl << 6) | dr;
    if (bitCount(value) === 16) {
      shapeIdxTable[count++] = value;
    }
  }

  const state: ShapeState = { top: 0, bottom: 0, parity: 0 };
  for (let i = 0; i < 7356; ++i) {
    shapeSetIdx(state, i);
    let move = shapeTopMoveOn(state);
    shapeTopMove[i] = move | (shapeGetIdx(state) << 4);

    shapeSetIdx(state, i);
    move = shapeBottomMoveOn(state);
    shapeBottomMove[i] = move | (shapeGetIdx(state) << 4);

    shapeSetIdx(state, i);
    const topBits = bitCount(state.top & 63);
    const bottomBits = bitCount(state.bottom & 4032);
    state.parity ^= 1 & ((topBits & bottomBits) >> 1);
    const temp = state.top & 63;
    state.top = (state.top & 4032) | ((state.bottom >> 6) & 63);
    state.bottom = (state.bottom & 63) | (temp << 6);
    shapeTwistMove[i] = shapeGetIdx(state);
  }

  for (let i = 0; i < SHAPE_PRUNE_LENGTH; ++i) {
    shapePrune[i] = -1;
  }
  shapePrune[shapeGetShape2Idx(14378715)] = 0;
  shapePrune[shapeGetShape2Idx(31157686)] = 0;
  shapePrune[shapeGetShape2Idx(23967451)] = 0;
  shapePrune[shapeGetShape2Idx(7191990)] = 0;

  let done = 4;
  let done0 = 0;
  let depth = -1;
  while (done !== done0) {
    done0 = done;
    ++depth;
    for (let i = 0; i < SHAPE_PRUNE_LENGTH; ++i) {
      if (shapePrune[i] === depth) {
        let m = 0;
        let idx = i;
        do {
          idx = shapeTopMove[idx];
          m += idx & 15;
          idx >>= 4;
          if (shapePrune[idx] === -1) {
            ++done;
            shapePrune[idx] = depth + 1;
          }
        } while (m !== 12);
        m = 0;
        idx = i;
        do {
          idx = shapeBottomMove[idx];
          m += idx & 15;
          idx >>= 4;
          if (shapePrune[idx] === -1) {
            ++done;
            shapePrune[idx] = depth + 1;
          }
        } while (m !== 12);
        idx = shapeTwistMove[i];
        if (shapePrune[idx] === -1) {
          ++done;
          shapePrune[idx] = depth + 1;
        }
      }
    }
  }
}

// === SQUARE PHASE ===

function initSquareTables(): void {
  const pos: number[] = [];
  for (let i = 0; i < 40320; ++i) {
    setNPerm(pos, i, 8);
    cyclePositions(pos, 2, 4);
    cyclePositions(pos, 3, 5);
    squareTwistMove[i] = getNPerm(pos, 8);

    setNPerm(pos, i, 8);
    cyclePositions(pos, 0, 3, 2, 1);
    squareTopMove[i] = getNPerm(pos, 8);

    setNPerm(pos, i, 8);
    cyclePositions(pos, 4, 7, 6, 5);
    squareBottomMove[i] = getNPerm(pos, 8);
  }

  for (let i = 0; i < SQUARE_PRUNE_LENGTH; ++i) {
    squarePrune[i] = -1;
  }
  squarePrune[0] = 0;

  let depth = 0;
  let done = 1;
  while (done < SQUARE_PRUNE_LENGTH) {
    const invert = depth >= 11;
    const find = invert ? -1 : depth;
    const check = invert ? depth : -1;
    ++depth;
    outer: for (let i = 0; i < SQUARE_PRUNE_LENGTH; ++i) {
      if (squarePrune[i] === find) {
        const idx = i >> 1;
        const ml = i & 1;
        let idxx = (squareTwistMove[idx] << 1) | (1 - ml);
        if (squarePrune[idxx] === check) {
          ++done;
          squarePrune[invert ? i : idxx] = depth;
          if (invert) continue outer;
        }
        idxx = idx;
        for (let m = 0; m < 4; ++m) {
          idxx = squareTopMove[idxx];
          if (squarePrune[(idxx << 1) | ml] === check) {
            ++done;
            squarePrune[invert ? i : (idxx << 1) | ml] = depth;
            if (invert) continue outer;
          }
        }
        idxx = idx;
        for (let m = 0; m < 4; ++m) {
          idxx = squareBottomMove[idxx];
          if (squarePrune[(idxx << 1) | ml] === check) {
            ++done;
            squarePrune[invert ? i : (idxx << 1) | ml] = depth;
            if (invert) continue outer;
          }
        }
      }
    }
  }
}

// === CUBIE INSPECTION ===

function fullCubeGetParity(cubie: CubieLike): number {
  const distinct: number[] = [cubie.pieceAt(0)];
  let count = 0;
  for (let i = 1; i < 24; ++i) {
    if (cubie.pieceAt(i) !== distinct[count]) {
      distinct[++count] = cubie.pieceAt(i);
    }
  }
  let parity = 0;
  for (let a = 0; a < 16; ++a) {
    for (let b = a + 1; b < 16; ++b) {
      if (distinct[a] > distinct[b]) parity ^= 1;
    }
  }
  return parity;
}

function fullCubeGetShapeIdx(cubie: CubieLike): number {
  let urx = cubie.ur & 0x111111;
  urx |= urx >> 3;
  urx |= urx >> 6;
  urx = (urx & 15) | ((urx >> 12) & 48);
  let ulx = cubie.ul & 0x111111;
  ulx |= ulx >> 3;
  ulx |= ulx >> 6;
  ulx = (ulx & 15) | ((ulx >> 12) & 48);
  let drx = cubie.dr & 0x111111;
  drx |= drx >> 3;
  drx |= drx >> 6;
  drx = (drx & 15) | ((drx >> 12) & 48);
  let dlx = cubie.dl & 0x111111;
  dlx |= dlx >> 3;
  dlx |= dlx >> 6;
  dlx = (dlx & 15) | ((dlx >> 12) & 48);
  const packed = (fullCubeGetParity(cubie) << 24) | (ulx << 18) | (urx << 12) | (dlx << 6) | drx;
  return shapeGetShape2Idx(packed);
}

function fullCubeGetSquare(cubie: SqCubie, square: SquareState): void {
  const prm: number[] = [];
  for (let a = 0; a < 8; ++a) {
    prm[a] = cubie.pieceAt(a * 3 + 1) >> 1;
  }
  square.cornperm = getNPerm(prm, 8);
  square.topEdgeFirst = cubie.pieceAt(0) === cubie.pieceAt(1);
  let a = square.topEdgeFirst ? 2 : 0;
  let b;
  for (b = 0; b < 4; a += 3, ++b) {
    prm[b] = cubie.pieceAt(a) >> 1;
  }
  square.botEdgeFirst = cubie.pieceAt(12) === cubie.pieceAt(13);
  a = square.botEdgeFirst ? 14 : 12;
  for (; b < 8; a += 3, ++b) {
    prm[b] = cubie.pieceAt(a) >> 1;
  }
  square.edgeperm = getNPerm(prm, 8);
  square.ml = cubie.ml;
}

function fullCubeRandomCube(indice?: number): SqCubie {
  if (indice === undefined) indice = randomIndex(3678);
  const cubie = new SqCubie();
  const shape = shapeIdxTable[indice];
  let corner = 0x01234567 << 1 | 0x11111111;
  let edge = 0x01234567 << 1;
  let cornerCount = 8;
  let edgeCount = 8;
  for (let i = 0; i < 24; i++) {
    if (((shape >> i) & 1) === 0) {
      const rnd = randomIndex(edgeCount) << 2;
      cubie.setPiece(23 - i, (edge >> rnd) & 0xf);
      const mask = (1 << rnd) - 1;
      edge = (edge & mask) + ((edge >> 4) & ~mask);
      --edgeCount;
    } else {
      const rnd = randomIndex(cornerCount) << 2;
      cubie.setPiece(23 - i, (corner >> rnd) & 0xf);
      cubie.setPiece(22 - i, (corner >> rnd) & 0xf);
      const mask = (1 << rnd) - 1;
      corner = (corner & mask) + ((corner >> 4) & ~mask);
      --cornerCount;
      ++i;
    }
  }
  cubie.ml = randomIndex(2);
  return cubie;
}

// === SEARCH ===

class Square1Search {
  moveStack: number[] = [];
  workingCube = new SqCubie();
  workingSquare: SquareState = {
    cornperm: 0,
    edgeperm: 0,
    topEdgeFirst: false,
    botEdgeFirst: false,
    ml: 0,
  };
  sourceCube: CubieLike | null = null;
  phase1Length = 0;
  phase2MaxLength = 0;
  solutionString: string | null = null;

  /** Finds a scramble that produces the given cubie and returns it. */
  solve(cubie: CubieLike): string | null {
    this.sourceCube = cubie;
    const shape = fullCubeGetShapeIdx(cubie);
    for (
      this.phase1Length = shapePrune[shape];
      this.phase1Length < 100;
      ++this.phase1Length
    ) {
      this.phase2MaxLength = Math.min(32 - this.phase1Length, 17);
      if (searchPhase1(this, shape, shapePrune[shape], this.phase1Length, 0, -1)) {
        break;
      }
    }
    return this.solutionString;
  }

  initPhase2(): boolean {
    this.workingCube.copyFrom(this.sourceCube!);
    for (let i = 0; i < this.phase1Length; ++i) {
      this.workingCube.doMove(this.moveStack[i]);
    }
    fullCubeGetSquare(this.workingCube, this.workingSquare);
    const edge = this.workingSquare.edgeperm;
    const corner = this.workingSquare.cornperm;
    const ml = this.workingSquare.ml;
    const prune = Math.max(
      squarePrune[(this.workingSquare.edgeperm << 1) | ml],
      squarePrune[(this.workingSquare.cornperm << 1) | ml],
    );
    for (let i = prune; i < this.phase2MaxLength; ++i) {
      if (
        searchPhase2(
          this,
          edge,
          corner,
          this.workingSquare.topEdgeFirst,
          this.workingSquare.botEdgeFirst,
          ml,
          i,
          this.phase1Length,
          0,
        )
      ) {
        for (let j = 0; j < i; ++j) {
          this.workingCube.doMove(this.moveStack[this.phase1Length + j]);
        }
        this.solutionString = this.movesToString(i + this.phase1Length);
        return true;
      }
    }
    return false;
  }

  private movesToString(length: number): string {
    let s = '';
    let top = 0;
    let bottom = 0;
    for (let i = length - 1; i >= 0; i--) {
      const value = this.moveStack[i];
      if (value > 0) {
        const v = 12 - value;
        top = v > 6 ? v - 12 : v;
      } else if (value < 0) {
        const v = 12 + value;
        bottom = v > 6 ? v - 12 : v;
      } else {
        let twist = '/';
        if (i === this.phase1Length - 1) twist = '`/`';
        if (top === 0 && bottom === 0) {
          s += twist;
        } else {
          s += ' (' + top + ',' + bottom + ')' + twist;
        }
        top = bottom = 0;
      }
    }
    if (top !== 0 || bottom !== 0) {
      s += ' (' + top + ',' + bottom + ') ';
    }
    return s;
  }
}

function searchPhase1(
  search: Square1Search,
  shape: number,
  pruneValue: number,
  maxLength: number,
  depth: number,
  lastMove: number,
): boolean {
  if (pruneValue === 0 && maxLength < 4) {
    return maxLength === 0 && search.initPhase2();
  }
  if (lastMove !== 0) {
    const shapeAfter = shapeTwistMove[shape];
    const pruneAfter = shapePrune[shapeAfter];
    if (pruneAfter < maxLength) {
      search.moveStack[depth] = 0;
      if (searchPhase1(search, shapeAfter, pruneAfter, maxLength - 1, depth + 1, 0)) {
        return true;
      }
    }
  }
  let shapeAfter = shape;
  if (lastMove <= 0) {
    let m = 0;
    while (true) {
      m += shapeTopMove[shapeAfter];
      shapeAfter = m >> 4;
      m &= 15;
      if (m >= 12) break;
      const pruneAfter = shapePrune[shapeAfter];
      if (pruneAfter > maxLength) break;
      if (pruneAfter < maxLength) {
        search.moveStack[depth] = m;
        if (searchPhase1(search, shapeAfter, pruneAfter, maxLength - 1, depth + 1, 1)) {
          return true;
        }
      }
    }
  }
  shapeAfter = shape;
  if (lastMove <= 1) {
    let m = 0;
    while (true) {
      m += shapeBottomMove[shapeAfter];
      shapeAfter = m >> 4;
      m &= 15;
      if (m >= 6) break;
      const pruneAfter = shapePrune[shapeAfter];
      if (pruneAfter > maxLength) break;
      if (pruneAfter < maxLength) {
        search.moveStack[depth] = -m;
        if (searchPhase1(search, shapeAfter, pruneAfter, maxLength - 1, depth + 1, 2)) {
          return true;
        }
      }
    }
  }
  return false;
}

function searchPhase2(
  search: Square1Search,
  edge: number,
  corner: number,
  topEdgeFirst: boolean,
  botEdgeFirst: boolean,
  ml: number,
  maxLength: number,
  depth: number,
  lastMove: number,
): boolean {
  if (maxLength === 0 && !topEdgeFirst && botEdgeFirst) return true;

  if (lastMove !== 0 && topEdgeFirst === botEdgeFirst) {
    const edgeAfter = squareTwistMove[edge];
    const cornerAfter = squareTwistMove[corner];
    if (
      squarePrune[(edgeAfter << 1) | (1 - ml)] < maxLength &&
      squarePrune[(cornerAfter << 1) | (1 - ml)] < maxLength
    ) {
      search.moveStack[depth] = 0;
      if (
        searchPhase2(
          search,
          edgeAfter,
          cornerAfter,
          topEdgeFirst,
          botEdgeFirst,
          1 - ml,
          maxLength - 1,
          depth + 1,
          0,
        )
      ) {
        return true;
      }
    }
  }

  if (lastMove <= 0) {
    let topEdgeFirstNext = !topEdgeFirst;
    let edgeNext = topEdgeFirstNext ? squareTopMove[edge] : edge;
    let cornerNext = topEdgeFirstNext ? corner : squareTopMove[corner];
    let m = topEdgeFirstNext ? 1 : 2;
    let prune1 = squarePrune[(edgeNext << 1) | ml];
    let prune2 = squarePrune[(cornerNext << 1) | ml];
    while (m < 12 && prune1 <= maxLength && prune1 <= maxLength) {
      if (prune1 < maxLength && prune2 < maxLength) {
        search.moveStack[depth] = m;
        if (
          searchPhase2(
            search,
            edgeNext,
            cornerNext,
            topEdgeFirstNext,
            botEdgeFirst,
            ml,
            maxLength - 1,
            depth + 1,
            1,
          )
        ) {
          return true;
        }
      }
      topEdgeFirstNext = !topEdgeFirstNext;
      if (topEdgeFirstNext) {
        edgeNext = squareTopMove[edgeNext];
        prune1 = squarePrune[(edgeNext << 1) | ml];
        m += 1;
      } else {
        cornerNext = squareTopMove[cornerNext];
        prune2 = squarePrune[(cornerNext << 1) | ml];
        m += 2;
      }
    }
  }

  if (lastMove <= 1) {
    let botEdgeFirstNext = !botEdgeFirst;
    let edgeNext = botEdgeFirstNext ? squareBottomMove[edge] : edge;
    let cornerNext = botEdgeFirstNext ? corner : squareBottomMove[corner];
    let m = botEdgeFirstNext ? 1 : 2;
    let prune1 = squarePrune[(edgeNext << 1) | ml];
    let prune2 = squarePrune[(cornerNext << 1) | ml];
    while (m < (maxLength > 6 ? 6 : 12) && prune1 <= maxLength && prune1 <= maxLength) {
      if (prune1 < maxLength && prune2 < maxLength) {
        search.moveStack[depth] = -m;
        if (
          searchPhase2(
            search,
            edgeNext,
            cornerNext,
            topEdgeFirst,
            botEdgeFirstNext,
            ml,
            maxLength - 1,
            depth + 1,
            2,
          )
        ) {
          return true;
        }
      }
      botEdgeFirstNext = !botEdgeFirstNext;
      if (botEdgeFirstNext) {
        edgeNext = squareBottomMove[edgeNext];
        prune1 = squarePrune[(edgeNext << 1) | ml];
        m += 1;
      } else {
        cornerNext = squareBottomMove[cornerNext];
        prune2 = squarePrune[(cornerNext << 1) | ml];
        m += 2;
      }
    }
  }
  return false;
}

// === PUBLIC API ===

const searchInstance = new Square1Search();

/** Builds the move tables if needed, then solves the given cubie. */
export function scrambleFromState(cubie: CubieLike): string | null {
  initSolverTables();
  return searchInstance.solve(cubie);
}

/** Creates a random cubie for the given shape index (random piece permutation). */
export function randomCube(indice?: number): SqCubie {
  initSolverTables();
  return fullCubeRandomCube(indice);
}
