#!/usr/bin/env node

/**
 * Generate a boot preset from a regular preset.
 *
 * Usage:
 *   node generate-boot-preset.js path/to/Preset.json [output-file-or-directory]
 *
 * If the second argument is omitted, the output is written beside the input
 * as "<preset-name>.boot.json".
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node generate-boot-preset.js <preset.json> [output-file-or-directory]');
  process.exitCode = 1;
  return;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read JSON preset "${filePath}": ${error.message}`);
  }
}

function outputPathFor(input, outputArgument) {
  const inputDirectory = path.dirname(input);
  const inputName = path.basename(input, path.extname(input));
  if (!outputArgument) {
    return path.join(inputDirectory, `${inputName}.boot.json`);
  }
  if (path.extname(outputArgument).toLowerCase() === '.json') {
    return outputArgument;
  }
  return path.join(outputArgument, `${inputName}.boot.json`);
}

function copyIfPresent(source, target, key) {
  if (source[key] !== undefined) target[key] = source[key];
}

function generateBootPreset(preset) {
  const boot = {};

  // These fields are needed to render the initial cards consistently.
  for (const key of [
    'displayNames',
    'perCaseSubtitles',
    'comments',
    'generalNotes',
    'customAlgorithms',
    'learningOrder',
    'sortMode',
    'colorScheme',
    'cornerStickerMode',
    'evilCases',
    'evilnessEnabled',
    'evilnessAffectsParity',
    'hideInstructions',
    'tracingPositions',
  ]) {
    copyIfPresent(preset, boot, key);
  }

  // Boot data should use the same grouped settings schema as the source.
  copyIfPresent(preset, boot, 'preferences');

  // Training is intentionally not needed to render the homepage and is
  // therefore excluded from the boot file.

  // Preserve generated caches when the source preset contains them. A normal
  // slim preset generally does not, so the app will generate those values.
  for (const key of ['homepageShapeSVGCache']) {
    copyIfPresent(preset, boot, key);
  }

  // Keep only the fields understood by the current boot loader. This also
  // prevents progress, profile, and export-only data from leaking into boot.
  return boot;
}

function generateInitialSVGCache(input, preset) {
  const learningOrder = Array.isArray(preset.learningOrder) ? preset.learningOrder : [];
  const caseIds = learningOrder
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .slice(0, 4)
    .map(Number)
    .filter(Number.isInteger);
  const casesPath = path.resolve('main/src/data/cases.ts');
  const homepageShapesPath = path.resolve('main/src/lib/homepageShapes.ts');
  const runner = `
    import fs from 'node:fs';
    import { CASES } from ${JSON.stringify(casesPath)};
    import {
      DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
      generateHomepageShapeSVGCache,
      homepageShapeSVGKey,
    } from ${JSON.stringify(homepageShapesPath)};
    globalThis.document = { documentElement: { getAttribute: () => 'dark' } };
    const preset = JSON.parse(fs.readFileSync(${JSON.stringify(input)}, 'utf8'));
    const storage = new Map([
      ['cspProgress', JSON.stringify({ tracingPositions: preset.tracingPositions || {} })],
    ]);
    globalThis.localStorage = {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    };
    const settings = {
      ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS,
      ...((preset.preferences && preset.preferences.homepageImage) || {}),
    };
    const ids = ${JSON.stringify(caseIds)};
    const keys = ids.flatMap((id) => {
      const item = CASES.find((candidate) => candidate.id === id);
      return item
        ? [homepageShapeSVGKey('top', item.top), homepageShapeSVGKey('bottom', item.bottom)]
        : [];
    });
    const cache = await generateHomepageShapeSVGCache(settings, keys);
    process.stdout.write(JSON.stringify(cache));
  `;
  const tempBase = path.join(os.tmpdir(), `csp-boot-svg-${process.pid}`);
  const sourcePath = `${tempBase}.mjs`;
  const bundlePath = `${tempBase}.bundle.mjs`;
  try {
    fs.writeFileSync(sourcePath, runner);
    const bundle = spawnSync(
      path.resolve('main/node_modules/.bin/esbuild'),
      ['--bundle', '--platform=node', '--format=esm', `--outfile=${bundlePath}`, sourcePath],
      { encoding: 'utf8' },
    );
    if (bundle.status !== 0) {
      throw new Error(bundle.stderr.trim());
    }
    const result = spawnSync(process.execPath, [bundlePath], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim());
    }
    return JSON.parse(result.stdout);
  } finally {
    for (const file of [sourcePath, bundlePath]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Temporary files may already have been removed.
      }
    }
  }
}

try {
  const input = path.resolve(inputPath);
  const output = path.resolve(outputPathFor(input, process.argv[3]));
  const preset = readJson(input);
  const boot = generateBootPreset(preset);
  if (!boot.homepageShapeSVGCache) {
    boot.homepageShapeSVGCache = generateInitialSVGCache(input, preset);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(boot, null, 2)}\n`);
  console.log(`Generated ${output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
