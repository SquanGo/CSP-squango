import { CASES, getCaseId, getCaseKey } from '../data/cases';
import { SHAPE_INDEX, SHAPE_INDEX_MAP } from '../data/shapeIndex';
import type { AlgCase, CaseRef } from '../data/types';
import { algToShapeIndex, invertScramble } from '../lib/cube';
import { getParityText, setCaseNameResolver, setEvilnessConfig, getShapePatterns } from '../lib/parityAnalyzer';
import {
  applyHomepageSVGsLive,
  ensureHomepageShapeSVGsForCases,
  getHomepageShapeSVGs,
  loadHomepageImageSettings,
  prepareHomepageShapeSVGCache,
  resetHomepageImageSettings as resetHomepageImageSettingsDefaults,
  saveHomepageImageSettings,
  seedHomepageShapeSVGs,
  type HomepageShapeSVGCachePayload,
  type HomepageImageSettings,
} from '../lib/homepageShapes';
import { notify } from './store';
import {
  CSP_BOOT_KEY,
  CSP_PREFERENCES_KEY,
  CSP_PROGRESS_KEY,
  hadStoredProgress,
  readCspObject,
  updateCspObject,
} from '../lib/storage';

export const data: AlgCase[] = CASES;
export const shapeIndex = SHAPE_INDEX;
export const shapeIndexMap = SHAPE_INDEX_MAP;

export type SortMode = 'priority' | 'probability' | 'antiProbability';
export type LearnFilter = 'all' | 'learned' | 'unlearned';
export type CornerMode = 'counterclockwise' | 'clockwise';
export type LearningOrderEntry = number | number[];
export type LearningOrder = LearningOrderEntry[];

export interface ColorScheme {
  topColor: string;
  bottomColor: string;
  frontColor: string;
  rightColor: string;
  backColor: string;
  leftColor: string;
  dividerColor: string;
  circleColor: string;
}

const DEFAULT_COLOR_SCHEME: ColorScheme = {
  topColor: '#474747',
  bottomColor: '#FFFFFF',
  frontColor: '#CC0000',
  rightColor: '#00AA00',
  backColor: '#FF8C00',
  leftColor: '#0066CC',
  dividerColor: '#7a0000',
  circleColor: 'transparent',
};
// ── Preset configuration (mirrors legacy window.PRESET_CONFIG) ─────────────
export const PRESET_CONFIG: Record<string, string> = {
  "Matt's_Preset": "presets/Matt's_Preset.json",
  'Empty_Preset': 'presets/Empty_Preset.json',
};

const BOOT_PRESET_CONFIG: Record<string, string> = {
  "Matt's_Preset": "presets/Matt's_Preset.boot.json",
};

// ── Default display names for all 90 cases (fresh installs) ────────────────
const defaultDisplayNames: Record<number, string> = {
  3: '8/Star',
  2: '7-1/Star',
  4: '6-2/Star',
  6: '5-3/Star',
  5: '4-4/Star',
  74: '2-2-2/Pair',
  8: '2-2-2/Line',
  7: '2-2-2/L',
  31: '3-1-2/Pair',
  33: '3-1-2/Line',
  72: '3-1-2/L',
  32: '3-2-1/Pair',
  34: '3-2-1/Line',
  73: '3-2-1/L',
  28: '3-3/Pair',
  29: '3-3/Line',
  69: '3-3/L',
  70: '4-1-1/Pair',
  30: '4-1-1/Line',
  71: '4-1-1/L',
  65: 'Left 4-2/Pair',
  67: 'Left 4-2/Line',
  26: 'Left 4-2/L',
  66: 'Right 4-2/Pair',
  68: 'Right 4-2/Line',
  27: 'Right 4-2/L',
  61: 'Left 5-1/Pair',
  24: 'Left 5-1/Line',
  63: 'Left 5-1/L',
  62: 'Right 5-1/Pair',
  25: 'Right 5-1/Line',
  64: 'Right 5-1/L',
  60: '6/Pair',
  23: '6/Line',
  22: '6/L',
  88: 'Barrel/Barrel',
  21: 'Barrel/Square',
  16: 'Barrel/Left Fist',
  15: 'Barrel/Right Fist',
  86: 'Kite/Barrel',
  89: 'Kite/Kite',
  1: 'kite/Square',
  14: 'Kite/Left Fist',
  13: 'Kite/Right Fist',
  12: 'Muffin/Barrel',
  11: 'Muffin/Kite',
  84: 'Muffin/Muffin',
  85: 'Muffin/Square',
  10: 'Muffin/Left Fist',
  9: 'Muffin/Right Fist',
  59: 'Shield/Barrel',
  58: 'Shield/Kite',
  78: 'Shield/Muffin',
  82: 'Shield/Shield',
  83: 'Shield/Square',
  56: 'Shield/Left Fist',
  57: 'Shield/Right Fist',
  75: 'Scallop/Barrel',
  80: 'Scallop/Kite',
  38: 'Scallop/Muffin',
  37: 'Scallop/Shield',
  79: 'Scallop/Scallop',
  41: 'Scallop/Square',
  39: 'Scallop/Left Fist',
  40: 'Scallop/Right Fist',
  36: 'Scallop/Left Pawn',
  35: 'Scallop/Right Pawn',
  90: 'Square/Square',
  19: 'Left Fist/Square',
  18: 'Left Fist/Left Fist',
  87: 'Left Fist/Right Fist',
  20: 'Right Fist/Square',
  17: 'Right Fist/Right Fist',
  53: 'Left Pawn/Barrel',
  51: 'Left Pawn/Kite',
  47: 'Left Pawn/Muffin',
  42: 'Left Pawn/Shield',
  55: 'Left Pawn/Square',
  49: 'Left Pawn/Left Fist',
  77: 'Left Pawn/Right Fist',
  45: 'Left Pawn/Left Pawn',
  81: 'Left Pawn/Right Pawn',
  52: 'Right Pawn/Barrel',
  50: 'Right Pawn/Kite',
  46: 'Right Pawn/Muffin',
  43: 'Right Pawn/Shield',
  54: 'Right Pawn/Square',
  76: 'Right Pawn/Left Fist',
  48: 'Right Pawn/Right Fist',
  44: 'Right Pawn/Right Pawn',
};

// ── Mutable app state ───────────────────────────────────────────────────────
export let displayNames: Record<string, string> = {};
export const svgData: Record<string, string> = {};
export let homepageImageSettings: HomepageImageSettings = loadHomepageImageSettings();

export const learnedCases = new Set<number>();
export const learningCases = new Set<number>();
export const plannedCases = new Set<number>();
export const comments = new Map<number, string>();
export const plannedLevels = new Map<number, number>();
export let learningOrder: LearningOrder | null = null;
export const perCaseSubtitles = new Map<number, string>();
export const customAlgorithms = new Map<number, { odd?: string[]; even?: string[] }>();
export const cachedParityAlgorithms = new Map<number, { odd: string[]; even: string[] }>();
export const algVariables = new Map<string, string>();

export let cornerStickerMode: CornerMode = 'counterclockwise';
const progressStorage = readCspObject(CSP_PROGRESS_KEY);
const preferencesStorage = readCspObject(CSP_PREFERENCES_KEY);
export let evilnessFactor = Boolean(progressStorage.evilnessEnabled);
export let evilnessAffectsParity = Boolean(progressStorage.evilnessAffectsParity);
export let evilnessMap: Record<string, boolean> =
  Array.isArray(progressStorage.evilCases)
    ? Object.fromEntries((progressStorage.evilCases as unknown[]).map((id) => [String(id), true]))
    : (progressStorage.evilnessMap as Record<string, boolean> | undefined) || {};

