/**
 * Central data-store for the case/shape datasets.
 *
 * Ported from the Refactor branch's `js/data-store.js`. Builds lookup maps for
 * the algorithm cases and shape-index entries, resolves aliases (shape entries
 * that share a canonical index with a case but have no case of their own), and
 * validates the datasets at startup.
 */
import { CASES, getCaseId, getCaseKey } from '../data/cases';
import { SHAPE_INDEX, SHAPE_INDEX_MAP } from '../data/shapeIndex';
import type { AlgCase, CaseRef, ShapeIndexEntry } from '../data/types';

const caseList: AlgCase[] = Array.isArray(CASES) ? CASES : [];
const shapeList: ShapeIndexEntry[] = Array.isArray(SHAPE_INDEX) ? SHAPE_INDEX : [];

const canonicalShapeIndex: Record<string, number> = SHAPE_INDEX_MAP || {};

const casesById = new Map(caseList.map((item) => [item.id, item]));
const casesByKey = new Map(caseList.map((item) => [item.key, item]));
const shapeEntriesByName = new Map(shapeList.map((item) => [item.name, item]));
const canonicalIndexByCase = new Map(
  caseList.map((item) => [item.id, Number(canonicalShapeIndex[String(item.id)])]),
);
const caseIdByShapeIndex = new Map<number, number>();
const shapeEntryByCaseId = new Map<number, ShapeIndexEntry>();

for (const [caseId, index] of canonicalIndexByCase) {
  if (Number.isFinite(index)) {
    caseIdByShapeIndex.set(index, caseId);
    const key = getCaseKey(caseId);
    const entry = key ? shapeEntriesByName.get(key) : undefined;
    if (entry) shapeEntryByCaseId.set(caseId, entry);
  }
}

for (const entry of shapeList) {
  for (const index of [...(entry.org || []), ...(entry.mir || [])]) {
    if (!caseIdByShapeIndex.has(index)) {
      const caseId = getCaseId(entry.name);
      if (caseId !== undefined) caseIdByShapeIndex.set(index, caseId);
    }
  }
}

for (const [caseId, index] of canonicalIndexByCase) {
  if (shapeEntryByCaseId.has(caseId) || !Number.isFinite(index)) continue;

  const aliasedEntry = shapeList.find(
    (entry) =>
      (entry.org && entry.org.includes(index)) || (entry.mir && entry.mir.includes(index)),
  );

  if (aliasedEntry) {
    shapeEntryByCaseId.set(caseId, aliasedEntry);
  }
}

function validateData(): string[] {
  const errors: string[] = [];
  const seenIds = new Set<number>();

  for (const item of caseList) {
    if (!item || !Number.isInteger(item.id) || item.id < 1 || item.id > caseList.length) {
      errors.push('Case is missing a valid numeric ID.');
      continue;
    }
    if (seenIds.has(item.id)) errors.push(`Duplicate case ID: ${item.id}`);
    seenIds.add(item.id);

    if (!item.key || typeof item.key !== 'string') errors.push(`Case ${item.id} is missing a shape key.`);
    if (!Array.isArray(item.odd)) errors.push(`Case ${item.id} is missing odd algorithms.`);
    if (!Array.isArray(item.even)) errors.push(`Case ${item.id} is missing even algorithms.`);
    if (!Number.isFinite(item.probability)) errors.push(`Case ${item.id} has an invalid probability.`);
    if (!shapeEntryByCaseId.has(item.id)) errors.push(`Case ${item.id} is missing shape-index data.`);
    if (!canonicalIndexByCase.has(item.id))
      errors.push(`Case ${item.id} is missing a canonical shape index.`);
  }

  for (const entry of shapeList) {
    if (!entry || typeof entry.name !== 'string') continue;
    const hasCaseOrAlias =
      casesByKey.has(entry.name) ||
      [...canonicalIndexByCase.keys()].some((caseId) => shapeEntryByCaseId.get(caseId) === entry);
    if (!hasCaseOrAlias) errors.push(`${entry.name} has shape-index data but no algorithm case.`);
  }

  return errors;
}

export const CSPData = Object.freeze({
  cases: caseList,
  shapeEntries: shapeList,
  casesById,
  casesByKey,
  shapeEntriesByName,
  canonicalIndexByCase,
  caseIdByShapeIndex,
  getCase: (ref: CaseRef): AlgCase | null => {
    const id = getCaseId(ref);
    return id === undefined ? null : casesById.get(id) || null;
  },
  getShapeEntry: (ref: CaseRef): ShapeIndexEntry | null => {
    const id = getCaseId(ref);
    return id === undefined ? null : shapeEntryByCaseId.get(id) || null;
  },
  getCanonicalShapeIndex: (ref: CaseRef): number | null => {
    const id = getCaseId(ref);
    return id === undefined ? null : canonicalIndexByCase.get(id) ?? null;
  },
  getCaseIdByShapeIndex: (index: number): number | null =>
    caseIdByShapeIndex.get(Number(index)) ?? null,
  hasCase: (ref: CaseRef): boolean => getCaseId(ref) !== undefined,
  getCaseIds: (): number[] => caseList.map((item) => item.id),
  validate: validateData,
});

const validationErrors = validateData();
if (validationErrors.length > 0) {
  console.warn('[CSPData] Data validation found issues:', validationErrors);
}
