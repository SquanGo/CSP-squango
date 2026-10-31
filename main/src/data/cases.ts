import type { AlgCase } from './types';
import rawCases from './cases.json';

export const CASES: AlgCase[] = rawCases as AlgCase[];

const legacyEdgeNames: Record<string, string> = {
  Pair: 'Paired Edges',
  Line: 'Parallel Edges',
  L: 'Perpendicular Edges',
};

function getExpandedLegacyCaseName(key: string): string {
  const separator = key.lastIndexOf('/');
  const suffix = key.slice(separator + 1);
  return separator === -1 || !legacyEdgeNames[suffix]
    ? key
    : `${key.slice(0, separator + 1)}${legacyEdgeNames[suffix]}`;
}

const caseIdsByKey = new Map(
  CASES.flatMap((item) => [
    [item.key, item.id] as const,
    [getExpandedLegacyCaseName(item.key), item.id] as const,
  ]),
);
const casesById = new Map(CASES.map((item) => [item.id, item]));

/** Compact case names in stable numeric-ID order, for UI surfaces like Quick Edit. */
export const CASE_NAMES = [...CASES]
  .sort((a, b) => a.id - b.id)
  .map((item) => item.key);

/** Resolve both numeric IDs and legacy technical keys at import/UI boundaries. */
export function getCaseId(ref: unknown): number | undefined {
  if (typeof ref === 'number' && Number.isInteger(ref)) {
    return casesById.has(ref) ? ref : undefined;
  }
  if (typeof ref !== 'string') return undefined;
  const legacyId = caseIdsByKey.get(ref);
  if (legacyId !== undefined) return legacyId;
  if (!/^[1-9]\d*$/.test(ref)) return undefined;
  const id = Number(ref);
  return casesById.has(id) ? id : undefined;
}

export function getCaseKey(ref: unknown): string | undefined {
  const id = getCaseId(ref);
  return id === undefined ? undefined : casesById.get(id)?.key;
}

export function findCase(ref: number | string): AlgCase | undefined {
  const id = getCaseId(ref);
  return id === undefined ? undefined : casesById.get(id);
}