function evilCasesFromMap(map: Record<string, boolean>): number[] {
  return Object.entries(map)
    .filter(([, enabled]) => enabled === true)
    .map(([id]) => Number(id))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function evilMapFromCases(value: unknown): Record<string, boolean> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map(Number).filter(Number.isInteger).map((id) => [String(id), true]),
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, enabled]) => enabled === true)
        .map(([id]) => [id, true]),
    );
  }
  return {};
}
export let hideInstructions = false;
export let hideParenthesis = false;
export let algorithmFontSize = Number(preferencesStorage.algorithmFontSize) || 14;
export let generalNotes = '';
export let enhancedAccess = preferencesStorage.enhancedAccess === true;
export let currentSortMode: SortMode =
  (progressStorage.sortMode as SortMode) || 'probability';
export let needsReorder = false;

export let colorScheme: ColorScheme = { ...DEFAULT_COLOR_SCHEME };
export let scrambleImageSize = 200;
export let profileName = String(preferencesStorage.profileName || 'Profile');
export let profileAvatar = String(preferencesStorage.profileAvatar || 'res/avatar.svg');
export let currentPreset = String(preferencesStorage.currentPreset || "Matt's_Preset");
export let presetData: Record<string, unknown> | null = null;

export const isFirstLoad = !hadStoredProgress;
const BOOT_STATE_CARD_COUNT = 12;
let fullSavedStateLoaded = false;

function yieldToBrowser(timeout = 250): Promise<void> {
  if (typeof window !== 'undefined') {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) {
      return new Promise((resolve) => w.requestIdleCallback?.(() => resolve(), { timeout }));
    }
  }
  return new Promise((resolve) => setTimeout(resolve, 16));
}

// ── Shape index → case name lookup ──────────────────────────────────────────
function buildShapeIndexToCaseMap(): Record<number, string> {
  const map: Record<number, string> = {};
  for (const [caseId, idxStr] of Object.entries(shapeIndexMap)) {
    const idx = parseInt(String(idxStr), 10);
    map[idx] = String(Number(caseId));
  }
  for (const entry of shapeIndex) {
    const allIndices = [...(entry.org || []), ...(entry.mir || [])];
    for (const idx of allIndices) {
      if (!map[idx]) map[idx] = entry.name;
    }
  }
  return map;
}

let _shapeIndexToCaseMap: Record<number, string> | null = null;
function getShapeIndexToCaseMap(): Record<number, string> {
  if (!_shapeIndexToCaseMap) _shapeIndexToCaseMap = buildShapeIndexToCaseMap();
  return _shapeIndexToCaseMap;
}

export function getCaseNameFromScramble(scramble: string): string | null {
  if (!scramble) return null;
  try {
    // Same double-inversion as legacy getCaseNameFromScramble: algToShapeIndex
    // inverts internally, so inverting first nets the position's shape.
    const setup = invertScramble(scramble);
    const result = algToShapeIndex(setup);
    const map = getShapeIndexToCaseMap();
    return map[result.shapeIndex] || null;
  } catch {
    return null;
  }
}

/** Canonical case id (string) for a scramble; the key format `evilnessMap` uses. */
export function getCaseIdFromScramble(scramble: string): string | null {
  const caseName = getCaseNameFromScramble(scramble);
  if (!caseName) return null;
  const caseId = getCaseId(caseName);
  return caseId === undefined ? null : String(caseId);
}

export function isCaseEvil(caseName: CaseRef): boolean {
  if (!evilnessFactor) return false;
  const caseId = getCaseId(caseName);
  return caseId !== undefined && evilnessMap[String(caseId)] === true;
}

export function isScrambleEvil(scramble: string): boolean {
  if (!evilnessFactor) return false;
  const caseName = getCaseNameFromScramble(scramble);
  if (!caseName) return false;
  return isCaseEvil(caseName);
}

// ── Parity caching ──────────────────────────────────────────────────────────
let lastParityCalculationSettings: Record<string, unknown> | null = null;

function syncParityAnalyzerEvilness(): void {
  setEvilnessConfig({ factor: evilnessFactor, affectsParity: evilnessAffectsParity, map: evilnessMap });
  setCaseNameResolver(getCaseIdFromScramble);
}

function getParityCalculationSettings(): Record<string, unknown> {
  return {
    colorScheme: JSON.stringify(colorScheme),
    cornerStickerMode,
    customShapes: JSON.stringify(readCspObject(CSP_PROGRESS_KEY).tracingPositions || {}),
    customAlgorithms: JSON.stringify(Array.from(customAlgorithms.entries())),
    evilnessFactor,
    evilnessAffectsParity,
    evilnessMap: JSON.stringify(evilnessMap),
  };
}

function cacheParityForItem(item: AlgCase): void {
  const customAlgs = customAlgorithms.get(item.id);
  const oddAlgos = customAlgs && customAlgs.odd ? customAlgs.odd : item.odd || [];
  const evenAlgos = customAlgs && customAlgs.even ? customAlgs.even : item.even || [];
  const allAlgorithms = [...oddAlgos, ...evenAlgos];

  const dynamicOddAlgos: string[] = [];
  const dynamicEvenAlgos: string[] = [];

  for (const alg of allAlgorithms) {
    if (!alg || alg.trim() === '') continue;
    if (alg === 'Done!') {
      dynamicEvenAlgos.push(alg);
      continue;
    }
    try {
      const setup = invertScramble(alg);
      const parityText = getParityText(
        setup,
        {
          topColor: colorScheme.topColor,
          bottomColor: colorScheme.bottomColor,
          frontColor: colorScheme.frontColor,
          rightColor: colorScheme.rightColor,
          backColor: colorScheme.backColor,
          leftColor: colorScheme.leftColor,
        },
        cornerStickerMode,
      );
      if (parityText === 'Odd') {
        dynamicOddAlgos.push(alg);
      } else if (parityText === 'Even') {
        dynamicEvenAlgos.push(alg);
      }
    } catch (error) {
      console.error('Error testing algorithm:', alg, error);
    }
  }

  cachedParityAlgorithms.set(item.id, { odd: dynamicOddAlgos, even: dynamicEvenAlgos });
}

export function calculateAndCacheAllParity(): void {
  syncParityAnalyzerEvilness();
  lastParityCalculationSettings = getParityCalculationSettings();

  for (const item of data) {
    cacheParityForItem(item);
  }
}

export function calculateAndCacheParityForCases(cases: readonly AlgCase[]): void {
  syncParityAnalyzerEvilness();
  for (const item of cases) {
    cacheParityForItem(item);
  }
}

export async function calculateAndCacheAllParityChunked(
  chunkSize = 6,
  onChunk?: () => void,
): Promise<void> {
  syncParityAnalyzerEvilness();
  lastParityCalculationSettings = getParityCalculationSettings();
  cachedParityAlgorithms.clear();

  for (let i = 0; i < data.length; i += chunkSize) {
    for (const item of data.slice(i, i + chunkSize)) {
      cacheParityForItem(item);
    }
    onChunk?.();
    await yieldToBrowser();
  }

  await yieldToBrowser();
  saveState();
  notify();
}

export function needsParityRecalculation(): boolean {
  if (!lastParityCalculationSettings) return true;
  const current = getParityCalculationSettings();
  return (
    current.colorScheme !== lastParityCalculationSettings.colorScheme ||
    current.cornerStickerMode !== lastParityCalculationSettings.cornerStickerMode ||
    current.customShapes !== lastParityCalculationSettings.customShapes ||
    current.customAlgorithms !== lastParityCalculationSettings.customAlgorithms ||
    current.evilnessFactor !== lastParityCalculationSettings.evilnessFactor ||
    current.evilnessAffectsParity !== lastParityCalculationSettings.evilnessAffectsParity ||
    current.evilnessMap !== lastParityCalculationSettings.evilnessMap
  );
}

/** Invalidate the parity cache and recalculate from scratch (legacy behavior). */
export function recalculateAllParity(): void {
  lastParityCalculationSettings = null;
  calculateAndCacheAllParity();
  notify();
}

