/**
 * Expanded layer shapes + tracing-start marking.
 *
 * Expanded notation: 12 characters per half, one per sticker slot.
 *   '0' = edge slot, '2' = edge slot that is the tracing start,
 *   '11' = corner slot pair (or '31' when the corner is the tracing start).
 */

import { LAYER_SHAPE_BITS } from '../data/layerShapes';
import { getShapeDisplayRotation } from '../data/shapeDisplay';
import { matchPattern } from './parityAnalyzer';
import { chooseBottomStart } from './tracingStart';

const EDGE_HEX_CHARS = new Set(['0', '2', '4', '6', '8', 'a', 'c', 'e']);

/** Expand a 12-char hex layer into expanded form (edge='0', corner='11'). */
export function expandHexLayer(layer: string): string {
  let out = '';
  for (const ch of layer) out += EDGE_HEX_CHARS.has(ch) ? '0' : '1';
  return out;
}

export interface ExpandedToken {
  piece: '0' | '1' | '2' | '3';
  type: 'edge' | 'corner';
  position: number;
}

/** Parse an expanded layer string into tokens (1-based slot positions). */
export function parseExpandedLayer(expanded: string): ExpandedToken[] {
  const tokens: ExpandedToken[] = [];
  let slotPos = 1;
  let i = 0;
  while (i < expanded.length) {
    const ch = expanded[i];
    if (ch === '0' || ch === '2') {
      tokens.push({ piece: ch, type: 'edge', position: slotPos });
      slotPos += 1;
      i += 1;
    } else {
      tokens.push({ piece: ch === '3' ? '3' : '1', type: 'corner', position: slotPos });
      slotPos += 2;
      i += 2;
    }
  }
  return tokens;
}

type UnitType = 'E' | 'C';

/** Units (E=edge, C=corner) of an expanded layer string. */
export function unitsOfExpanded(expanded: string): UnitType[] {
  const units: UnitType[] = [];
  let i = 0;
  while (i < expanded.length) {
    if (expanded[i] === '0' || expanded[i] === '2') {
      units.push('E');
      i += 1;
    } else {
      units.push('C');
      i += 2;
    }
  }
  return units;
}

/**
 * Rotate an expanded layer by whole pieces, keeping piece boundaries and any
 * '2'/'3' tracing-start mark attached to its piece.
 */
export function rotateExpandedUnits(expanded: string, shift: number): string {
  const tokens = parseExpandedLayer(expanded);
  const n = tokens.length;
  if (n === 0) return expanded;
  const k = ((shift % n) + n) % n;
  if (k === 0) return expanded;
  const rotated = [...tokens.slice(k), ...tokens.slice(0, k)];
  let out = '';
  for (const t of rotated) {
    if (t.type === 'edge') out += t.piece === '2' ? '2' : '0';
    else out += t.piece === '3' ? '31' : '11';
  }
  return out;
}

/** Expanded layer from render-order unit bits; the unit at `mark` is the tracing start. */
function buildExpanded(renderBits: string, mark: number): string {
  let out = '';
  for (let i = 0; i < renderBits.length; i++) {
    if (renderBits[i] === '1') out += i === mark ? '31' : '11';
    else out += i === mark ? '2' : '0';
  }
  return out;
}

/**
 * Tracing-start-marked expanded layer for a homepage image.
 * The start comes from the tracer's own logic, evaluated on the layer's fixed
 * reference frame (LAYER_SHAPE_BITS), so it never depends on display settings.
 * The display rotation is applied last and carries the mark with its piece.
 * Render order is the reverse of the tracer's reading order.
 */
export function getMarkedLayerExpanded(
  layerName: string,
  layer: 'top' | 'bottom',
): string | undefined {
  const frame = LAYER_SHAPE_BITS[layerName];
  if (!frame) return undefined;

  const match = matchPattern(frame);
  let mark = -1;
  if (match.name !== 'Unknown') {
    const start = layer === 'top' ? match.rot : chooseBottomStart(frame, match.pat, match.rot);
    mark = frame.length - 1 - start;
  }
  const render = [...frame].reverse().join('');
  return rotateExpandedUnits(
    buildExpanded(render, mark),
    getShapeDisplayRotation(layer, layerName),
  );
}
