// ========================================
// Square-1 shape path tracer.
// Traces the shape journey through a scramble
// by simulating moves and matching layer
// patterns to shape names.
//
// Shape recognition is delegated to the parity
// tracer so both the shape path and the parity
// analysis share the same shape patterns and
// custom schemes (single source of truth).
// ========================================

import {
  createSolvedState,
  invertScramble,
  rotateString,
  rotateSection,
  sliceSwap,
  tokenizeScramble,
  type CubeState,
} from './cube';
import { buildUnits } from './parityAnalyzer';

/** Long (parity-tracer) shape name -> short display name for the shape path. */
export const SHORT_SHAPE_NAMES: Record<string, string> = {
  Square: 'Sq',
  Kite: 'Kite',
  Barrel: 'Barr',
  'Left Fist': 'L Fist',
  'Right Fist': 'R Fist',
  Shield: 'Shld',
  Muffin: 'Muff',
  'Left Pawn': 'L Pawn',
  'Right Pawn': 'R Pawn',
  Scallop: 'Scal',
  Pair: 'Pair',
  'L-Shape': 'L',
  Line: 'Line',
  '6-0': '6',
  'Right 5-1': 'R 51',
  'Left 5-1': 'L 51',
  'Right 4-2': 'R 42',
  'Left 4-2': 'L 42',
  '4-1-1': '411',
  '3-3': '33',
  '3-1-2': '312',
  '3-2-1': '321',
  '2-2-2': '222',
  '8-0': '8',
  '6-2': '62',
  '4-4': '44',
  '7-1': '71',
  '5-3': '53',
  Star: 'Star',
};

const toShortName = (name: string): string => SHORT_SHAPE_NAMES[name] || name;

const SHAPE_PATH_PATTERNS: Record<string, string> = {
  ECECECEC: 'Sq',
  EECECCEC: 'Kite',
  EECCEECC: 'Barr',
  EECCECEC: 'L Fist',
  EECECECC: 'R Fist',
  EECEECCC: 'Shld',
  EEECCECC: 'Muff',
  EEECECCC: 'L Pawn',
  ECEEECCC: 'R Pawn',
  EEEECCCC: 'Scal',
  EECCCCC: 'Pair',
  ECECCCC: 'L',
  ECCCECC: 'Line',
  EEEEEECCC: '6',
  ECEEEEECC: 'R 51',
  EEEEECECC: 'L 51',
  EECEEEECC: 'R 42',
  EEEECEECC: 'L 42',
  EEEECECEC: '411',
  EEECEEECC: '33',
  ECEECEEEC: '312',
  ECEEECEEC: '321',
  EECEECEEC: '222',
  EEEEEEEECC: '8',
  EEEEEECEEC: '62',
  EEEECEEEEC: '44',
  EEEEEEECEC: '71',
  EEEEECEEEC: '53',
  CCCCCC: 'Star',
};

function matchShapePathPattern(typeStr: string): string {
  for (const [pattern, name] of Object.entries(SHAPE_PATH_PATTERNS)) {
    if (pattern.length !== typeStr.length) continue;
    for (let rotation = 0; rotation < typeStr.length; rotation++) {
      if (rotateString(typeStr, rotation) === pattern) return name;
    }
  }
  return 'Unknown';
}

export interface ShapeStep {
  topShape: string;
  bottomShape: string;
  topPattern: string;
  bottomPattern: string;
}

const recordShape = (state: CubeState): ShapeStep => {
  const topUnits = buildUnits(state, 0);
  const bottomUnits = buildUnits(state, 12);
  return {
    topShape: toShortName(matchShapePathPattern(topUnits.types)),
    bottomShape: toShortName(matchShapePathPattern(bottomUnits.types)),
    topPattern: topUnits.types,
    bottomPattern: bottomUnits.types,
  };
};

/**
 * Simulates a scramble and records the shape before every "/" plus the final
 * state, producing the full shape journey.
 */
function traceShapePath(scrambleString: string): ShapeStep[] {
  const shapePath: ShapeStep[] = [];
  const cubeState = createSolvedState();

  for (const token of tokenizeScramble(scrambleString)) {
    if (token.type === 'turn') {
      rotateSection(cubeState, 0, 12, token.top);
      rotateSection(cubeState, 12, 12, token.bottom);
      if (token.slash) {
        shapePath.push(recordShape(cubeState));
        sliceSwap(cubeState);
      }
    } else {
      sliceSwap(cubeState);
    }
  }

  shapePath.push(recordShape(cubeState));
  return shapePath;
}

function formatShapePath(shapePath: ShapeStep[]): string {
  return shapePath.map((step) => `${step.topShape}/${step.bottomShape}`).join(' → ');
}

/** Scramble input → scramble shape path output. */
export function traceScrambleToScrambleShapePath(scramble: string): string {
  return formatShapePath(traceShapePath(scramble.trim()));
}

/** Scramble input → solution shape path output (reversed). */
export function traceScrambleToSolutionShapePath(scramble: string): string {
  const shapePath = traceShapePath(scramble.trim());
  return formatShapePath(shapePath.slice().reverse());
}

/** Solution input → scramble shape path output (invert then trace). */
export function traceSolutionToScrambleShapePath(solution: string): string {
  return formatShapePath(traceShapePath(invertScramble(solution.trim())));
}

/** Solution input → solution shape path output (invert, trace, reverse). */
export function traceSolutionToSolutionShapePath(solution: string): string {
  const shapePath = traceShapePath(invertScramble(solution.trim()));
  return formatShapePath(shapePath.slice().reverse());
}
