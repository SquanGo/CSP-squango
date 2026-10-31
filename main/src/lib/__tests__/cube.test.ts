import { describe, it, expect } from 'vitest';

import { CASES, findCase } from '../../data/cases';
import { SHAPE_INDEX, SHAPE_INDEX_MAP, shapeIndexForCase } from '../../data/shapeIndex';
import { LAYER_SHAPE_BITS } from '../../data/layerShapes';
import { getShapeDisplayRotation } from '../../data/shapeDisplay';
import { matchPattern } from '../parityAnalyzer';
import { chooseBottomStart } from '../tracingStart';
import { parseExpandedLayer, rotateExpandedUnits } from '../expandedShape';
import { getMarkedExpandedForLayer, renderLayerShapeSVG } from '../homepageShapes';

import {
  algToShapeIndex,
  applyScramble,
  createSolvedState,
  cubeFromShape,
  getShapeIndexFromHex,
  invertScramble,
  scrambleToHex,
  shapeIndexToHex,
  stateToHex,
} from '../cube';
import { randomCube, scrambleFromState } from '../solver';
import { normalizeScramble } from '../normalizer';

describe('data integrity', () => {
  it('has exactly 90 cases, each with a shapeIndex entry and renderable shape SVGs', () => {
    expect(CASES.length).toBe(90);
    for (const c of CASES) {
      expect(SHAPE_INDEX_MAP[String(c.id)]).toBeDefined();
      expect(LAYER_SHAPE_BITS[c.top]).toBeDefined();
      expect(LAYER_SHAPE_BITS[c.bottom]).toBeDefined();
      const topSVG = renderLayerShapeSVG(c.top);
      const bottomSVG = renderLayerShapeSVG(c.bottom);
      expect(topSVG, `no SVG generated for ${c.top}`).toBeTruthy();
      expect(bottomSVG, `no SVG generated for ${c.bottom}`).toBeTruthy();
      expect(topSVG).toContain('<svg');
      expect(c.odd.length).toBeGreaterThan(0);
      expect(c.even.length).toBeGreaterThan(0);
    }
  });

  it('every shapeIndex org/mir index is within the valid range', () => {
    for (const entry of SHAPE_INDEX) {
      for (const idx of [...(entry.org ?? []), ...(entry.mir ?? [])]) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(3677);
      }
    }
  });

  it('findCase finds a case by exact name', () => {
    const first = CASES[0];
    expect(findCase(first.id)?.id).toBe(first.id);
    expect(findCase('does-not-exist')).toBeUndefined();
  });
});

describe('bottom-layer tracing starts', () => {
  it('marks the same piece chosen by the parity tracer, through display rotation', () => {
    for (const c of CASES) {
      const frame = LAYER_SHAPE_BITS[c.bottom];
      const match = matchPattern(frame);
      expect(match.name, c.bottom).not.toBe('Unknown');
      const start = chooseBottomStart(frame, match.pat, match.rot);
      const displayed = getMarkedExpandedForLayer(c.bottom, 'bottom')!;
      const reference = rotateExpandedUnits(displayed, -getShapeDisplayRotation('bottom', c.bottom));
      const tokens = parseExpandedLayer(reference);
      const marks = tokens.flatMap((token, index) =>
        token.piece === '2' || token.piece === '3' ? [index] : [],
      );
      expect(marks, c.bottom).toEqual([frame.length - 1 - start]);
      expect(tokens.map((token) => token.type === 'corner' ? '1' : '0').join('')).toBe(
        [...frame].reverse().join(''),
      );
      expect(renderLayerShapeSVG(c.bottom, undefined, 'bottom')).toContain('<svg');
    }
  });
});

describe('hex encoding round trips', () => {
  for (const c of CASES) {
    it(`shapeIndexToHex <-> getShapeIndexFromHex round trip for ${c.key}`, () => {
      const idx = shapeIndexForCase(c.id)!;
      const hex = shapeIndexToHex(idx);
      const [tl, bl] = hex.split('|');
      expect(getShapeIndexFromHex(tl, bl)).toBe(idx);
    });
  }
});

describe('case algorithms map to their recorded shapes', () => {
  for (const c of CASES) {
    it(`odd alg of ${c.key} has shape ${c.key}`, () => {
      const expected = shapeIndexForCase(c.id)!;
      for (const alg of c.odd) {
        expect(algToShapeIndex(alg).shapeIndex).toBe(expected);
      }
    });
    it(`even alg of ${c.key} has shape ${c.key}`, () => {
      const expected = shapeIndexForCase(c.id)!;
      for (const alg of c.even) {
        expect(algToShapeIndex(alg).shapeIndex).toBe(expected);
      }
    });
  }
});

describe('applyScramble / stateToHex consistency', () => {
  it('stateToHex(applyScramble(scr)) equals scrambleToHex(scr)', () => {
    for (const c of CASES) {
      for (const alg of c.odd) {
        expect(stateToHex(applyScramble(alg))).toBe(scrambleToHex(alg));
      }
    }
  });

  it('createSolvedState hexifies to a valid shape that round-trips', () => {
    const solved = createSolvedState();
    const hex = stateToHex(solved);
    const [tl, bl] = hex.split('|');
    const idx = getShapeIndexFromHex(tl, bl);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(3677);
    const [tl2, bl2] = shapeIndexToHex(idx).split('|');
    expect(getShapeIndexFromHex(tl2, bl2)).toBe(idx);
  });
});

describe('invertScramble', () => {
  it('double-inversion returns an equivalent scramble', () => {
    for (const c of CASES) {
      for (const alg of [...c.odd, ...c.even]) {
        const roundTripped = invertScramble(invertScramble(alg));
        expect(normalizeScramble(roundTripped)).toBe(normalizeScramble(alg));
      }
    }
  });

  it('inverting then applying toggles back to solved', () => {
    for (const c of CASES) {
      const alg = c.odd[0];
      const scrambled = applyScramble(alg);
      const back = applyScramble(invertScramble(alg), scrambled);
      expect(stateToHex(back)).toBe(stateToHex(createSolvedState()));
    }
  });
});

describe('solver', () => {
  it(
    'generates a scramble for every case shape and it stays in that shape',
    () => {
      for (const c of CASES) {
        const idx = shapeIndexForCase(c.id)!;
        const cubie = cubeFromShape(idx);
        const scramble = scrambleFromState(cubie);
        expect(scramble, `no scramble for ${c.key}`).toBeTruthy();
        // Mirror legacy restoftheapp.js getCaseNameFromScramble: it inverts the
        // scramble and then algToShapeIndex inverts internally again, netting the
        // forward (scrambled) shape. A single algToShapeIndex(scramble) would
        // measure the inverse path's shape, which is undefined for solver scrambles.
        const hex = algToShapeIndex(invertScramble(scramble!));
        expect(hex.shapeIndex, `${c.key} scramble: ${scramble}`).toBe(idx);
      }
    },
    120000,
  );

  it(
    'random cubes can all be solved',
    () => {
      for (let i = 0; i < 25; i++) {
        const cubie = randomCube(i);
        const scramble = scrambleFromState(cubie);
        expect(scramble).toBeTruthy();
        expect(scramble!.length).toBeGreaterThan(0);
      }
    },
    120000,
  );
});
