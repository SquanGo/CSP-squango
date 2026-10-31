import { beforeAll, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_NAMES, getCaseId } from '../../data/cases';

const store = new Map<string, string>();
const originalDocument = globalThis.document;
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
});

type PresetPayload = Record<string, unknown>;
let presetPayload: PresetPayload | null = null;

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({
    ok: true,
    json: async () => presetPayload,
  })),
);

let state: typeof import('../state');

beforeAll(async () => {
  state = await import('../state');
});

function loadPresetFile(name: string): PresetPayload {
  return JSON.parse(readFileSync(join(process.cwd(), 'public', 'presets', name), 'utf-8'));
}

test('slimmed presets contain no redundant derived fields', () => {
  for (const file of ["Matt's_Preset.json", 'Empty_Preset.json']) {
    const p = loadPresetFile(file);
    for (const key of [
      'learned',
      'learning',
      'planned',
      'plannedLevels',
      'cachedParityAlgorithms',
      'lastParityCalculationSettings',
    ]) {
      expect(p, `${file} should not contain ${key}`).not.toHaveProperty(key);
    }
  }
});

test('bundled presets use grouped preference and training fields', () => {
  const matt = loadPresetFile("Matt's_Preset.json");
  expect(matt).toHaveProperty('evilnessEnabled');
  expect(matt).toHaveProperty('evilnessAffectsParity');
  expect(matt).not.toHaveProperty('evilnessFactor');
  expect(matt).not.toHaveProperty('evilnessStringReturn');
  expect(matt).toHaveProperty('evilCases');
  expect(matt).not.toHaveProperty('evilnessMap');
  expect(matt.preferences).toMatchObject({
    ptImageSize: expect.any(Number),
    ptArrow: expect.objectContaining({ enabled: expect.any(Boolean) }),
  });
  expect(matt.training).toMatchObject({
    selectedMulti: expect.any(Array),
    scramTextSize: expect.any(Number),
  });
});

test("Matt's_Preset applies cleanly after slimming and rebuilds the parity cache", async () => {
  presetPayload = loadPresetFile("Matt's_Preset.json");
  await state.applyPreset("Matt's_Preset", true, true, true);

  expect(state.currentPreset).toBe("Matt's_Preset");
  expect(Object.keys(state.getPresetDefaults() ?? {})).not.toContain('cachedParityAlgorithms');
  expect(state.getPlannedLevel('Kite/Square')).toBeGreaterThan(0);
  expect(state.getPlannedLevel('8/Star')).toBeGreaterThan(0);
  expect(state.cachedParityAlgorithms.size).toBe(90);
  const kite = state.cachedParityAlgorithms.get(getCaseId('Kite/Square')!);
  expect(kite).toBeTruthy();
  expect((kite?.odd.length ?? 0) + (kite?.even.length ?? 0)).toBeGreaterThan(0);
});

test("a fresh install applies Matt's_Preset as the default", async () => {
  expect(state.isFirstLoad).toBe(true);
  presetPayload = loadPresetFile("Matt's_Preset.json");
  await state.applyPreset("Matt's_Preset", true, true, true);

  expect(state.currentPreset).toBe("Matt's_Preset");
  expect(state.getPlannedLevel('Kite/Square')).toBeGreaterThan(0);
});

test('legacy-format presets with redundant fields still load (backward compatible)', async () => {
  const slim = loadPresetFile("Matt's_Preset.json");
  const legacyNames = Object.fromEntries(
    state.data.map((item) => [
      String(item.id),
      CASE_NAMES[item.id - 1]
        .replace(/\/Pair$/, '/Paired Edges')
        .replace(/\/Line$/, '/Parallel Edges')
        .replace(/\/L$/, '/Perpendicular Edges'),
    ]),
  );
  const toLegacyCaseRecord = (record: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(record).map(([id, value]) => [legacyNames[id], value]));
  presetPayload = {
    ...slim,
    learned: ['Kite/Square'],
    learning: [],
    planned: Object.keys(slim.displayNames ?? {}).map((id) => legacyNames[id]),
    displayNames: toLegacyCaseRecord(slim.displayNames as Record<string, unknown>),
    plannedLevels: toLegacyCaseRecord(
      Object.fromEntries(Object.keys(slim.displayNames ?? {}).map((k) => [k, 4])),
    ),
    cachedParityAlgorithms: Object.fromEntries(
      Object.keys(slim.displayNames ?? {}).map((k) => [
        legacyNames[k],
        { odd: [], even: ['Done!'] },
      ]),
    ),
    lastParityCalculationSettings: { colorScheme: 'legacy' },
  };
  await state.applyPreset("Matt's_Preset", true, true, true);

  expect(state.currentPreset).toBe("Matt's_Preset");
  expect(state.getPlannedLevel('Kite/Square')).toBeGreaterThan(0);
  expect(state.cachedParityAlgorithms.size).toBe(90);
});

