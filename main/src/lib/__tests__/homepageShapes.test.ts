import { afterEach, expect, test, vi } from 'vitest';
import {
  DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
  compressShapeSVGs,
  ensureHomepageShapeSVGsForCases,
  prepareHomepageShapeSVGCache,
  renderLayerShapeSVG,
  seedHomepageShapeSVGs,
} from '../homepageShapes';
import { CASES } from '../../data/cases';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('top and bottom fills survive SVG compression and use their own face colors', async () => {
  const settings = { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS, topColor: '#123456', bottomColor: '#abcdef' };
  const raw = {
    top: renderLayerShapeSVG('Left_4_2', settings, 'top')!,
    bottom: renderLayerShapeSVG('Paired_edges', settings, 'bottom')!,
  };
  const compressed = await compressShapeSVGs(raw);
  expect(compressed.top).toContain('#123456');
  expect(compressed.top).not.toContain('#abcdef');
  expect(compressed.bottom).toContain('#abcdef');
  expect(compressed.bottom).not.toContain('#123456');
});

test('unused side colors do not affect homepage images', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const original = renderLayerShapeSVG('Left_4_2');
  const altered = renderLayerShapeSVG('Left_4_2', {
    ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
    frontColor: '#ff0000', rightColor: '#00ff00', backColor: '#0000ff', leftColor: '#abcdef',
  });
  expect(altered).toBe(original);
});

test('tracing-start highlight uses the active theme color', () => {
  const settings = {
    ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
    specialPieceColor: '#FFD700',
    specialPieceColorDark: '#F4C542',
  };
  vi.stubGlobal('document', {
    documentElement: { getAttribute: vi.fn().mockReturnValue('light') },
  });
  const lightSVG = renderLayerShapeSVG('Left_4_2', settings)!;
  expect(lightSVG).toContain('#FFD700');
  expect(lightSVG).not.toContain('#F4C542');

  vi.stubGlobal('document', {
    documentElement: { getAttribute: vi.fn().mockReturnValue('dark') },
  });
  const darkSVG = renderLayerShapeSVG('Left_4_2', settings)!;
  expect(darkSVG).toContain('#F4C542');
  expect(darkSVG).not.toContain('#FFD700');
});

test('dark-theme auto stroke uses the primary text color token', () => {
  vi.stubGlobal('document', {
    documentElement: { getAttribute: vi.fn().mockReturnValue('dark') },
  });

  const svg = renderLayerShapeSVG('Left_4_2')!;
  expect(svg).toContain('var(--text-primary)');
  expect(svg).not.toContain('#c0c0c0');
});

test('legacy preset SVG caches are not reused across themes', () => {
  vi.stubGlobal('document', {
    documentElement: { getAttribute: vi.fn().mockReturnValue('dark') },
  });
  const svgData: Record<string, string> = {};
  const accepted = seedHomepageShapeSVGs(
    DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
    svgData,
    {
      hash: JSON.stringify({ __dark: false }),
      shapes: { 'top:Left_4_2': '<svg>light</svg>' },
    },
  );
  expect(accepted).toBe(false);
  expect(svgData).toEqual({});
});

test('save preparation makes every card shape available from the compressed reload cache', async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const settings = { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS, strokeWidthOuter: 0.015 };
  await prepareHomepageShapeSVGCache(settings);
  const loaded: Record<string, string> = {};
  ensureHomepageShapeSVGsForCases(settings, loaded, CASES);
  const expected = new Set(CASES.flatMap(item => [`top:${item.top}`, `bottom:${item.bottom}`]));
  expect(Object.keys(loaded).sort()).toEqual([...expected].sort());
  for (const [key, svg] of Object.entries(loaded)) {
    expect(svg, key).toContain('<svg');
    expect(svg, key).not.toContain('<mask');
  }
  const cache = JSON.parse(storage.get('cspCache') || '{}');
  expect(Object.values(cache.homepageSVG)).toEqual(expect.arrayContaining(Object.values(loaded)));
}, 15000);
