/**
 * Homepage case-shape SVG generation.
 *
 * Replaces the hardcoded SVGs (previously in shapeSvgs.json) with images
 * generated at runtime from the canonical expanded layer shapes, marked with
 * the live parity-tracer tracing-start piece. Rendered with the draw-scramble
 * style system (Abid, layer ratio fixed at 1), compressed with svgo and cached
 * in localStorage. Regenerated whenever the homepage image settings change.
 */

import { createConfiguredCore, renderExpandedLayerSVG, type Square1RenderOptions } from './drawScrambleCore';
import { getMarkedLayerExpanded } from './expandedShape';
import { getShapePatterns, type ShapeSVGStyle } from './parityAnalyzer';
import { BOTTOM_ANCHOR_SLOT } from './tracingStart';
import { LAYER_SHAPE_BITS } from '../data/layerShapes';
import { SHAPE_DISPLAY_ROTATIONS } from '../data/shapeDisplay';
import { CASES } from '../data/cases';
import type { AlgCase } from '../data/types';
import { CSP_CACHE_KEY, CSP_PREFERENCES_KEY, readCspObject, updateCspObject } from './storage';

export interface HomepageImageSettings {
  /** Light-theme tracing-start piece color (the '2'/'3' marked slots). */
  specialPieceColor: string;
  /** Dark-theme tracing-start piece color. */
  specialPieceColorDark: string;
  /** Stroke color for piece outlines. Empty string = follow the theme. */
  borderColor: string;
  /** Slice indicator color. Empty string = follow the theme. */
  sliceColor: string;
  strokeWidthOuter: number;
  sliceStrokeWidth: number;
  strokeWidthInner: number;
  topColor: string;
  bottomColor: string;
  frontColor: string;
  rightColor: string;
  backColor: string;
  leftColor: string;
}

export const DEFAULT_HOMEPAGE_IMAGE_SETTINGS: HomepageImageSettings = {
  specialPieceColor: '#FFD700',
  specialPieceColorDark: '#00ffffc0',
  borderColor: '',
  sliceColor: '',
  strokeWidthOuter: 0.012,
  sliceStrokeWidth: 0.012,
  strokeWidthInner: 0.01,
  topColor: 'transparent',
  bottomColor: 'transparent',
  frontColor: 'transparent',
  rightColor: 'transparent',
  backColor: 'transparent',
  leftColor: 'transparent',
};

const SVG_CACHE_VERSION = 11;
const HOMEPAGE_SLICE_STROKE_SCALE = 0.22;
const HOMEPAGE_SLICE_RADIUS_SCALE = 0.9;
const svgDataHashes = new WeakMap<object, string>();

export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

export function loadHomepageImageSettings(): HomepageImageSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS };
  try {
    const stored = readCspObject(CSP_PREFERENCES_KEY).homepageImage;
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS, ...stored as Partial<HomepageImageSettings> };
    }
  } catch {
    // ignore malformed stored settings
  }
  return { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS };
}

export function saveHomepageImageSettings(settings: HomepageImageSettings): void {
  if (typeof localStorage === 'undefined') return;
  updateCspObject(CSP_PREFERENCES_KEY, { homepageImage: settings });
}

export function resetHomepageImageSettings(): HomepageImageSettings {
  const defaults = { ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS };
  saveHomepageImageSettings(defaults);
  return defaults;
}

function resolveStrokeColor(color: string): string {
  if (color && color.trim() !== '') return color;
  return isDarkTheme() ? 'var(--text-primary)' : '#000000';
}

function resolveSpecialPieceColor(settings: HomepageImageSettings): string {
  return isDarkTheme() ? settings.specialPieceColorDark : settings.specialPieceColor;
}

/** Homepage-matching style for the tracing-position shape editor. */
export function getHomepageShapeStyle(
  settings: HomepageImageSettings = loadHomepageImageSettings(),
): ShapeSVGStyle {
  return {
    border: resolveStrokeColor(settings.borderColor),
    fill: settings.topColor,
    startColor: resolveSpecialPieceColor(settings),
    strokeWidthOuter: settings.strokeWidthOuter,
    strokeWidthInner: settings.strokeWidthInner,
  };
}

