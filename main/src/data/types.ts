/** A single cubeshape parity case definition. */
export interface AlgCase {
  /** Stable, compact identity used for state, presets, and exports. */
  id: number;
  /** Technical shape-data key; not a user-facing case name. */
  key: string;
  top: string;
  bottom: string;
  odd: string[];
  even: string[];
  /** Indices of the odd algorithms that flip parity. */
  oddPar?: number[];
  /** Indices of the even algorithms that flip parity. */
  evenPar?: number[];
  probability: number;
}

export type CaseRef = number | string;

/** Cubie permutation indices for a shape, used by the parity tracer. */
export interface ShapeIndexEntry {
  name: string;
  /** Original (non-mirrored) cubie indices. */
  org?: number[];
  /** Mirrored cubie indices. */
  mir?: number[];
}

/** Maps numeric case IDs (serialized as object keys) to canonical shape indices. */
export type ShapeIndexMap = Record<string, number>;
