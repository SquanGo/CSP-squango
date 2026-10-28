export const CSP_PROGRESS_KEY = 'cspProgress';
export const CSP_BOOT_KEY = 'cspBoot';
export const CSP_PREFERENCES_KEY = 'cspPreferences';
export const CSP_TRAINING_KEY = 'cspTraining';
export const CSP_CACHE_KEY = 'cspCache';
export const hadStoredProgress =
  typeof localStorage !== 'undefined' &&
  (localStorage.getItem(CSP_PROGRESS_KEY) !== null ||
    localStorage.getItem('sq1-parity-progress') !== null);

type StorageObject = Record<string, unknown>;

function readObject(key: string): StorageObject {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as StorageObject
      : {};
  } catch {
    return {};
  }
}

function writeObject(key: string, value: StorageObject): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function hasOwn(object: StorageObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readLegacyValue(key: string): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
}

function parseLegacyJSON(key: string): unknown {
  const raw = key.startsWith('[') || key.startsWith('{') ? key : readLegacyValue(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function migrateStorage(): void {
  if (typeof localStorage === 'undefined') return;

  const progress = readObject(CSP_PROGRESS_KEY);
  const legacyProgress = readObject('sq1-parity-progress');
  Object.assign(progress, legacyProgress, progress);
  if (progress.evilnessEnabled === undefined && legacyProgress.evilnessFactor !== undefined) {
    progress.evilnessEnabled = legacyProgress.evilnessFactor;
  }
  if (
    progress.evilnessAffectsParity === undefined &&
    legacyProgress.evilnessStringReturn !== undefined
  ) {
    progress.evilnessAffectsParity = legacyProgress.evilnessStringReturn;
  }
  delete progress.evilnessFactor;
  delete progress.evilnessStringReturn;
  if (!hasOwn(progress, 'evilCases') && progress.evilnessMap !== undefined) {
    const legacyMap = progress.evilnessMap;
    progress.evilCases = legacyMap && typeof legacyMap === 'object'
      ? Object.entries(legacyMap as Record<string, unknown>)
          .filter(([, value]) => value === true)
          .map(([id]) => Number(id))
          .filter(Number.isInteger)
      : [];
  }
  delete progress.evilnessMap;
  delete progress.theme;
  if (!hasOwn(progress, 'tracingPositions')) {
    const legacyTracingPositions =
      legacyProgress.customShapesForParityTracerLibrary ??
      parseLegacyJSON('customShapesForParityTracerLibrary');
    if (legacyTracingPositions !== undefined) {
      try {
        progress.tracingPositions =
          typeof legacyTracingPositions === 'string'
            ? JSON.parse(legacyTracingPositions)
            : legacyTracingPositions;
      } catch {
        // Leave malformed tracing data for the normal loader to ignore.
      }
    }
  }
  delete progress.customShapesForParityTracerLibrary;
  const progressFields: Record<string, [string, unknown]> = {
    sortMode: ['sortMode', undefined],
    evilnessEnabled: ['evilnessFactor', undefined],
    evilnessAffectsParity: ['evilnessStringReturn', undefined],
    evilCases: ['evilnessMap', undefined],
  };
  for (const [field, [legacyKey]] of Object.entries(progressFields)) {
    if (!hasOwn(progress, field)) {
      const value = readLegacyValue(legacyKey);
      if (value !== null) {
        progress[field] = field === 'evilCases'
          ? Object.entries((parseLegacyJSON(legacyKey) as Record<string, unknown>) || {})
              .filter(([, enabled]) => enabled === true)
              .map(([id]) => Number(id))
              .filter(Number.isInteger)
          : value;
        if (field === 'evilnessEnabled' || field === 'evilnessAffectsParity') {
          progress[field] = value === 'true';
        }
      }
    }
  }

  const boot = readObject(CSP_BOOT_KEY);
  Object.assign(boot, readObject('sq1-parity-boot-progress-v1'));
  if (!hasOwn(boot, 'version')) boot.version = 1;

  const preferences = readObject(CSP_PREFERENCES_KEY);
  const preferenceKeys: Record<string, [string, (value: string) => unknown]> = {
    currentPreset: ['currentPreset', String],
    enhancedAccess: ['enhancedAccess', (value) => value === 'true'],
    algorithmFontSize: ['algorithmFontSize', (value) => Number(value)],
    profileName: ['profileName', String],
    profileAvatar: ['profileAvatar', String],
    z2Tracing: ['z2TracingModeForParityTracerLibrary', (value) => value === 'true'],
    ptImageSize: ['parityTracerImageSize', (value) => Number(value)],
    animDelay: ['sq1AutoDelay', Number],
    animSpeed: ['sq1ThreeAnimSpeed', Number],
  };
  for (const [field, [legacyKey, parse]] of Object.entries(preferenceKeys)) {
    if (!hasOwn(preferences, field)) {
      const value = readLegacyValue(legacyKey);
      if (value !== null) preferences[field] = parse(value);
    }
  }
  if (!hasOwn(preferences, 'ptArrow')) {
    const arrow = parseLegacyJSON('parityTracerArrowSettings');
    const enabled = readLegacyValue('parityTracerShowArrow');
    if (arrow !== undefined || enabled !== null) {
      preferences.ptArrow = {
        ...(arrow && typeof arrow === 'object' ? arrow : {}),
        enabled: enabled === null ? true : enabled === 'true',
      };
    }
  }
  if (!hasOwn(preferences, 'homepageImage')) {
    const homepageImage = parseLegacyJSON('sq1-homepage-image-settings');
    if (homepageImage !== undefined) preferences.homepageImage = homepageImage;
  }

  const training = readObject(CSP_TRAINING_KEY);
  const trainingKeys: Record<string, [string, (value: string) => unknown]> = {
    inspection: ['trainingEnableInspection', (value) => value === 'true'],
    parityQuiz: ['trainingEnableParityQuiz', (value) => value === 'true'],
    hideScramImage: ['trainingHideScrambleImage', (value) => value === 'true'],
    holdToStart: ['trainingHoldToStart', Number],
    inspectionBeep: ['trainingInspectionBeep', (value) => value === 'true'],
    scramImageSize: ['trainingScrambleImageSize', Number],
    scramTextSize: ['trainingScrambleTextSize', Number],
    showPrevScram: ['trainingShowPrevScramble', (value) => value === 'true'],
    timerSize: ['trainingTimerSize', Number],
    selectedMulti: ['sq1-selector-cases', (value) => parseLegacyJSON(value) ?? []],
    selectedEvilness: ['sq1-selector-evilness', (value) => parseLegacyJSON(value) ?? []],
    selectedParityQuiz: ['sq1-selector-parity', (value) => parseLegacyJSON(value) ?? []],
  };
  for (const [field, [legacyKey, parse]] of Object.entries(trainingKeys)) {
    if (!hasOwn(training, field)) {
      const raw = readLegacyValue(legacyKey);
      if (raw !== null) training[field] = parse(raw);
    }
  }
  const eachCaseKeys: Record<string, string> = {
    eachCaseMulti: 'goThroughEachCase:sq1-selector-cases',
    eachCaseEvilness: 'goThroughEachCase:sq1-selector-evilness',
    eachCaseParityQuiz: 'goThroughEachCase:sq1-selector-parity',
  };
  const legacyEachCase = readLegacyValue('trainingGoThroughEachCase');
  for (const [field, legacyKey] of Object.entries(eachCaseKeys)) {
    if (!hasOwn(training, field)) {
      const value = readLegacyValue(legacyKey);
      if (value !== null) training[field] = value === 'true';
      else if (legacyEachCase !== null) training[field] = legacyEachCase === 'true';
    }
  }

  const cache = readObject(CSP_CACHE_KEY);
  const legacyCardHeights = parseLegacyJSON('sqg-card-height-estimates-v1');
  if (!hasOwn(cache, 'cardHeightEstimates') && legacyCardHeights !== undefined) {
    cache.cardHeightEstimates = legacyCardHeights;
  }
  const legacySvgVersion = readLegacyValue('sq1-homepage-svg-cache-settings');
  if (!hasOwn(cache, 'homepageSvgSettings') && legacySvgVersion !== null) {
    cache.homepageSvgSettings = legacySvgVersion;
  }
  const homepageSVG = cache.homepageSVG && typeof cache.homepageSVG === 'object'
    ? cache.homepageSVG as StorageObject
    : {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('sq1-homepage-svg-cache-item:')) continue;
    const entryKey = key.slice('sq1-homepage-svg-cache-item:'.length);
    const value = localStorage.getItem(key);
    if (value !== null && !hasOwn(homepageSVG, entryKey)) homepageSVG[entryKey] = value;
  }
  if (Object.keys(homepageSVG).length > 0) cache.homepageSVG = homepageSVG;

  try {
    writeObject(CSP_PROGRESS_KEY, progress);
    writeObject(CSP_BOOT_KEY, boot);
    writeObject(CSP_PREFERENCES_KEY, preferences);
    writeObject(CSP_TRAINING_KEY, training);
    writeObject(CSP_CACHE_KEY, cache);

    const oldKeys = [
      'sq1-parity-progress',
      'sq1-parity-boot-progress-v1',
      'sortMode',
      'evilnessFactor',
      'evilnessStringReturn',
      'evilnessMap',
      'customShapesForParityTracerLibrary',
      'sqg-csp-theme',
      'currentPreset',
      'enhancedAccess',
      'algorithmFontSize',
      'profileName',
      'profileAvatar',
      'z2TracingModeForParityTracerLibrary',
      'parityTracerImageSize',
      'parityTracerShowArrow',
      'parityTracerArrowSettings',
      'sq1AutoDelay',
      'sq1ThreeAnimSpeed',
      'sq1-homepage-image-settings',
      'sqg-card-height-estimates-v1',
      'sq1-homepage-svg-cache-settings',
      'trainingEnableInspection',
      'trainingEnableParityQuiz',
      'trainingHideScrambleImage',
      'trainingHoldToStart',
      'trainingInspectionBeep',
      'trainingScrambleImageSize',
      'trainingScrambleTextSize',
      'trainingShowPrevScramble',
      'trainingTimerSize',
      'sq1-selector-cases',
      'sq1-selector-evilness',
      'sq1-selector-parity',
      'sq1-selector-color',
      'trainingGoThroughEachCase',
      'sq1AnimBothLayers',
      'sq1AnimImageSize',
      'sq1AnimVerticalDisplay',
      'sq1AnimSpeed',
    ];
    for (const key of oldKeys) localStorage.removeItem(key);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('goThroughEachCase:') || key?.startsWith('sq1-homepage-svg-cache-item:')) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error('Error migrating localStorage:', error);
  }
}

migrateStorage();

export function readCspObject(key: string): StorageObject {
  return readObject(key);
}

export function updateCspObject(key: string, updates: StorageObject): void {
  writeObject(key, { ...readObject(key), ...updates });
}

export function removeCspField(key: string, field: string): void {
  const value = readObject(key);
  delete value[field];
  writeObject(key, value);
}