/** Marked, display-rotated expanded layer for a homepage image (see expandedShape.ts). */
export function getMarkedExpandedForLayer(
  layerName: string,
  layer: 'top' | 'bottom',
): string | undefined {
  return getMarkedLayerExpanded(layerName, layer);
}

export function renderLayerShapeSVG(
  layerName: string,
  settings: HomepageImageSettings = DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
  layer: 'top' | 'bottom' = 'top',
): string | null {
  const marked = getMarkedExpandedForLayer(layerName, layer);
  if (!marked) return null;
  const border = resolveStrokeColor(settings.borderColor);
  const slice = resolveStrokeColor(settings.sliceColor);
  const specialPieceColor = resolveSpecialPieceColor(settings);

  const options: Square1RenderOptions = {
    size: 200,
    showSlice: true,
    styleSettings: {
      layerRatio: 1,
      strokeWidthOuter: settings.strokeWidthOuter,
      sliceStrokeWidth: settings.sliceStrokeWidth * HOMEPAGE_SLICE_STROKE_SCALE,
      strokeWidthInner: settings.strokeWidthInner,
      sliceRadiusScale: HOMEPAGE_SLICE_RADIUS_SCALE,
    },
    colorScheme: {
      top: layer === 'bottom' ? settings.bottomColor : settings.topColor,
      bottom: settings.bottomColor,
      front: 'transparent',
      right: 'transparent',
      back: 'transparent',
      left: 'transparent',
      border,
      'slice-indicator': slice,
    },
    piecesColors: {
      edgeColors: {
        '0': { inner: 'top', outer: 'back' },
        '2': { inner: specialPieceColor, outer: specialPieceColor },
      },
      cornerColors: {
        '1': { top: 'top', left: 'back', right: 'left' },
        '3': {
          top: specialPieceColor,
          left: specialPieceColor,
          right: specialPieceColor,
        },
      },
      sliceColors: { top: 'top', bottom: 'bottom' },
    },
    layer,
  };
  return renderExpandedLayerSVG(marked, options);
}

export function homepageShapeSVGKey(layer: 'top' | 'bottom', layerName: string): string {
  return `${layer}:${layerName}`;
}

export interface HomepageShapeSVGCachePayload {
  hash: string;
  shapes: Record<string, string>;
}

function splitHomepageShapeSVGKey(key: string): { layer: 'top' | 'bottom'; layerName: string } | null {
  const separator = key.indexOf(':');
  if (separator === -1) return null;
  const layer = key.slice(0, separator);
  if (layer !== 'top' && layer !== 'bottom') return null;
  return { layer, layerName: key.slice(separator + 1) };
}

function createHomepageCoreOptions(settings: HomepageImageSettings): Square1RenderOptions {
  const border = resolveStrokeColor(settings.borderColor);
  const slice = resolveStrokeColor(settings.sliceColor);
  const specialPieceColor = resolveSpecialPieceColor(settings);
  return {
    size: 200,
    showSlice: true,
    styleSettings: {
      layerRatio: 1,
      strokeWidthOuter: settings.strokeWidthOuter,
      sliceStrokeWidth: settings.sliceStrokeWidth * HOMEPAGE_SLICE_STROKE_SCALE,
      strokeWidthInner: settings.strokeWidthInner,
      sliceRadiusScale: HOMEPAGE_SLICE_RADIUS_SCALE,
    },
    colorScheme: {
      top: settings.topColor,
      bottom: settings.bottomColor,
      front: 'transparent',
      right: 'transparent',
      back: 'transparent',
      left: 'transparent',
      border,
      'slice-indicator': slice,
    },
    piecesColors: {
      edgeColors: {
        '0': { inner: 'top', outer: 'back' },
        '2': { inner: specialPieceColor, outer: specialPieceColor },
      },
      cornerColors: {
        '1': { top: 'top', left: 'back', right: 'left' },
        '3': {
          top: specialPieceColor,
          left: specialPieceColor,
          right: specialPieceColor,
        },
      },
      sliceColors: { top: 'top', bottom: 'bottom' },
    },
  };
}