// ── Persistence ─────────────────────────────────────────────────────────────
type StoredProgressState = Record<string, unknown>;

function normalizeCaseRecord<T>(source: Record<string, T> | undefined): Record<number, T> {
  const normalized: Record<number, T> = {};
  for (const [ref, value] of Object.entries(source || {})) {
    const id = getCaseId(ref);
    if (id !== undefined) normalized[id] = value;
  }
  return normalized;
}

function normalizeCaseIds(source: unknown): number[] {
  if (!Array.isArray(source)) return [];
  return source.map(getCaseId).filter((id): id is number => id !== undefined);
}

function normalizeLearningOrder(source: unknown): LearningOrder | null {
  if (!Array.isArray(source)) return null;
  const seen = new Set<number>();
  const normalized: LearningOrder = [];
  for (const entry of source) {
    const refs = Array.isArray(entry) ? entry : [entry];
    const ids = refs
      .map(getCaseId)
      .filter((id): id is number => id !== undefined && !seen.has(id))
      .filter((id) => {
        seen.add(id);
        return true;
      });
    if (ids.length === 1 && !Array.isArray(entry)) normalized.push(ids[0]);
    else if (ids.length > 0) normalized.push(ids);
  }
  return normalized;
}

export function getLearningOrder(): LearningOrder | null {
  return learningOrder ? learningOrder.map((entry) => (Array.isArray(entry) ? [...entry] : entry)) : null;
}

export function setLearningOrder(order: LearningOrder | null, notifyStore = true): void {
  learningOrder = normalizeLearningOrder(order);
  saveState();
  if (notifyStore) notify();
}

export interface PriorityGroupMetadata {
  groupId: number;
  caseIds: number[];
  position: number;
}

export function getPriorityGroupMetadata(): Map<number, PriorityGroupMetadata> {
  const result = new Map<number, PriorityGroupMetadata>();
  if (!learningOrder) return result;
  learningOrder.forEach((entry, position) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    const group = { groupId: position, caseIds: [...entry], position };
    entry.forEach((caseId) => result.set(caseId, group));
  });
  return result;
}

function getLearningOrderPositions(): Map<number, { position: number; memberPosition: number }> {
  const result = new Map<number, { position: number; memberPosition: number }>();
  learningOrder?.forEach((entry, position) => {
    const ids = Array.isArray(entry) ? entry : [entry];
    ids.forEach((caseId, memberPosition) => result.set(caseId, { position, memberPosition }));
  });
  return result;
}

const PROBABILITY_EPSILON = 1e-9;

/** True when all members of a learning group share one probability. */
export function isUniformProbabilityGroup(caseIds: number[]): boolean {
  const probabilities = caseIds.map((id) => data.find((item) => item.id === id)?.probability);
  const first = probabilities[0];
  return (
    first !== undefined &&
    probabilities.every((p) => p !== undefined && Math.abs(p - first) < PROBABILITY_EPSILON)
  );
}

/**
 * Tie-break ranks for probability sorts: the flattened learning order.
 */
export function getProbabilityTieRanks(): Map<number, number> {
  const ranks = new Map<number, number>();
  let next = 0;
  learningOrder?.forEach((entry) => {
    (Array.isArray(entry) ? entry : [entry]).forEach((id) => ranks.set(id, next++));
  });
  data.forEach((item) => {
    if (!ranks.has(item.id)) ranks.set(item.id, next++);
  });
  return ranks;
}

function getLegacyPriorityComparison(a: AlgCase, b: AlgCase): number {
  const aIsLearning = learningCases.has(a.id);
  const bIsLearning = learningCases.has(b.id);
  const aIsPlanned = plannedCases.has(a.id);
  const bIsPlanned = plannedCases.has(b.id);
  const aIsLearned = learnedCases.has(a.id);
  const bIsLearned = learnedCases.has(b.id);

  if (aIsLearning && !bIsLearning) return -1;
  if (!aIsLearning && bIsLearning) return 1;
  if (aIsPlanned && !bIsPlanned && !bIsLearning && !bIsLearned) return -1;
  if (!aIsPlanned && bIsPlanned && !aIsLearning && !aIsLearned) return 1;
  if (aIsPlanned && bIsPlanned) {
    return (plannedLevels.get(a.id) || 4) - (plannedLevels.get(b.id) || 4);
  }
  if (aIsLearned && !bIsLearned) return 1;
  if (!aIsLearned && bIsLearned) return -1;
  return 0;
}

/** Sorts priority-mode cases while preserving legacy behavior when unset. */
export function comparePriorityCases(a: AlgCase, b: AlgCase): number {
  if (!learningOrder) return getLegacyPriorityComparison(a, b);

  const positions = getLearningOrderPositions();
  const aPosition = positions.get(a.id);
  const bPosition = positions.get(b.id);
  if (!aPosition || !bPosition) return getLegacyPriorityComparison(a, b);
  if (aPosition.position === bPosition.position) {
    const entry = learningOrder[aPosition.position];
    if (Array.isArray(entry)) return aPosition.memberPosition - bPosition.memberPosition;
    return getLegacyPriorityComparison(a, b);
  }

  const aEntry = learningOrder[aPosition.position];
  const bEntry = learningOrder[bPosition.position];
  const aGroup = Array.isArray(aEntry) && aEntry.length > 1 ? aEntry : null;
  const bGroup = Array.isArray(bEntry) && bEntry.length > 1 ? bEntry : null;
  const aLearningCount = aGroup?.filter((id) => learningCases.has(id)).length || 0;
  const bLearningCount = bGroup?.filter((id) => learningCases.has(id)).length || 0;
  const aIsLearningGroup = !!aGroup && aLearningCount > 0;
  const bIsLearningGroup = !!bGroup && bLearningCount > 0;
  const aIsLearnedGroup = !!aGroup && aGroup.every((id) => learnedCases.has(id));
  const bIsLearnedGroup = !!bGroup && bGroup.every((id) => learnedCases.has(id));
  const aIsLearningSingle = !aGroup && learningCases.has(a.id);
  const bIsLearningSingle = !bGroup && learningCases.has(b.id);
  const aIsLearnedSingle = !aGroup && learnedCases.has(a.id);
  const bIsLearnedSingle = !bGroup && learnedCases.has(b.id);

  if (aIsLearningGroup !== bIsLearningGroup) return aIsLearningGroup ? -1 : 1;
  if (aIsLearningSingle !== bIsLearningSingle) return aIsLearningSingle ? -1 : 1;
  if (aIsLearningGroup && bIsLearningGroup) {
    const aRatio = aLearningCount / aGroup!.length;
    const bRatio = bLearningCount / bGroup!.length;
    if (aRatio !== bRatio) return bRatio - aRatio;
  }
  const aLearned = aIsLearnedGroup || aIsLearnedSingle;
  const bLearned = bIsLearnedGroup || bIsLearnedSingle;
  if (aLearned !== bLearned) return aLearned ? 1 : -1;
  return aPosition.position - bPosition.position;
}

function normalizeCaseState(state: StoredProgressState): StoredProgressState {
  const normalized = { ...state };
  if (normalized.evilnessEnabled === undefined && normalized.evilnessFactor !== undefined) {
    normalized.evilnessEnabled = normalized.evilnessFactor;
  }
  if (
    normalized.evilnessAffectsParity === undefined &&
    normalized.evilnessStringReturn !== undefined
  ) {
    normalized.evilnessAffectsParity = normalized.evilnessStringReturn;
  }
  for (const key of ['learned', 'learning', 'planned', 'selectorSelectedCases']) {
    if (key in state) normalized[key] = normalizeCaseIds(state[key]);
  }
  for (const key of [
    'comments',
    'plannedLevels',
    'displayNames',
    'perCaseSubtitles',
    'customAlgorithms',
    'cachedParityAlgorithms',
    'evilnessMap',
  ]) {
    if (key in state) {
      normalized[key] = normalizeCaseRecord(state[key] as Record<string, unknown>);
    }
    if (Array.isArray(normalized.evilCases)) {
      normalized.evilCases = normalized.evilCases
        .map(Number)
        .filter(Number.isInteger);
    }
  }
  if ('learningOrder' in state) {
    normalized.learningOrder = normalizeLearningOrder(state.learningOrder);
  }
  return normalized;
}

