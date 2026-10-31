/**
 * Bottom-layer tracing-start selection, shared by the parity tracer and the
 * homepage shape images so both always agree.
 */

/**
 * Render-frame slot whose centre is the "top" of a bottom-layer image. The
 * bottom start is the valid piece nearest this point (ties go forward).
 * Tuning knob: if symmetric bottoms land on the wrong piece, change this.
 */
export const BOTTOM_ANCHOR_SLOT = 5;

function rotateBits(bits: string, k: number): string {
  const n = bits.length;
  const r = ((k % n) + n) % n;
  return bits.slice(r) + bits.slice(0, r);
}

/** Start rotations (unit indices) that turn `bits` into `pattern`. */
export function validStartRotations(bits: string, pattern: string): number[] {
  const out: number[] = [];
  if (bits.length !== pattern.length) return out;
  for (let r = 0; r < bits.length; r++) {
    if (rotateBits(bits, r) === pattern) out.push(r);
  }
  return out;
}

/** Distance from point p to the half-open interval [lo, hi) on a circle of `total` slots. */
function intervalDistance(p: number, lo: number, hi: number, total: number): number {
  let best = Infinity;
  for (const k of [-total, 0, total]) {
    const a = lo + k;
    const b = hi + k;
    best = Math.min(best, p < a ? a - p : p >= b ? p - b : 0);
  }
  return best;
}

/**
 * Bottom-layer start rotation for reading-order `bits` matched to `pattern`.
 * Asymmetric shapes have a single valid start. Symmetric shapes pick the valid
 * piece nearest the anchor point; the render frame is the mirror of the reading
 * frame, so a reading interval [s, s+w) maps to render [total-s-w, total-s).
 * `fallback` is returned when no rotation matches.
 */
export function chooseBottomStart(bits: string, pattern: string, fallback: number): number {
  const valid = validStartRotations(bits, pattern);
  if (valid.length === 0) return fallback;
  if (valid.length === 1) return valid[0];

  const starts: number[] = [];
  let total = 0;
  for (const b of bits) {
    starts.push(total);
    total += b === '1' ? 2 : 1;
  }
  const anchor = BOTTOM_ANCHOR_SLOT + 0.5;

  let best = valid[0];
  let bestDist = Infinity;
  let bestFwd = Infinity;
  for (const u of valid) {
    const width = bits[u] === '1' ? 2 : 1;
    const lo = total - starts[u] - width;
    const dist = intervalDistance(anchor, lo, lo + width, total);
    const fwd = (((lo - anchor) % total) + total) % total;
    if (dist < bestDist || (dist === bestDist && fwd < bestFwd)) {
      best = u;
      bestDist = dist;
      bestFwd = fwd;
    }
  }
  return best;
}