function renderHomepageShapeSVGWithCore(
  core: ReturnType<typeof createConfiguredCore>,
  options: Square1RenderOptions,
  key: string,
): string | null {
  const parsed = splitHomepageShapeSVGKey(key);
  if (!parsed) return null;
  core.setColorScheme({ top: parsed.layer === 'bottom' ? options.colorScheme!.bottom : options.colorScheme!.top });
  const marked = getMarkedExpandedForLayer(parsed.layerName, parsed.layer);
  if (!marked) return null;
  return core.getExpandedLayerSVG(
    marked,
    options.size,
    options.muted,
    options.showSlice,
    parsed.layer,
    options.exportPad,
  );
}

function cacheItemStorageKey(hash: string, key: string): string {
  return `${hash}:${key}`;
}

function yieldToBrowser(timeout = 500): Promise<void> {
  if (typeof window !== 'undefined') {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) {
      return new Promise((resolve) => w.requestIdleCallback?.(() => resolve(), { timeout }));
    }
  }
  return new Promise((resolve) => setTimeout(resolve, 32));
}

function scheduleCompressedCacheWrite(settings: HomepageImageSettings, shapes: Record<string, string>): void {
  if (typeof localStorage === 'undefined' || typeof window === 'undefined' || Object.keys(shapes).length === 0) return;
  const hash = settingsHash(settings);
  setTimeout(() => {
    void (async () => {
      try {
        await yieldToBrowser(1500);
        const compressed = await compressShapeSVGs(shapes);
        for (const [key, svg] of Object.entries(compressed)) {
          await yieldToBrowser();
          const cache = readCspObject(CSP_CACHE_KEY);
          const homepageSVG = cache.homepageSVG && typeof cache.homepageSVG === 'object'
            ? cache.homepageSVG as Record<string, unknown>
            : {};
          homepageSVG[cacheItemStorageKey(hash, key)] = svg;
          updateCspObject(CSP_CACHE_KEY, { homepageSVG });
        }
        updateCspObject(CSP_CACHE_KEY, { homepageSvgSettings: hash });
      } catch {
        // Cache storage/import failures should never affect visible cards.
      }
    })();
  }, 2500);
}

function ensureHomepageShapeSVGKeys(
  settings: HomepageImageSettings,
  svgData: Record<string, string>,
  keys: Iterable<string>,
): void {
  const uniqueKeys = Array.from(new Set(keys));
  const hash = settingsHash(settings);
  if (svgDataHashes.get(svgData) !== hash) {
    Object.keys(svgData).forEach((key) => delete svgData[key]);
    svgDataHashes.set(svgData, hash);
  }
  const missing: string[] = [];

  for (const key of uniqueKeys) {
    if (svgData[key]) continue;
    if (typeof localStorage !== 'undefined') {
      try {
        const cache = readCspObject(CSP_CACHE_KEY);
        const homepageSVG = cache.homepageSVG && typeof cache.homepageSVG === 'object'
          ? cache.homepageSVG as Record<string, unknown>
          : {};
        const legacyHash =
          typeof cache.homepageSvgSettings === 'string' &&
          cache.homepageSvgSettings.trim().startsWith('{')
            ? cache.homepageSvgSettings
            : null;
        const cached =
          homepageSVG[cacheItemStorageKey(hash, key)] ??
          (legacyHash ? homepageSVG[cacheItemStorageKey(legacyHash, key)] : undefined);
        if (cached) {
          svgData[key] = String(cached);
          continue;
        }
      } catch {
        // Fall through to raw generation.
      }
    }
    missing.push(key);
  }

  if (missing.length === 0) return;
  const coreOptions = createHomepageCoreOptions(settings);
  const core = createConfiguredCore(coreOptions);
  const generated: Record<string, string> = {};
  for (const key of missing) {
    const svg = renderHomepageShapeSVGWithCore(core, coreOptions, key);
    if (!svg) continue;
    svgData[key] = svg;
    generated[key] = svg;
  }
  scheduleCompressedCacheWrite(settings, generated);
}