function mergeDisplayNames(source: Record<string, string>): void {
  displayNames = normalizeCaseRecord(source);
  for (const caseId in defaultDisplayNames) {
    if (!displayNames[caseId]) displayNames[caseId] = defaultDisplayNames[caseId];
  }
}

function ensureAllCasesHaveState(): void {
  data.forEach((item) => {
    if (
      !learnedCases.has(item.id) &&
      !learningCases.has(item.id) &&
      !plannedCases.has(item.id)
    ) {
      plannedCases.add(item.id);
      plannedLevels.set(item.id, 4);
    }
    if (!plannedLevels.has(item.id) && plannedCases.has(item.id)) {
      plannedLevels.set(item.id, 4);
    }
  });
}

export function initializeSVGData(notifyStore = true): void {
  getHomepageShapeSVGs(homepageImageSettings, svgData);
  applyHomepageSVGsLive(svgData);
  if (notifyStore) notify();
}

export function initializeSVGDataForCases(cases: readonly Pick<AlgCase, 'top' | 'bottom'>[]): void {
  ensureHomepageShapeSVGsForCases(homepageImageSettings, svgData, cases);
}

function getPriorityBootCaseIds(): number[] {
  const sorted = [...data];
  sorted.sort((a, b) => b.probability - a.probability);
  sorted.sort(learningOrder ? comparePriorityCases : getLegacyPriorityComparison);
  return sorted.slice(0, BOOT_STATE_CARD_COUNT).map((item) => item.id);
}

