// ========================================
// Scramble colorizer.
// Highlights the move after a "`/`" marker when
// it aligns (or misaligns) the layers.
// ========================================

import { applyScramble, CORNER_PARTNER, EDGE_PIECES, type CubeState } from './cube';

const ALIGNED_TOP = 'CECECECE';
const ALIGNED_BOTTOM = 'ECECECEC';

/** Builds the unit pattern string ("E"/"C" chars) for one 12-slot layer. */
function buildUnitsString(state: CubeState, start: number): string {
  const units: string[] = [];
  let i = 0;
  while (i < 12) {
    const ch = state[start + i];
    if (EDGE_PIECES.has(ch)) {
      units.push('E');
      i += 1;
      continue;
    }
    const nextCh = state[start + ((i + 1) % 12)];
    if (CORNER_PARTNER[ch] === nextCh) {
      units.push('C');
      i += 2;
    } else {
      units.push('C');
      i += 1;
    }
  }
  return units.join('');
}

/** Returns the unit patterns for the top and bottom layers of a state. */
function getLayerPatterns(state: CubeState): { top: string; bottom: string } {
  return {
    top: buildUnitsString(state, 0),
    bottom: buildUnitsString(state, 12),
  };
}

/** Finds the index of the special "`/`" marker in a scramble. */
function findSpecialSlashIndex(scramble: string): number | null {
  const match = scramble.match(/`\/`/);
  return match && match.index !== undefined ? match.index : null;
}

export interface ColorizedScramble {
  color: string | null;
  before: string;
  after: string;
  html: string;
}

/**
 * Colorizes the segment after a "`/`" marker when it doubles (or avoids)
 * the alignment of the layers at that point.
 */
export function processScramble(scramble: string): ColorizedScramble {
  const slashIndex = findSpecialSlashIndex(scramble);
  if (slashIndex === null) return { color: null, before: '', after: '', html: scramble };

  const before = scramble.substring(0, slashIndex);
  const state = applyScramble(before);
  const { top, bottom } = getLayerPatterns(state);

  let color: string | null = null;
  if (top === ALIGNED_TOP && bottom === ALIGNED_BOTTOM) color = 'var(--double-align-color)';
  else if (top === ALIGNED_BOTTOM && bottom === ALIGNED_TOP) color = 'var(--double-misalign-color)';

  const after = scramble.substring(slashIndex + 3);

  return {
    color,
    before,
    after,
    html: color ? `${before}/<span style="color:${color}">${after}</span>` : scramble,
  };
}