export function ensureHomepageShapeSVGsForCases(
  settings: HomepageImageSettings,
  svgData: Record<string, string>,
  cases: readonly Pick<AlgCase, 'top' | 'bottom'>[],
): void {
  ensureHomepageShapeSVGKeys(
    settings,
    svgData,
    cases.flatMap((item) => [
      homepageShapeSVGKey('top', item.top),
      homepageShapeSVGKey('bottom', item.bottom),
    ]),
  );
}

export function generateAllLayerShapes(settings: HomepageImageSettings): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(LAYER_SHAPE_BITS).flatMap((layerName) => [
    homepageShapeSVGKey('top', layerName),
    homepageShapeSVGKey('bottom', layerName),
  ]);
  ensureHomepageShapeSVGKeys(settings, out, keys);
  return out;
}

/**
 * Strip the mask machinery the style system adds around invisible transparent
 * stickers. With transparent fills the stickers produce no pixels, so the
 * masks (which only exist to keep neighbor borders off the sticker fills) are
 * pure overhead. Only the strokes, the slice line and the special/golden
 * piece remain.
 */
function stripInvisibleOverhead(svg: string): string {
  let out = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  out = out.replace(/\smask="url\(#[^"]*\)"/g, '');
  out = out.replace(
    /<(polygon|polyline|path|line|rect|circle)(?=[^>]*\sfill="(?:transparent|none)")(?![^>]*\bstroke=)[^>]*\/>/g,
    '',
  );
  return out;
}

export async function compressShapeSVGs(shapes: Record<string, string>): Promise<Record<string, string>> {
  await yieldToBrowser(1500);
  const { optimize } = await import('svgo/browser');
  const out: Record<string, string> = {};
  for (const [name, svg] of Object.entries(shapes)) {
    await yieldToBrowser();
    try {
      const result = optimize(stripInvisibleOverhead(svg), {
        multipass: true,
        floatPrecision: 2,
        plugins: ['preset-default'],
      });
      out[name] = result.data;
    } catch {
      out[name] = svg;
    }
  }
  return out;
}