function pickRecordEntries<T>(source: Record<number, T>, keys: readonly number[]): Record<number, T> {
  const picked: Record<number, T> = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

function pickMapEntries<T>(source: Map<number, T>, keys: readonly number[]): Record<number, T> {
  const picked: Record<number, T> = {};
  for (const key of keys) {
    const value = source.get(key);
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

function createStateSnapshot(bootOnly = false): StoredProgressState {
  const bootCaseIds = bootOnly ? getPriorityBootCaseIds() : [];
  return {
    learned: Array.from(learnedCases),
    learning: Array.from(learningCases),
    planned: Array.from(plannedCases),
    comments: bootOnly ? pickMapEntries(comments, bootCaseIds) : Object.fromEntries(comments),
    plannedLevels: Object.fromEntries(plannedLevels),
    learningOrder: learningOrder ? getLearningOrder() : undefined,
    displayNames: bootOnly ? pickRecordEntries(displayNames, bootCaseIds) : displayNames,
    hideInstructions,
    colorScheme,
    tracingPositions: getShapePatterns(),
    perCaseSubtitles: bootOnly
      ? pickMapEntries(perCaseSubtitles, bootCaseIds)
      : Object.fromEntries(perCaseSubtitles),
    cornerStickerMode,
    customAlgorithms: bootOnly
      ? pickMapEntries(customAlgorithms, bootCaseIds)
      : Object.fromEntries(customAlgorithms),
    cachedParityAlgorithms: bootOnly
      ? pickMapEntries(cachedParityAlgorithms, bootCaseIds)
      : Object.fromEntries(cachedParityAlgorithms),
    lastParityCalculationSettings,
    generalNotes: bootOnly ? '' : generalNotes,
    algVariables: bootOnly ? {} : Object.fromEntries(algVariables),
    evilCases: evilCasesFromMap(evilnessMap),
  };
}

export function saveState(): void {
  try {
    updateCspObject(CSP_PROGRESS_KEY, {
      ...createStateSnapshot(),
      sortMode: currentSortMode,
      evilnessEnabled: evilnessFactor,
      evilnessAffectsParity: evilnessAffectsParity,
      evilCases: evilCasesFromMap(evilnessMap),
    });
    updateCspObject(CSP_BOOT_KEY, { ...createStateSnapshot(true), version: 1 });
    updateCspObject(CSP_PREFERENCES_KEY, {
      currentPreset,
      enhancedAccess,
      algorithmFontSize,
      profileName,
      profileAvatar,
      theme:
        typeof document !== 'undefined'
          ? document.documentElement.getAttribute('data-theme') || undefined
          : undefined,
    });
  } catch (e) {
    console.error('Error saving state:', e);
  }
}

function applyStoredState(state: StoredProgressState): void {
  learnedCases.clear();
  learningCases.clear();
  plannedCases.clear();
  comments.clear();
  plannedLevels.clear();
  perCaseSubtitles.clear();
  customAlgorithms.clear();
  cachedParityAlgorithms.clear();
  algVariables.clear();

  const normalized = normalizeCaseState(state);
  learningOrder = normalizeLearningOrder(normalized.learningOrder);
  normalizeCaseIds(normalized.learned).forEach((v) => learnedCases.add(v));
  normalizeCaseIds(normalized.learning).forEach((v) => learningCases.add(v));
  normalizeCaseIds(normalized.planned).forEach((v) => plannedCases.add(v));
  Object.entries((normalized.comments as Record<string, unknown>) || {}).forEach(([k, v]) =>
    comments.set(Number(k), String(v)),
  );
  Object.entries((normalized.plannedLevels as Record<string, unknown>) || {}).forEach(([k, v]) =>
    plannedLevels.set(Number(k), Number(v)),
  );
  hideInstructions = !!state.hideInstructions;
  hideParenthesis = Boolean(
    (state.preferences as Record<string, unknown> | undefined)?.hideParentheses ??
      state.hideParenthesis,
  );
  colorScheme = { ...DEFAULT_COLOR_SCHEME, ...((state.colorScheme as Partial<ColorScheme>) || {}) };
  scrambleImageSize = Number(state.scrambleImageSize) || 200;
  const patternsBeforeImport = JSON.stringify(getShapePatterns());
  if (state.tracingPositions || state.customShapesForParityTracerLibrary) {
    const tracingPositions = state.tracingPositions || state.customShapesForParityTracerLibrary;
    updateCspObject(CSP_PROGRESS_KEY, {
      tracingPositions:
        typeof tracingPositions === 'string'
          ? JSON.parse(tracingPositions)
          : tracingPositions,
    });
  }
  const patternsChanged = JSON.stringify(getShapePatterns()) !== patternsBeforeImport;
  if (patternsChanged) refreshHomepageSVGs();
  Object.entries((normalized.perCaseSubtitles as Record<string, unknown>) || {}).forEach(([k, v]) =>
    perCaseSubtitles.set(Number(k), String(v)),
  );
  cornerStickerMode = (state.cornerStickerMode as CornerMode) || 'counterclockwise';
  Object.entries(
    (normalized.customAlgorithms || {}) as Record<string, { odd?: string[]; even?: string[] }>,
  )
    .forEach(([k, v]) => customAlgorithms.set(Number(k), v));
  generalNotes = String(state.generalNotes || '');
  Object.entries((state.algVariables as Record<string, unknown>) || {}).forEach(([k, v]) =>
    algVariables.set(k, String(v)),
  );

  if (state.displayNames) {
    mergeDisplayNames(normalized.displayNames as Record<string, string>);
  } else {
    displayNames = { ...defaultDisplayNames };
  }

  Object.entries(
    (normalized.cachedParityAlgorithms || {}) as Record<string, { odd: string[]; even: string[] }>,
  )
    .forEach(([k, v]) => cachedParityAlgorithms.set(Number(k), v));
  lastParityCalculationSettings = (state.lastParityCalculationSettings as Record<string, unknown>) || null;

  if (state.evilnessEnabled !== undefined) evilnessFactor = Boolean(state.evilnessEnabled);
  if (state.evilnessAffectsParity !== undefined) {
    evilnessAffectsParity = Boolean(state.evilnessAffectsParity);
  }
  if (state.evilCases !== undefined || state.evilnessMap !== undefined) {
    evilnessMap = evilMapFromCases(state.evilCases ?? normalized.evilnessMap);
  }
}

function loadStoredEvilnessOverrides(): void {
  const progress = readCspObject(CSP_PROGRESS_KEY);
  const preferences = readCspObject(CSP_PREFERENCES_KEY);
  const theme = preferences.theme;
  if (
    typeof document !== 'undefined' &&
    (theme === 'dark' || theme === 'light')
  ) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (preferences.enhancedAccess !== undefined) enhancedAccess = Boolean(preferences.enhancedAccess);
  if (progress.evilnessEnabled !== undefined) evilnessFactor = Boolean(progress.evilnessEnabled);
  if (progress.evilnessAffectsParity !== undefined) {
    evilnessAffectsParity = Boolean(progress.evilnessAffectsParity);
  }
  if (progress.evilCases !== undefined) {
    evilnessMap = evilMapFromCases(progress.evilCases);
  }
  if (preferences.currentPreset) currentPreset = String(preferences.currentPreset);
}

function loadSavedState(): void {
  try {
    const saved = localStorage.getItem(CSP_PROGRESS_KEY);
    if (saved) {
      applyStoredState(JSON.parse(saved) as StoredProgressState);
    }

    loadStoredEvilnessOverrides();
    ensureAllCasesHaveState();
    syncParityAnalyzerEvilness();
    fullSavedStateLoaded = true;
    saveState();
  } catch (e) {
    console.error('Error loading saved state:', e);
  }
}

function loadBootSavedState(): boolean {
  try {
    const saved = localStorage.getItem(CSP_BOOT_KEY);
    if (!saved) return false;
    applyStoredState(JSON.parse(saved) as StoredProgressState);
    loadStoredEvilnessOverrides();
    ensureAllCasesHaveState();
    syncParityAnalyzerEvilness();
    return true;
  } catch (e) {
    console.error('Error loading boot state:', e);
    return false;
  }
}

if (isFirstLoad) {
  displayNames = { ...defaultDisplayNames };
  saveState();
}

if (isFirstLoad || !loadBootSavedState()) {
  loadSavedState();
}

export function hydrateSavedStateDetails(): void {
  if (fullSavedStateLoaded) return;
  loadSavedState();
  notify();
}

// ── Presets ─────────────────────────────────────────────────────────────────
async function loadPresetData(presetName: string, boot = false): Promise<Record<string, unknown> | null> {
  try {
    const presetPath = (boot ? BOOT_PRESET_CONFIG[presetName] : undefined) || PRESET_CONFIG[presetName];
    if (!presetPath) {
      throw new Error(`Preset "${presetName}" not found in configuration`);
    }
    const response = await fetch(presetPath);
    if (!response.ok) throw new Error('Preset file not found');
    return normalizeCaseState(await response.json());
  } catch (error) {
    console.error('Error loading preset:', error);
    return null;
  }
}

export function getPresetDefaults(): Record<string, unknown> | null {
  return presetData;
}

async function loadPresetAsDefaults(presetName: string): Promise<boolean> {
  const preset = await loadPresetData(presetName);
  if (!preset) return false;
  currentPreset = presetName;
  presetData = preset;
  updateCspObject(CSP_PREFERENCES_KEY, { currentPreset });
  return true;
}

export async function initializePreset(): Promise<void> {
  const savedPreset = String(readCspObject(CSP_PREFERENCES_KEY).currentPreset || "Matt's_Preset");
  if (PRESET_CONFIG[savedPreset]) {
    await loadPresetAsDefaults(savedPreset);
  }
}

export async function applyPreset(
  presetName: string,
  _skipWarning = false,
  silent = false,
  applyFull = false,
  deferParity = false,
  boot = false,
): Promise<void> {
  const preset = await loadPresetData(presetName, boot);
  if (!preset) return;

  learningOrder = normalizeLearningOrder(preset.learningOrder);
  if (
    preset.sortMode === 'priority' ||
    preset.sortMode === 'probability' ||
    preset.sortMode === 'antiProbability'
  ) {
    currentSortMode = preset.sortMode;
  }
  if (preset.displayNames) {
    displayNames = normalizeCaseRecord(preset.displayNames as Record<string, string>);
  }
  const preferences = (preset.preferences || {}) as Record<string, unknown>;
  if (
    applyFull &&
    typeof document !== 'undefined' &&
    (preferences.theme === 'dark' || preferences.theme === 'light')
  ) {
    document.documentElement.setAttribute('data-theme', preferences.theme);
  }
  comments.clear();
  Object.entries(normalizeCaseRecord(preset.comments as Record<string, string> | undefined)).forEach(
    ([k, v]) => comments.set(Number(k), String(v)),
  );
  colorScheme = { ...DEFAULT_COLOR_SCHEME, ...((preset.colorScheme as Partial<ColorScheme>) || {}) };

  const patternsBefore = JSON.stringify(getShapePatterns());
  if (preset.tracingPositions || preset.customShapesForParityTracerLibrary) {
    const tracingPositions = preset.tracingPositions || preset.customShapesForParityTracerLibrary;
    updateCspObject(CSP_PROGRESS_KEY, {
      tracingPositions:
        typeof tracingPositions === 'string'
          ? JSON.parse(tracingPositions)
          : tracingPositions,
    });
  }
  const patternsChanged = JSON.stringify(getShapePatterns()) !== patternsBefore;

  if (preset.homepageShapeSVGCache) {
    if (boot) {
      Object.keys(svgData).forEach((key) => delete svgData[key]);
    }
    seedHomepageShapeSVGs(
      homepageImageSettings,
      svgData,
      preset.homepageShapeSVGCache as HomepageShapeSVGCachePayload,
    );
  }
  // SVGs generated before the patterns loaded carry stale marks.
  if (patternsChanged) refreshHomepageSVGs();

  perCaseSubtitles.clear();
  Object.entries(
    normalizeCaseRecord(preset.perCaseSubtitles as Record<string, string> | undefined),
  ).forEach(([k, v]) => perCaseSubtitles.set(Number(k), String(v)),
  );
  cornerStickerMode = (preset.cornerStickerMode as CornerMode) || 'counterclockwise';

  customAlgorithms.clear();
  Object.entries(
    normalizeCaseRecord(
      preset.customAlgorithms as Record<string, { odd?: string[]; even?: string[] }> | undefined,
    ),
  ).forEach(([k, v]) => customAlgorithms.set(Number(k), v));

  if (preset.evilCases !== undefined || preset.evilnessMap !== undefined) {
    evilnessMap = evilMapFromCases(preset.evilCases ?? preset.evilnessMap);
  }
  if (preset.evilnessEnabled !== undefined) evilnessFactor = Boolean(preset.evilnessEnabled);
  else if (preset.evilnessFactor !== undefined) evilnessFactor = Boolean(preset.evilnessFactor);
  if (preset.evilnessAffectsParity !== undefined)
    evilnessAffectsParity = Boolean(preset.evilnessAffectsParity);
  else if (preset.evilnessStringReturn !== undefined)
    evilnessAffectsParity = Boolean(preset.evilnessStringReturn);

  generalNotes = (preset.generalNotes as string) || '';

  const presetParityCache = preset.cachedParityAlgorithms as
    | Record<string, { odd: string[]; even: string[] }>
    | undefined;
  cachedParityAlgorithms.clear();
  if (presetParityCache) {
    Object.entries(presetParityCache).forEach(([k, v]) =>
      cachedParityAlgorithms.set(Number(k), v),
    );
  }

  if (applyFull) {
    if (preset.scrambleImageSize != null) scrambleImageSize = Number(preset.scrambleImageSize);
    if (preset.hideInstructions !== undefined) hideInstructions = Boolean(preset.hideInstructions);
    const training = (preset.training || {}) as Record<string, unknown>;
    if (preferences.profileName) {
      profileName = String(preferences.profileName);
    } else if (preset.profileName) {
      profileName = String(preset.profileName);
    }
    if (preferences.profileAvatar) {
      profileAvatar = String(preferences.profileAvatar);
    } else if (preset.profileAvatar) {
      profileAvatar = String(preset.profileAvatar);
    }
    if (preset.parityTracerImageSize != null && preferences.ptImageSize == null)
      preferences.ptImageSize = Number(preset.parityTracerImageSize);
    if (preset.parityTracerShowArrow != null || preset.parityTracerArrowSettings != null) {
      preferences.ptArrow = {
        ...(preset.parityTracerArrowSettings
          ? JSON.parse(String(preset.parityTracerArrowSettings))
          : {}),
        enabled: preset.parityTracerShowArrow !== false,
      };
    }
    if (preset.profileName != null) preferences.profileName = profileName;
    if (preset.profileAvatar != null) preferences.profileAvatar = profileAvatar;
    updateCspObject(CSP_PREFERENCES_KEY, preferences);
    updateCspObject('cspTraining', training);
  }

  currentPreset = presetName;
  presetData = preset;
  lastParityCalculationSettings = presetParityCache ? getParityCalculationSettings() : null;
  saveState();
  // Cases were reloaded, so any pending re-order no longer applies.
  needsReorder = false;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sqg:preset-loaded'));
  if (!silent) {
    notify();
    updateProgress();
  }

  if (!deferParity && needsParityRecalculation()) {
    calculateAndCacheAllParity();
  }
}

export async function hydratePresetDetails(presetName: string): Promise<void> {
  const preset = await loadPresetData(presetName);
  if (!preset) return;

  if (preset.displayNames) mergeDisplayNames(preset.displayNames as Record<string, string>);

  if (preset.learningOrder !== undefined) {
    learningOrder = normalizeLearningOrder(preset.learningOrder);
  }

  comments.clear();
  Object.entries(normalizeCaseRecord(preset.comments as Record<string, string> | undefined)).forEach(
    ([k, v]) => comments.set(Number(k), String(v)),
  );

  perCaseSubtitles.clear();
  Object.entries(
    normalizeCaseRecord(preset.perCaseSubtitles as Record<string, string> | undefined),
  ).forEach(([k, v]) => perCaseSubtitles.set(Number(k), String(v)),
  );

  customAlgorithms.clear();
  Object.entries(
    normalizeCaseRecord(
      preset.customAlgorithms as Record<string, { odd?: string[]; even?: string[] }> | undefined,
    ),
  ).forEach(([k, v]) => customAlgorithms.set(Number(k), v));

  generalNotes = (preset.generalNotes as string) || generalNotes;
  presetData = { ...(presetData || {}), ...preset };
  lastParityCalculationSettings = null;
  await yieldToBrowser();
  saveState();
  notify();
}

// ── Export / Import ─────────────────────────────────────────────────────────
export function exportData(): void {
  const state: Record<string, unknown> = {
    learned: Array.from(learnedCases),
    learning: Array.from(learningCases),
    planned: Array.from(plannedCases),
    comments: Object.fromEntries(comments),
    plannedLevels: Object.fromEntries(plannedLevels),
    learningOrder: learningOrder ? getLearningOrder() : undefined,
    displayNames,
    colorScheme,
    tracingPositions: getShapePatterns(),
    perCaseSubtitles: Object.fromEntries(perCaseSubtitles),
    cornerStickerMode,
    customAlgorithms: Object.fromEntries(customAlgorithms),
    generalNotes,
    algVariables: Object.fromEntries(algVariables),
    evilnessEnabled: evilnessFactor,
    evilnessAffectsParity: evilnessAffectsParity,
    evilCases: evilCasesFromMap(evilnessMap),
    sortMode: currentSortMode,
    preferences: {
      ...readCspObject(CSP_PREFERENCES_KEY),
      hideInstructions,
      hideParentheses: hideParenthesis,
      profileName,
      profileAvatar,
      theme:
        typeof document !== 'undefined'
          ? document.documentElement.getAttribute('data-theme') || undefined
          : undefined,
    },
    training: {
      ...readCspObject('cspTraining'),
      scramImageSize: readCspObject('cspTraining').scramImageSize ?? scrambleImageSize,
    },
  };
  if (typeof (window as unknown as { selectorExportHook?: (s: Record<string, unknown>) => void })
    .selectorExportHook === 'function') {
    (window as unknown as { selectorExportHook: (s: Record<string, unknown>) => void })
      .selectorExportHook(state);
  }
  const dataStr = JSON.stringify(state, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'squango-CSP.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function importData(jsonStr: string): void {
  try {
    const state = JSON.parse(jsonStr);
    const normalized = normalizeCaseState(state);

    if (state.tracingPositions || state.customShapesForParityTracerLibrary) {
      const tracingPositions = state.tracingPositions || state.customShapesForParityTracerLibrary;
      updateCspObject(CSP_PROGRESS_KEY, {
        tracingPositions:
          typeof tracingPositions === 'string'
            ? JSON.parse(tracingPositions)
            : tracingPositions,
      });
    }

    learnedCases.clear();
    learningCases.clear();
    plannedCases.clear();
    comments.clear();
    plannedLevels.clear();
    learningOrder = normalizeLearningOrder(normalized.learningOrder);
    perCaseSubtitles.clear();
    customAlgorithms.clear();
    cachedParityAlgorithms.clear();
    algVariables.clear();

    normalizeCaseIds(normalized.learned).forEach((v) => learnedCases.add(v));
    normalizeCaseIds(normalized.learning).forEach((v) => learningCases.add(v));
    normalizeCaseIds(normalized.planned).forEach((v) => plannedCases.add(v));
    Object.entries((normalized.comments as Record<string, unknown>) || {}).forEach(([k, v]) =>
      comments.set(Number(k), String(v)),
    );
    Object.entries((normalized.plannedLevels as Record<string, unknown>) || {}).forEach(([k, v]) =>
      plannedLevels.set(Number(k), Number(v)),
    );

    if (state.displayNames) {
      mergeDisplayNames(normalized.displayNames as Record<string, string>);
    } else {
      displayNames = { ...defaultDisplayNames };
    }
    colorScheme = { ...DEFAULT_COLOR_SCHEME, ...(state.colorScheme || {}) };
    Object.entries((normalized.perCaseSubtitles as Record<string, unknown>) || {}).forEach(([k, v]) =>
      perCaseSubtitles.set(Number(k), String(v)),
    );
    cornerStickerMode = (state.cornerStickerMode as CornerMode) || 'counterclockwise';
    Object.entries((normalized.customAlgorithms as Record<string, unknown>) || {}).forEach(([k, v]) =>
      customAlgorithms.set(Number(k), v as { odd?: string[]; even?: string[] }),
    );
    generalNotes = state.generalNotes || '';
    Object.entries(state.algVariables || {}).forEach(([k, v]) =>
      algVariables.set(k, String(v)),
    );

    if (normalized.evilnessEnabled !== undefined)
      evilnessFactor = Boolean(normalized.evilnessEnabled);
    if (normalized.evilnessAffectsParity !== undefined)
      evilnessAffectsParity = Boolean(normalized.evilnessAffectsParity);
    if (state.evilCases !== undefined || state.evilnessMap !== undefined) {
      evilnessMap = evilMapFromCases(state.evilCases ?? normalized.evilnessMap);
    }

    generalNotes = state.generalNotes || '';
    algVariables.clear();
    Object.entries(state.algVariables || {}).forEach(([k, v]) => algVariables.set(k, String(v)));

    if (normalized.evilnessEnabled !== undefined)
      evilnessFactor = Boolean(normalized.evilnessEnabled);
    if (normalized.evilnessAffectsParity !== undefined)
      evilnessAffectsParity = Boolean(normalized.evilnessAffectsParity);
    if (state.evilCases !== undefined || state.evilnessMap !== undefined) {
      evilnessMap = evilMapFromCases(state.evilCases ?? normalized.evilnessMap);
    }

    if (typeof (window as unknown as { selectorImportHook?: (s: Record<string, unknown>) => void })
      .selectorImportHook === 'function') {
      (window as unknown as { selectorImportHook: (s: Record<string, unknown>) => void })
        .selectorImportHook(normalized);
    }

    lastParityCalculationSettings = null;

    const importedPreferences = { ...(state.preferences || {}) } as Record<string, unknown>;
    const importedTraining = (state.training || {}) as Record<string, unknown>;
    if (importedPreferences.hideInstructions !== undefined) {
      hideInstructions = Boolean(importedPreferences.hideInstructions);
    } else if (state.hideInstructions !== undefined) {
      hideInstructions = Boolean(state.hideInstructions);
      importedPreferences.hideInstructions = hideInstructions;
    }
    if (importedPreferences.hideParentheses !== undefined) {
      hideParenthesis = Boolean(importedPreferences.hideParentheses);
    } else if (state.hideParenthesis !== undefined) {
      hideParenthesis = Boolean(state.hideParenthesis);
      importedPreferences.hideParentheses = hideParenthesis;
    }
    if (importedTraining.scramImageSize === undefined && state.scrambleImageSize !== undefined) {
      importedTraining.scramImageSize = Number(state.scrambleImageSize);
    }
    if (state.sortMode === 'priority' || state.sortMode === 'probability' || state.sortMode === 'antiProbability') {
      currentSortMode = state.sortMode;
    }
    const importedTheme = importedPreferences.theme;
    if (
      typeof document !== 'undefined' &&
      (importedTheme === 'dark' || importedTheme === 'light')
    ) {
      document.documentElement.setAttribute('data-theme', importedTheme);
    }
    if (state.parityTracerImageSize != null && importedPreferences.ptImageSize == null)
      importedPreferences.ptImageSize = Number(state.parityTracerImageSize);
    if (state.parityTracerShowArrow !== undefined || state.parityTracerArrowSettings) {
      importedPreferences.ptArrow = {
        ...(state.parityTracerArrowSettings
          ? JSON.parse(String(state.parityTracerArrowSettings))
          : {}),
        enabled: state.parityTracerShowArrow !== false,
      };
    }
    if (state.trainingScrambleImageSize != null)
      importedTraining.scramImageSize = Number(state.trainingScrambleImageSize);
    if (state.trainingScrambleTextSize != null)
      importedTraining.scramTextSize = Number(state.trainingScrambleTextSize);
    if (state.trainingHoldToStart != null)
      importedTraining.holdToStart = Number(state.trainingHoldToStart);
    if (importedPreferences.profileName) {
      profileName = String(importedPreferences.profileName);
    } else if (state.profileName) {
      profileName = String(state.profileName);
      importedPreferences.profileName = profileName;
    }
    if (importedPreferences.profileAvatar) {
      profileAvatar = String(importedPreferences.profileAvatar);
    } else if (state.profileAvatar) {
      profileAvatar = String(state.profileAvatar);
      importedPreferences.profileAvatar = profileAvatar;
    }
    if (typeof importedPreferences.currentPreset === 'string' && importedPreferences.currentPreset) {
      currentPreset = importedPreferences.currentPreset;
    }
    if (state.trainingTimerSize != null) importedTraining.timerSize = Number(state.trainingTimerSize);
    if (state.trainingShowPrevScramble !== undefined)
      importedTraining.showPrevScram = Boolean(state.trainingShowPrevScramble);
    updateCspObject(CSP_PREFERENCES_KEY, importedPreferences);
    updateCspObject('cspTraining', importedTraining);

    saveState();
    notify();
    updateProgress();

    if (needsParityRecalculation()) {
      calculateAndCacheAllParity();
    }
  } catch (e) {
    console.error('Error importing data:', e);
    throw e;
  }
}

export function handleFileImport(file: File): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    importData(String(e.target?.result));
  };
  reader.readAsText(file);
}

// ── Progress ────────────────────────────────────────────────────────────────
export interface ProgressStats {
  totalCases: number;
  learnedCount: number;
  p: number;
  c: number;
  safety: number;
}

export function updateProgress(): ProgressStats {
  const totalCases = data.length;
  const learnedCount = learnedCases.size;

  const totalProbability = data.reduce((sum, item) => sum + item.probability, 0);
  const learnedProbability = data
    .filter((item) => learnedCases.has(item.id))
    .reduce((sum, item) => sum + item.probability, 0);

  const p = Math.round((learnedProbability / totalProbability) * 100 * 2) / 2;
  const x = learnedCount;

  const exp = Math.exp;
  const numerator =
    1 / (1 + exp(-12 * ((x - 1) / 89 - 0.4170435672))) -
    1 / (1 + exp(-12 * (0 - 0.4170435672)));
  const denominator =
    1 / (1 + exp(-12 * (1 - 0.4170435672))) - 1 / (1 + exp(-12 * (0 - 0.4170435672)));
  const c = 80 + 14 * (numerator / denominator);

  const safety = (p * c) / 100 + 0.5 * (100 - p);

  const stats = { totalCases, learnedCount, p, c, safety };
  return stats;
}

// ── Learning-state mutations ────────────────────────────────────────────────
export function toggleLearned(name: CaseRef, rightClick = false, notifyStore = true): void {
  const caseId = getCaseId(name);
  if (caseId === undefined) return;
  if (rightClick) {
    if (learnedCases.has(caseId)) {
      learnedCases.delete(caseId);
      learningCases.add(caseId);
      plannedCases.delete(caseId);
    } else if (learningCases.has(caseId)) {
      learningCases.delete(caseId);
      plannedCases.add(caseId);
      if (!plannedLevels.has(caseId)) plannedLevels.set(caseId, 4);
    } else {
      learnedCases.add(caseId);
      learningCases.delete(caseId);
      plannedCases.delete(caseId);
    }
  } else {
    if (learnedCases.has(caseId)) {
      learnedCases.delete(caseId);
      learningCases.delete(caseId);
      plannedCases.add(caseId);
      if (!plannedLevels.has(caseId)) plannedLevels.set(caseId, 4);
    } else if (learningCases.has(caseId)) {
      learningCases.delete(caseId);
      learnedCases.add(caseId);
      plannedCases.delete(caseId);
    } else {
      learningCases.add(caseId);
      plannedCases.delete(caseId);
    }
  }
  saveState();
  updateProgress();
  if (notifyStore) notify();
}

export function adjustPriority(name: CaseRef, delta: number, notifyStore = true): number {
  const caseId = getCaseId(name);
  if (caseId === undefined) return 4;
  if (!plannedCases.has(caseId)) {
    plannedCases.add(caseId);
    learnedCases.delete(caseId);
    learningCases.delete(caseId);
  }

  const currentLevel = plannedLevels.get(caseId) || 4;
  let newLevel = currentLevel + delta;
  if (newLevel < 1) newLevel = 1;
  if (newLevel > 7) newLevel = 7;

  plannedLevels.set(caseId, newLevel);
  saveState();
  updateProgress();
  if (notifyStore) notify();
  return newLevel;
}

export function setPlannedLevel(name: CaseRef, level: number, notifyStore = true): void {
  const caseId = getCaseId(name);
  if (caseId === undefined) return;
  plannedLevels.set(caseId, level);
  saveState();
  updateProgress();
  if (notifyStore) notify();
}

// ── Display names & misc helpers ────────────────────────────────────────────
export function getDisplayName(caseName: CaseRef): string {
  const caseId = getCaseId(caseName);
  if (caseId !== undefined) return displayNames[caseId] || defaultDisplayNames[caseId] || getCaseKey(caseId) || String(caseId);
  return String(caseName);
}

export function getDefaultDisplayName(caseName: CaseRef): string {
  const caseId = getCaseId(caseName);
  if (caseId !== undefined) return defaultDisplayNames[caseId] || getCaseKey(caseId) || String(caseId);
  return String(caseName);
}

export function getShortDisplayName(fullName: string): string {
  let shortName = fullName;
  const replacements: Record<string, string> = {
    'Paired Edges': 'Pair',
    'Perpendicular Edges': 'L',
    'L-Shape': 'L',
    'Parallel Edges': 'Line',
    Square: 'Sq',
    Muffin: 'Muff',
    Barrel: 'Barr',
    Scallop: 'Scal',
    Left: 'L.',
    Right: 'R.',
  };
  for (const [pattern, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(pattern, 'gi');
    shortName = shortName.replace(regex, replacement);
  }
  shortName = shortName.replace(/(\d)-(\d)/g, '$1$2');
  return shortName;
}

export function getAliases(caseName: CaseRef): string[] {
  const caseKey = getCaseKey(caseName) || String(caseName);
  const displayName = getDisplayName(caseName);
  const aliases = [caseKey.toLowerCase(), displayName.toLowerCase()];

  if (displayName.includes('/')) {
    const parts = displayName.split('/');
    aliases.push(...parts.map((p) => p.trim().toLowerCase()));
  }

  aliases.push(displayName.replace(/-/g, '').toLowerCase());
  aliases.push(caseKey.replace(/-/g, '').toLowerCase());

  const variations: Record<string, string[]> = {
    perpendicular: ['l-shape', 'l shape', 'arrow'],
    'l-shape': ['perpendicular', 'arrow'],
    parallel: ['line', 'crown'],
    line: ['parallel', 'crown'],
    paired: ['pair'],
    pair: ['paired'],
    muffin: ['mushroom'],
    mushroom: ['muffin'],
  };

  for (const [key, alts] of Object.entries(variations)) {
    if (displayName.toLowerCase().includes(key)) {
      aliases.push(...alts);
    }
  }

  return [...new Set(aliases)];
}

export function getColorName(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#000000': 'Black',
    '#474747': 'Black',
    '#FFFFFF': 'White',
    '#FFFF00': 'Yellow',
    '#FFD700': 'Yellow',
  };
  return colorMap[hexColor.toUpperCase()] || 'Top';
}

// ── Setters (persist + notify) ──────────────────────────────────────────────
export function setSortMode(mode: SortMode): void {
  currentSortMode = mode;
  updateCspObject(CSP_PROGRESS_KEY, { sortMode: mode });
}

export function setCornerStickerMode(mode: CornerMode): void {
  cornerStickerMode = mode;
  saveState();
  notify();
}

export function setColorScheme(scheme: Partial<ColorScheme>): void {
  colorScheme = { ...colorScheme, ...scheme };
  saveState();
  notify();
}

export function setEvilnessFactor(value: boolean): void {
  evilnessFactor = value;
  lastParityCalculationSettings = null;
  syncParityAnalyzerEvilness();
  saveState();
  notify();
}

export function setEvilnessAffectsParity(value: boolean): void {
  evilnessAffectsParity = value;
  lastParityCalculationSettings = null;
  syncParityAnalyzerEvilness();
  saveState();
  notify();
}

export function setEvilnessMap(map: Record<string, boolean>): void {
  evilnessMap = map;
  lastParityCalculationSettings = null;
  syncParityAnalyzerEvilness();
  saveState();
  notify();
}

export function setHideInstructions(value: boolean): void {
  hideInstructions = value;
  saveState();
  notify();
}

export function setHideParenthesis(value: boolean): void {
  hideParenthesis = value;
  saveState();
  notify();
}

export function setEnhancedAccess(value: boolean): void {
  enhancedAccess = value;
  updateCspObject(CSP_PREFERENCES_KEY, { enhancedAccess: value });
  notify();
}

export function setAlgorithmFontSize(value: number): void {
  algorithmFontSize = value;
  updateCspObject(CSP_PREFERENCES_KEY, { algorithmFontSize: value });
  notify();
}

export function setScrambleImageSize(value: number): void {
  scrambleImageSize = value;
  saveState();
  notify();
}

export function setGeneralNotes(value: string): void {
  generalNotes = value;
  saveState();
  notify();
}

export function setProfile(name: string, avatar: string): void {
  profileName = name;
  profileAvatar = avatar;
  updateCspObject(CSP_PREFERENCES_KEY, { profileName: name, profileAvatar: avatar });
  notify();
}

export function setComment(name: CaseRef, text: string): void {
  const caseId = getCaseId(name);
  if (caseId === undefined) return;
  comments.set(caseId, text);
  saveState();
  notify();
}

export function setSubtitle(name: CaseRef, text: string): void {
  const caseId = getCaseId(name);
  if (caseId === undefined) return;
  perCaseSubtitles.set(caseId, text);
  saveState();
  notify();
}

export function setCustomAlgorithms(name: CaseRef, value: { odd?: string[]; even?: string[] }): void {
  const caseId = getCaseId(name);
  if (caseId === undefined) return;
  customAlgorithms.set(caseId, value);
  saveState();
  notify();
}

export function setAlgVariable(key: string, value: string): void {
  algVariables.set(key, value);
  saveState();
  notify();
}

export function toggleTheme(isDark: boolean): void {
  const next = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  updateCspObject(CSP_PREFERENCES_KEY, { theme: next });
  refreshHomepageSVGs();
  notify();
}

export function getHomepageImageSettings(): HomepageImageSettings {
  return homepageImageSettings;
}

let homepageRegenTimer: ReturnType<typeof setTimeout> | null = null;

export function refreshHomepageSVGs(): void {
  if (homepageRegenTimer) clearTimeout(homepageRegenTimer);
  homepageRegenTimer = setTimeout(() => {
    homepageRegenTimer = null;
    getHomepageShapeSVGs(homepageImageSettings, svgData);
    applyHomepageSVGsLive(svgData);
    saveState();
    notify();
  }, 250);
}

export function updateHomepageImageSettings(patch: Partial<HomepageImageSettings>): void {
  homepageImageSettings = { ...homepageImageSettings, ...patch };
  saveHomepageImageSettings(homepageImageSettings);
  refreshHomepageSVGs();
  notify();
}

export function resetHomepageImageSettingsState(): HomepageImageSettings {
  homepageImageSettings = resetHomepageImageSettingsDefaults();
  refreshHomepageSVGs();
  notify();
  return homepageImageSettings;
}

export function getNeedsReorder(): boolean {
  return needsReorder;
}

export function setNeedsReorder(value: boolean, notifyStore = true): void {
  needsReorder = value;
  if (notifyStore) notify();
}

export function getPlannedLevel(caseName: CaseRef): number {
  const caseId = getCaseId(caseName);
  return caseId === undefined ? 4 : plannedLevels.get(caseId) || 4;
}

/** Commit the draft only after its compressed reload cache is ready. */
export async function saveHomepageImageSettingsForReload(settings: HomepageImageSettings): Promise<void> {
  await prepareHomepageShapeSVGCache(settings);
  if (homepageRegenTimer) clearTimeout(homepageRegenTimer);
  homepageRegenTimer = null;
  saveHomepageImageSettings(settings);
  homepageImageSettings = { ...settings };
  saveState();
}
