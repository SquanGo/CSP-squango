import type { CaseRef, ShapeIndexEntry, ShapeIndexMap } from './types';
import rawShapeIndex from './shapeIndex.json';
import rawShapeIndexMap from './shapeIndexMap.json';
import { getCaseId } from './cases';

export const SHAPE_INDEX: ShapeIndexEntry[] = rawShapeIndex as ShapeIndexEntry[];

/** Numeric case ID -> canonical cubie shape index. */
const RAW_INDEX_MAP = rawShapeIndexMap as Record<string, number>;

export const SHAPE_INDEX_MAP: ShapeIndexMap = RAW_INDEX_MAP;

export function shapeIndexForCase(ref: CaseRef): number | undefined {
  const id = getCaseId(ref);
  return id === undefined ? undefined : SHAPE_INDEX_MAP[String(id)];
}