/** Short FNV-1a digest, keeps cache keys compact. */
function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function settingsHash(settings: HomepageImageSettings): string {
  const canonical = JSON.stringify({
    ...settings,
    __dark: isDarkTheme(),
    __svgCacheVersion: SVG_CACHE_VERSION,
    // Anything that changes which piece is marked or how the image is oriented.
    __tracing: digest(
      JSON.stringify(getShapePatterns()) +
        JSON.stringify(SHAPE_DISPLAY_ROTATIONS) +
        BOTTOM_ANCHOR_SLOT,
    ),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function getHomepageShapeSVGCacheHash(settings: HomepageImageSettings): string {
  return settingsHash(settings);
}

export async function generateHomepageShapeSVGCache(
  settings: HomepageImageSettings,
  keys: string[],
): Promise<HomepageShapeSVGCachePayload> {
  const options = createHomepageCoreOptions(settings);
  const core = createConfiguredCore(options);
  const raw: Record<string, string> = {};
  for (const key of [...new Set(keys)]) {
    const svg = renderHomepageShapeSVGWithCore(core, options, key);
    if (svg) raw[key] = svg;
  }
  return {
    hash: settingsHash(settings),
    shapes: await compressShapeSVGs(raw),
  };
}

export function seedHomepageShapeSVGs(
  settings: HomepageImageSettings,
  svgData: Record<string, string>,
  payload: HomepageShapeSVGCachePayload,
): boolean {
  const hash = settingsHash(settings);
  const legacyPresetCache = payload.hash.trim().startsWith('{');
  if (payload.hash !== hash) {
    if (!legacyPresetCache) return false;
    try {
      const legacySettings = JSON.parse(payload.hash) as { __dark?: boolean };
      if (legacySettings.__dark !== isDarkTheme()) return false;
    } catch {
      return false;
    }
  }
  for (const [key, svg] of Object.entries(payload.shapes)) {
    svgData[key] = svg;
    if (typeof localStorage !== 'undefined') {
      try {
        const cache = readCspObject(CSP_CACHE_KEY);
        const homepageSVG = cache.homepageSVG && typeof cache.homepageSVG === 'object'
          ? cache.homepageSVG as Record<string, unknown>
          : {};
        homepageSVG[cacheItemStorageKey(hash, key)] = svg;
        updateCspObject(CSP_CACHE_KEY, { homepageSVG });
      } catch {
        // Seeding is an optimization only.
      }
      svgDataHashes.set(svgData, hash);
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      updateCspObject(CSP_CACHE_KEY, { homepageSvgSettings: hash });
    } catch {
      // Seeding is an optimization only.
    }
  }
  return true;
}

/**
 * Load compressed homepage SVGs if they match the current settings + theme.
 * On a cold cache, generate raw SVGs for immediate display and compress/cache
 * them later so first meaningful paint is not blocked by svgo.
 */
export function getHomepageShapeSVGs(
  settings: HomepageImageSettings,
  svgData: Record<string, string>,
): void {
  const keys = Object.keys(LAYER_SHAPE_BITS).flatMap((layerName) => [
    homepageShapeSVGKey('top', layerName),
    homepageShapeSVGKey('bottom', layerName),
  ]);
  Object.keys(svgData).forEach((key) => delete svgData[key]);
  ensureHomepageShapeSVGKeys(settings, svgData, keys);
}

/**
 * Live-update the SVGs already rendered inside the case cards, without a full
 * grid re-render. The cards read `svgData` at render time (see cardHTML.ts), so
 * after regeneration the DOM needs this targeted patch.
 */
export function applyHomepageSVGsLive(svgData: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const shapeByCase = new Map<string, { top: string; bottom: string }>();
  for (const c of CASES) shapeByCase.set(c.key, { top: c.top, bottom: c.bottom });
  document.querySelectorAll('.card[data-case-name]').forEach((card) => {
    const name = card.getAttribute('data-case-name');
    if (!name) return;
    const shapes = shapeByCase.get(name);
    if (!shapes) return;
    const container = card.querySelector('.card-images');
    if (!container) return;
    const divs = container.children;
    if (divs.length >= 2) {
      divs[0].innerHTML = svgData[homepageShapeSVGKey('top', shapes.top)] || '';
      divs[1].innerHTML = svgData[homepageShapeSVGKey('bottom', shapes.bottom)] || '';
    }
  });
}

/** Render only the demo layers while editing; the homepage stays untouched. */
export function renderHomepageShapePreview(
  name: string,
  settings: HomepageImageSettings,
  layer: 'top' | 'bottom',
): string {
  return stripInvisibleOverhead(renderLayerShapeSVG(name, settings, layer) || '');
}

/** Prepare the exact shapes cards use, yielding between batches, before reload. */
export async function prepareHomepageShapeSVGCache(settings: HomepageImageSettings): Promise<void> {
  const hash = settingsHash(settings);
  const keys = [...new Set(CASES.flatMap(item => [
    homepageShapeSVGKey('top', item.top), homepageShapeSVGKey('bottom', item.bottom),
  ]))];
  const options = createHomepageCoreOptions(settings);
  const core = createConfiguredCore(options);
  const raw: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    if (i % 2 === 0) await yieldToBrowser();
    const svg = renderHomepageShapeSVGWithCore(core, options, keys[i]);
    if (svg) raw[keys[i]] = svg;
  }
  const compressed = await compressShapeSVGs(raw);
  if (settingsHash(settings) !== hash) throw new Error('Theme or tracing settings changed. Please save again.');
  for (const [key, svg] of Object.entries(compressed)) {
    const cache = readCspObject(CSP_CACHE_KEY);
    const homepageSVG = cache.homepageSVG && typeof cache.homepageSVG === 'object'
      ? cache.homepageSVG as Record<string, unknown>
      : {};
    homepageSVG[cacheItemStorageKey(hash, key)] = svg;
    updateCspObject(CSP_CACHE_KEY, { homepageSVG });
  }
  updateCspObject(CSP_CACHE_KEY, { homepageSvgSettings: hash });
}