test('legacy imports normalize case names and rewrite saved progress with numeric IDs', () => {
  vi.stubGlobal('window', {});
  state.importData(
    JSON.stringify({
      learned: ['Kite/Square'],
      learning: [],
      planned: ['8/Star'],
      comments: { 'Kite/Square': 'legacy note' },
      plannedLevels: { '8/Star': 2 },
      displayNames: { 'Kite/Square': 'My kite label' },
    }),
  );

  const saved = JSON.parse(store.get('cspProgress') || '{}');
  expect(state.learnedCases.has(getCaseId('Kite/Square')!)).toBe(true);
  expect(state.comments.get(getCaseId('Kite/Square')!)).toBe('legacy note');
  expect(saved.learned).toContain(getCaseId('Kite/Square'));
  expect(saved.learned).not.toContain('Kite/Square');
  expect(saved.plannedLevels[String(getCaseId('8/Star'))]).toBe(2);
  expect(saved.displayNames[String(getCaseId('Kite/Square'))]).toBe('My kite label');
});

test('imports restore sort mode, theme, and current preset', () => {
  let theme = 'light';
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: vi.fn((_name: string, value: string) => {
        theme = value;
      }),
      getAttribute: vi.fn(() => theme),
    },
    querySelectorAll: vi.fn(() => []),
  });

  state.importData(
    JSON.stringify({
      sortMode: 'priority',
      preferences: { currentPreset: 'Empty_Preset', theme: 'dark' },
    }),
  );

  expect(state.currentSortMode).toBe('priority');
  expect(state.currentPreset).toBe('Empty_Preset');
  expect(JSON.parse(store.get('cspProgress') || '{}')).toMatchObject({ sortMode: 'priority' });
  expect(JSON.parse(store.get('cspProgress') || '{}').theme).toBeUndefined();
  expect(JSON.parse(store.get('cspPreferences') || '{}')).toMatchObject({
    currentPreset: 'Empty_Preset',
    theme: 'dark',
  });
  if (originalDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
  else vi.stubGlobal('document', originalDocument);
});

test('legacy evilness maps import as only the explicitly evil case IDs', () => {
  state.importData(
    JSON.stringify({
      evilnessMap: { '4': true, '10': false, '12': true },
    }),
  );

  const saved = JSON.parse(store.get('cspProgress') || '{}');
  expect(saved.evilCases).toEqual([4, 12]);
  expect(saved).not.toHaveProperty('evilnessMap');
  expect(state.evilnessMap).toEqual({ '4': true, '12': true });
});

test("Matt's boot preset seeds the first four cards' homepage SVGs", async () => {
  presetPayload = loadPresetFile("Matt's_Preset.boot.json");
  Object.keys(state.svgData).forEach((key) => delete state.svgData[key]);
  await state.applyPreset("Matt's_Preset", true, true, true, true, true);

  expect(Object.keys(state.svgData).sort()).toEqual([
    'bottom:Paired_edges',
    'bottom:Perpendicular_edges',
    'top:Left_4_2',
    'top:Right_4_2',
    'top:svg_3_3',
    'top:svg_4_1_1',
  ]);
  expect(state.svgData['top:Left_4_2']).toContain('<svg');
});

test("Matt's boot preset includes comments for every card that can render before hydration", () => {
  const boot = loadPresetFile("Matt's_Preset.boot.json");
  const ids = new Set(state.data.map((item) => String(item.id)));
  for (const field of ['comments', 'perCaseSubtitles', 'displayNames']) {
    const keys = Object.keys((boot[field] as Record<string, unknown>) || {});
    expect(keys).toHaveLength(90);
    expect(keys.every((key) => ids.has(key))).toBe(true);
  }
  expect((boot.comments as Record<string, string>)[String(getCaseId('Scallop/Shield'))]).toBeTruthy();
});

test('Matt boot-visible algorithms are classified with evilness before render', async () => {
  presetPayload = loadPresetFile("Matt's_Preset.json");
  await state.applyPreset("Matt's_Preset", true, true, true, true);
  state.cachedParityAlgorithms.clear();

  const item = state.data.find((entry) => entry.id === getCaseId('Left 4-2/Paired Edges'));
  expect(item).toBeTruthy();
  state.calculateAndCacheParityForCases([item!]);

  const classified = state.cachedParityAlgorithms.get(item!.id);
  expect(classified?.odd).toContain('(-2,-4)/(4,0)/(1,0)/(-3,-3)/');
  expect(classified?.even).toContain('(0,-2)/(-2,0)/(-1,-2)/(-3,-3)/');
});
