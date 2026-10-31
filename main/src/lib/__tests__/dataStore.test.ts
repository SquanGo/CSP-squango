import { test, expect } from 'vitest';
import { CSPData } from '../dataStore';
import { CASES, CASE_NAMES, getCaseId } from '../../data/cases';

test('data store exposes all 90 cases', () => {
  expect(CSPData.cases.length).toBe(90);
  expect(CSPData.cases).toBe(CASES);
  expect(CSPData.getCaseIds().length).toBe(90);
});

test('case IDs are stable numeric identities from 1 through 90', () => {
  expect(CASES.map((item) => item.id).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 90 }, (_, index) => index + 1),
  );
  expect(CASES.every((item) => typeof item.key === 'string' && !('name' in item))).toBe(true);
});

test('compact case names are stored in numeric-ID order and legacy names still resolve', () => {
  expect(CASE_NAMES).toHaveLength(90);
  expect(CASE_NAMES[64]).toBe('Left 4-2/Pair');
  expect(CASE_NAMES[67]).toBe('Right 4-2/Line');
  expect(CASE_NAMES[25]).toBe('Left 4-2/L');
  expect(CASE_NAMES.map((name) => getCaseId(name))).toEqual(
    Array.from({ length: 90 }, (_, index) => index + 1),
  );
  expect(getCaseId('Left 4-2/Paired Edges')).toBe(65);
  expect(getCaseId('Right 4-2/Parallel Edges')).toBe(68);
  expect(getCaseId('Left 4-2/Perpendicular Edges')).toBe(26);
});

test('data store validates cleanly', () => {
  expect(CSPData.validate()).toEqual([]);
});

test('getCase resolves cases by numeric ID and legacy shape key', () => {
  expect(CSPData.getCase(1)?.key).toBe(CASES[0].key);
  expect(CSPData.getCase('Kite/Square')?.key).toBe('Kite/Square');
  expect(CSPData.getCase('Does Not Exist')).toBeNull();
  expect(CSPData.hasCase(CASES[0].id)).toBe(true);
  expect(CSPData.hasCase('nope')).toBe(false);
});

test('canonical shape index lookups resolve', () => {
  const star = CASES.find((item) => item.key === '8/Star')!;
  expect(CSPData.getCanonicalShapeIndex(star.id)).toBe(58);
  expect(CSPData.getCaseIdByShapeIndex(58)).toBe(star.id);
  expect(CSPData.getCanonicalShapeIndex('missing')).toBeNull();
});

test('shape entries resolve directly or via alias', () => {
  const direct = CSPData.getShapeEntry('6/Paired Edges');
  expect(direct).not.toBeNull();
  expect(direct?.org).toBeTruthy();

  // A case whose shape entry must be found via its canonical index.
  const byAlias = CSPData.getShapeEntry(CASES.find((item) => item.key === 'Kite/Square')!.id);
  expect(byAlias).not.toBeNull();
  expect(byAlias?.org).toContain(
    CSPData.getCanonicalShapeIndex(CASES.find((item) => item.key === 'Kite/Square')!.id) as number,
  );
});
