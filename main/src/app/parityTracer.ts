/**
 * Cale's Parity Tracer — port of the UI layer of legacy
 * js/tools/cales-parity-tracer.js (lines 860–2964). The engine (hexToUnits,
 * calculateParityFromHex, arrow generation, ...) lives in
 * ../lib/parityAnalyzer.ts and is reused verbatim (O(1) lookup-table parity,
 * matching the Refactor branch).
 *
 * Everything is imperative DOM (matching the rest of the ported modals):
 * the tracer modal, tracing-position config modal, per-case evilness modal and
 * the two instruction modals are created and driven from here.
 */
import { applyScramble, sq1AlgToHex, stateToHex } from '../lib/cube';
import { normalizeScramble } from '../lib/normalizer';
import {
  DEFAULT_SHAPE_PATTERNS,
  type ArrowSettings,
  type MatchedShape,
  type SixStepParity,
  adjustColorBrightness,
  applyUtilityTransformationsToScramble,
  calculateArrowAngle,
  calculateParityFromHex,
  generateArrowSVG,
  generateShapeSVG,
  getContrastColor,
  getEvilnessConfig,
  getParityTracerImageSize,
  getParityTracerSymmetryOffset,
  getShapePatterns,
  getSymmetryOffsetKey,
  getZ2TracingMode,
  hexToUnits,
  setArrowSettings,
  setCaseNameResolver,
  setColorConfig,
  setEvilnessConfig,
  setParityTracerImageSize,
  setShapePatterns,
  setShowCircularArrow,
  setZ2TracingMode,
  TOP_HEX,
} from '../lib/parityAnalyzer';
import { CSP_PREFERENCES_KEY, readCspObject } from '../lib/storage';
import { resolveThemeAwareWhite, visualizeFromHex } from '../lib/drawScramble';
import { getHomepageShapeStyle } from '../lib/homepageShapes';
import {
  closeModalWithHistory,
  pushModalState,
  removeCloseModalFromStack,
} from './modal';
import {
  colorScheme,
  cornerStickerMode,
  data,
  evilnessFactor,
  evilnessMap,
  evilnessAffectsParity,
  getCaseIdFromScramble,
  getDisplayName,
  getProbabilityTieRanks,
  hideInstructions,
  presetData,
  recalculateAllParity,
  refreshHomepageSVGs,
  saveState,
  setEvilnessMap,
} from './state';
import { notify, subscribe } from './store';
import { showToast } from './toast';
import { openUnifiedSettings } from './settingsUI';

// ── Dark-mode brightness offsets (restyle knobs) ─────────────────────────────
const DM_INPUT_BG = 4;
const DM_CARD_BG = 1;
const DM_INNER_CARD_BG = 2;
const DM_BUTTON_BG = 8;
const DM_HOVER_BG = 14;
const DM_RESULT_TITLE_COLOR = '#9299b0';

const LM_INPUT_BG = -3;
const LM_CARD_BG = -2;
const LM_INNER_CARD_BG = -4;
const LM_BUTTON_BG = -5;
const LM_HOVER_BG = -8;
const LM_RESULT_TITLE_COLOR = '#2d3748';

// ── Module state (mirrors legacy globals) ────────────────────────────────────
let shapePatterns: Record<string, string> = { ...getShapePatterns() };

let utilityZ2Enabled = false;
let utilityY2Enabled = false;
let utilityFlipColorEnabled = false;

let activeTracerClose: (() => void) | null = null;
let activeTracerSilentClose: (() => void) | null = null;

// Keep the parityAnalyzer engine's internal evilness config in sync with the
// app state so calculateParity's evilStep matches legacy behavior.
function syncEvilnessConfig(): void {
  setEvilnessConfig({ factor: evilnessFactor, affectsParity: evilnessAffectsParity, map: evilnessMap });
  setCaseNameResolver(getCaseIdFromScramble);
}

function getEvilnessFactor(): boolean {
  return getEvilnessConfig().factor;
}

function getEvilnessAffectsParity(): boolean {
  return getEvilnessConfig().affectsParity;
}

function getTracerTextColor(backgroundColor: string): string {
  const contrastColor = getContrastColor(backgroundColor);
  if (
    contrastColor === '#FFFFFF' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
  ) {
    const themeTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    if (themeTextColor) return themeTextColor;
  }
  return contrastColor;
}

function isDarkTracerSurface(backgroundColor: string): boolean {
  return getContrastColor(backgroundColor) === '#FFFFFF';
}

// Re-read the live tracer settings from localStorage (SettingsModal writes them
// there directly) and push them into the parityAnalyzer engine so arrow
// generation and z2 swap use the current values.
function refreshTracerSettings(): void {
  const preferences = readCspObject(CSP_PREFERENCES_KEY);
  setZ2TracingMode(preferences.z2Tracing !== false);
  setParityTracerImageSize(Number(preferences.ptImageSize) || 280);
  const arrow = preferences.ptArrow;
  setShowCircularArrow(!arrow || typeof arrow !== 'object' || (arrow as { enabled?: boolean }).enabled !== false);
  if (arrow && typeof arrow === 'object') setArrowSettings(arrow as Partial<ArrowSettings>);
  shapePatterns = { ...getShapePatterns() };
  syncEvilnessConfig();
}

export interface ParityTracerOptions {
  backgroundColor?: string;
  hideInstructionButton?: boolean;
  instructionText1?: string;
  instructionText2?: string;
  instructionText3?: string;
  instructionText4?: string;
  topColor?: string;
  topColorName?: string;
  topColorShort?: string;
  bottomColor?: string;
  bottomColorName?: string;
  bottomColorShort?: string;
  frontColor?: string;
  rightColor?: string;
  backColor?: string;
  leftColor?: string;
  scrambleText?: string;
  generateImage?: boolean;
  imageSize?: number;
  returnOnlyValue?: boolean;
}

interface TracerConfig {
  backgroundColor: string;
  hideInstructionButton: boolean;
  instructionText1: string;
  instructionText2: string;
  instructionText3: string;
  topLayerMainColor: string;
  topLayerColorFullName: string;
  topLayerColorAbbreviation: string;
  bottomLayerMainColor: string;
  bottomLayerColorFullName: string;
  bottomLayerColorAbbreviation: string;
  frontFaceColorForVisualization: string;
  rightFaceColorForVisualization: string;
  backFaceColorForVisualization: string;
  leftFaceColorForVisualization: string;
  scrambleTextInput: string;
  shouldGenerateImage: boolean;
  imageSizeInPixels: number;
  returnOnlyParityValue: boolean;
}

function buildTracerConfig(options: ParityTracerOptions = {}): TracerConfig {
  const config: TracerConfig = {
    backgroundColor: options.backgroundColor || '#ffffff',
    hideInstructionButton: options.hideInstructionButton || false,
    instructionText1: options.instructionText1 || 'Enter your scramble in the top input bar and press Analyze to trace parity.',
    instructionText2: options.instructionText2 || 'You can change the color scheme from Settings.',
    instructionText3: options.instructionText4 || 'Personalize your tracing methods and tracing positions from the settings button.',
    topLayerMainColor: resolveThemeAwareWhite(options.topColor || '#000000'),
    topLayerColorFullName: options.topColorName || 'Black',
    topLayerColorAbbreviation: options.topColorShort || 'B',
    bottomLayerMainColor: resolveThemeAwareWhite(options.bottomColor || '#FFFFFF'),
    bottomLayerColorFullName: options.bottomColorName || 'White',
    bottomLayerColorAbbreviation: options.bottomColorShort || 'W',
    frontFaceColorForVisualization: options.frontColor || '#CC0000',
    rightFaceColorForVisualization: options.rightColor || '#00AA00',
    backFaceColorForVisualization: options.backColor || '#FF8C00',
    leftFaceColorForVisualization: options.leftColor || '#0066CC',
    scrambleTextInput: options.scrambleText || '',
    shouldGenerateImage: options.generateImage !== false,
    imageSizeInPixels: options.imageSize || 200,
    returnOnlyParityValue: options.returnOnlyValue || false,
  };
  // Legacy bug faithfully preserved: instructionText2 ends up holding the
  // instructionText3 default ("For symmetric case...").
  config.instructionText2 = options.instructionText3 || 'For symmetric case, click on the very middle of the image to trace from the other symmetry.';
  return config;
}

function syncColorConfig(config: TracerConfig): void {
  setColorConfig({
    topLayerMainColor: config.topLayerMainColor,
    topLayerColorFullName: config.topLayerColorFullName,
    topLayerColorAbbreviation: config.topLayerColorAbbreviation,
    bottomLayerMainColor: config.bottomLayerMainColor,
    bottomLayerColorFullName: config.bottomLayerColorFullName,
    bottomLayerColorAbbreviation: config.bottomLayerColorAbbreviation,
    frontFaceColorForVisualization: config.frontFaceColorForVisualization,
    rightFaceColorForVisualization: config.rightFaceColorForVisualization,
    backFaceColorForVisualization: config.backFaceColorForVisualization,
    leftFaceColorForVisualization: config.leftFaceColorForVisualization,
  });
}

function getSvgGeometry(svg: Element, fallbackSize: number): { centerX: number; centerY: number; puzzleSize: number } {
  const originX = parseFloat(svg.getAttribute('data-origin-x') || '');
  const originY = parseFloat(svg.getAttribute('data-origin-y') || '');
  const puzzleSize = parseFloat(svg.getAttribute('data-puzzle-size') || '');

  if (Number.isFinite(originX) && Number.isFinite(originY)) {
    return {
      centerX: originX,
      centerY: originY,
      puzzleSize: Number.isFinite(puzzleSize) ? puzzleSize : fallbackSize,
    };
  }

  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    return {
      centerX: viewBox[0] + viewBox[2] / 2,
      centerY: viewBox[1] + viewBox[3] / 2,
      puzzleSize: Number.isFinite(puzzleSize) ? puzzleSize : Math.min(viewBox[2], viewBox[3]),
    };
  }

  return { centerX: fallbackSize / 2, centerY: fallbackSize / 2, puzzleSize: fallbackSize };
}

// ── Result rendering ─────────────────────────────────────────────────────────
function displayResults(container: HTMLElement, sixStepParity: SixStepParity, config: TracerConfig): void {
  function createColorSquares(codenames: string[] | undefined): string {
    if (!codenames || !codenames.length) return '';
    const colorMap: Record<string, string> = {
      O: `<span class="color-dot" style="background: ${config.backFaceColorForVisualization};"></span>`,
      G: `<span class="color-dot" style="background: ${config.rightFaceColorForVisualization};"></span>`,
      R: `<span class="color-dot" style="background: ${config.frontFaceColorForVisualization};"></span>`,
      B: `<span class="color-dot" style="background: ${config.leftFaceColorForVisualization};"></span>`,
    };
    return codenames
      .slice(0, 3)
      .map((c) => colorMap[c] || '')
      .join('');
  }

  function createPositionIndicator(hexPerm: string[]): string {
    return hexPerm
      .map((h) => {
        const isTopLayer = TOP_HEX.has(h);
        const letter = isTopLayer ? config.topLayerColorAbbreviation : config.bottomLayerColorAbbreviation;
        const bgColor = isTopLayer ? config.topLayerMainColor : config.bottomLayerMainColor;
        const textColor = getTracerTextColor(bgColor);
        return `<span style="display: inline-block; width: 18px; height: 18px; border-radius: 3px; margin: 0 1px; background: ${bgColor}; color: ${textColor}; text-align: center; line-height: 18px; font-size: 11px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${letter}</span>`;
      })
      .join('');
  }

  const textColor = getTracerTextColor(config.backgroundColor);
  const isDark = isDarkTracerSurface(config.backgroundColor);
  const cardBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, DM_CARD_BG)
    : adjustColorBrightness(config.backgroundColor, LM_CARD_BG);
  const innerCardBg = isDark
    ? adjustColorBrightness(config.backgroundColor, DM_INNER_CARD_BG)
    : adjustColorBrightness(config.backgroundColor, LM_INNER_CARD_BG);

  // Evil only counts toward the total when "Evilness affects parity" is on
  const hasEvil = getEvilnessFactor() && sixStepParity.evilStep !== null;
  const evilCounts = hasEvil && getEvilnessAffectsParity();
  const evilBadge =
    sixStepParity.evilStep === 1
      ? '<span style="color:var(--bad-case);font-weight:700;">EVIL</span>'
      : '<span style="color:var(--good-case);font-weight:700;">GOOD</span>';
  const allSteps = [...sixStepParity.steps];
  if (evilCounts) {
    allSteps.push({
      name: 'Line 7: Evilness',
      result: sixStepParity.evilStep ?? 0,
      hexPerm: [],
    });
  }

  const resultTitleColor = isDark ? DM_RESULT_TITLE_COLOR : LM_RESULT_TITLE_COLOR;
  container.innerHTML = `
    <div style="background: ${cardBgColor}; padding: 0.75rem; border-radius: 8px;">
      <h3 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: ${resultTitleColor}; font-weight: 600;">Parity Analysis</h3>
      <div class="parity-grid-tracer-lib">
        ${allSteps
          .map((step, idx) => {
            let displayContent = '';
            const lineName = step.name.split(':')[1].trim();

            if (idx === 6) {
              const evilLabel =
                step.result === 1
                  ? '<span style="color:var(--bad-case);font-weight:700;">EVIL</span>'
                  : '<span style="color:var(--good-case);font-weight:700;">GOOD</span>';
              displayContent = `${lineName}: ${evilLabel} = <strong>${step.result}</strong>`;
            } else if (step.isLayer) {
              displayContent = `${lineName}: ${createPositionIndicator(step.hexPerm)} = <strong>${step.result}</strong>`;
            } else {
              displayContent = `${lineName}: ${createColorSquares(step.codenames)} = <strong>${step.result}</strong>`;
            }

            return `
              <div style="background: ${innerCardBg}; padding: 0.5rem; border-radius: 6px;">
                <div style="font-weight: 600; font-size: 0.85rem; color: ${textColor};">
                  ${displayContent}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
      <div style="background: ${innerCardBg}; margin-top: 0.5rem; padding: 0.5rem; border-radius: 6px;">
        <div style="font-weight: 600; font-size: 0.95rem; color: ${textColor};">
          Total: ${
            evilCounts
              ? sixStepParity.total + '+' + sixStepParity.evilStep + '=' + (sixStepParity.total + (sixStepParity.evilStep ?? 0))
              : sixStepParity.total
          } → <strong>${
            (evilCounts ? sixStepParity.isOddWithEvil : sixStepParity.isOdd)
              ? 'ODD'
              : 'EVEN'
          } Parity</strong>
        </div>
      </div>
      ${
        hasEvil && !evilCounts
          ? `<div style="background: ${innerCardBg}; margin-top: 0.5rem; padding: 0.5rem; border-radius: 6px;">
        <div style="font-weight: 600; font-size: 0.85rem; color: ${textColor};">Evilness: ${evilBadge}</div>
      </div>`
          : ''
      }
    </div>
  `;
}

// ── Shape orientation (config modal piece clicks) ───────────────────────────
function setShapeOrientation(pattern: string, clickedIndex: number): void {
  const pieces = pattern.split('');
  let rotationAmount = 0;
  for (let i = 0; i < clickedIndex && i < pieces.length; i++) {
    rotationAmount++;
  }
  const rotated = pieces.slice(rotationAmount).join('') + pieces.slice(0, rotationAmount).join('');

  let shapeName = '';
  for (const [pat, name] of Object.entries(shapePatterns)) {
    if (pat === pattern) {
      shapeName = name;
      break;
    }
  }

  if (shapeName) {
    delete shapePatterns[pattern];
    shapePatterns[rotated] = shapeName;
    setShapePatterns(shapePatterns);
  }
}

// ── Instruction modals ───────────────────────────────────────────────────────
function showInstructionModal(config: TracerConfig, title: string, bodyHTML: string, zIndex: string): void {
  const textColor = getTracerTextColor(config.backgroundColor);
  const isDark = isDarkTracerSurface(config.backgroundColor);
  const cardBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, 12)
    : adjustColorBrightness(config.backgroundColor, -4);

  const instructionModal = document.createElement('div');
  instructionModal.id = 'instructionModal';
  instructionModal.className = 'training-info-modal';
  instructionModal.style.zIndex = zIndex;
  instructionModal.innerHTML = `
    <div class="training-info-content" style="background: ${config.backgroundColor};">
      <div class="training-info-header" style="background: ${cardBgColor}; color: ${textColor};">
        <span class="training-info-title">${title}</span>
        <button class="training-info-close" style="color: ${textColor};">&times;</button>
      </div>
      <div class="training-info-body">
        ${bodyHTML}
      </div>
    </div>
  `;

  document.body.appendChild(instructionModal);
  instructionModal.classList.add('active');

  const closeBtn = instructionModal.querySelector('.training-info-close') as HTMLButtonElement;
  const close = (): void => {
    closeModalWithHistory(() => {
      instructionModal.remove();
    });
  };
  closeBtn.onclick = close;
  pushModalState('instructionModal', close);
}

function showParityTracerInstructionModal(config: TracerConfig): void {
  showInstructionModal(
    config,
    'Parity Tracer Guide',
    `
      <div class="training-info-item">
        <div class="training-info-number">1</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">Enter your scramble in the input bar to analyze the parity of the scramble using the <span style="font-weight: 550; font-style:italic;">Cale's tracing</span> method.</div>
      </div>
      <div class="training-info-item">
        <div class="training-info-number">2</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">You can customize your entire parity tracer from the settings button down below. If you need to change the color scheme, go the <b>Color Scheme Settings</b> under personalization tab in settings.</div>
      </div>
      <div class="training-info-item">
        <div class="training-info-number">3</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">Toggle the <b>z2</b> button on if you want to trace parity from the z2 orientation. Similarly toggle the <b>y2</b> button on to trace parity from y2 orientation. If you scrambled you square one with wrong color on front, toggle <b>Flip Color</b> on.</div>
      </div>
      <div class="training-info-item">
        <div class="training-info-number">4</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">Personalize your tracing methods and tracing positions from the Settings:
          <ol>
            <li><b>Corner sticker mode</b> determines which sticker (left-most sticker or right-most sticker) of the corner you use for tracing. This doesn't affect parity calculations, just your personal preference.</li>
            <li><b>z2 tracing for 6 and 8 edge cases</b> means you prioritize the more edge-dense face to start your tracing, regardless of which layer it's on. This is the safest tracing mode. If you do not do z2 tracing, for 2E6E cases parity gets flipped.</li>
            <li><b>Image size</b> determine how big the image of the square 1 appear on the parity tracer screen.</li>
            <li><b>Tracing arrow</b> shows where your tracing starts on each layer. The numbered badge shows which layer you trace first (1) and second (2). You can customize the arrow's appearance or hide it completely.</li>
            <li><b>Set your tracing position</b> for each shape to have fully personalized parity tracing. This affets the parity of the <span style="font-weight:600; font-style:italic;">Algorithms on the Homescreen</span>, <span style="font-weight:600; font-style:italic;">Case in Trainer</span>, basically the <span style="font-weight:650; font-style:italic;">entire app</span>!</li>
            <li><span style="font-weight:600; font-style:italic;">Evilness</span> refers to a special tracing technique where you add 1 to your tracing for certain cases to force good alg for even parity all the time. If you are a practitioner of this technique, toggle <b>Evilness Factor</b> on from the settings. If you only want to see whether a case is evil without it changing the parity (in the tracer, homescreen, and trainer), toggle <b>Evilness Affects Parity</b> off.</li>
          </ol>
        </div>
      </div>
      <div class="training-info-item">
        <div class="training-info-number">5</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">For <b>symmetric shapes</b> (eg. square, barrel, 2-2-2, 4-4, star), click the center of the image of the shape to trace from <span style="font-weight: 550; font-style:italic;">different symmetry.</span></div>
      </div>
    `,
    '10010',
  );
}

function showConfigOrientationInstructionModal(config: TracerConfig): void {
  showInstructionModal(
    config,
    'Setting Tracing Positions Guide',
    `
      <div class="training-info-item">
        <div class="training-info-number">1</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">For each shape, select one piece as your starting point. When you trace CSP, you would start from this piece, and go clockwise.</div>
      </div>
      <div class="training-info-item">
        <div class="training-info-number">2</div>
        <div class="training-info-text" style="color: ${getTracerTextColor(config.backgroundColor)};">Please just don't trace counterclockwise.</div>
      </div>
    `,
    '10011',
  );
}

// ── Per-case Evilness modal ──────────────────────────────────────────────────
function showEvilnessCasesModal(
  modalElement: HTMLElement | null,
  _config: TracerConfig,
  mainCloseBtn: HTMLElement | null,
  mainSettingsBtn: HTMLElement | null,
): void {
  const learningRanks = getProbabilityTieRanks();
  const allCases: number[] = data
    .map((d) => d.id)
    .sort((a, b) => (learningRanks.get(a) ?? 0) - (learningRanks.get(b) ?? 0));
  const getDispName = (cn: number): string => getDisplayName(cn);

  const localEvilMap: Record<string, boolean> = { ...evilnessMap };
  let hasChanges = false;
  let evilSearchTerm = '';
  let evilFilteredCases: number[] = [...allCases];

  const evilModalDiv = document.createElement('div');
  evilModalDiv.id = 'evilModal';
  evilModalDiv.style.cssText = `
    display:flex; position:fixed; top:0; left:0; width:100%; height:100%;
    background:var(--modal-overlay); z-index:10008;
    align-items:center; justify-content:center; padding:20px; box-sizing:border-box;
  `;

  const evilInner = document.createElement('div');
  evilInner.style.cssText = `
    background:var(--surface); border-radius:14px; width:min(560px,100%);
    max-height:80vh; display:flex; flex-direction:column;
    box-shadow:0 8px 32px rgba(0,0,0,0.25); overflow:hidden;
  `;

  evilInner.innerHTML = `
    <div style="flex-shrink:0; padding:16px 20px; background:var(--surface2); border-bottom:1px solid var(--surface-border); display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
        <span style="font-size:1.15rem; font-weight:700; color:var(--text-ui);">Per-case Evilness settings</span>
        <span id="evilCountBar" style="font-size:0.8rem; color:var(--text-secondary); font-weight:400;"></span>
      </div>
      <button id="evilModalCloseBtn" style="background:none; border:none; font-size:1.6rem; cursor:pointer; color:var(--text-secondary); line-height:1; padding:0;">&times;</button>
    </div>
    <div style="flex-shrink:0; padding:10px 14px; background:var(--surface2); border-bottom:1px solid var(--surface-border); display:flex; gap:8px; align-items:center;">
      <div style="position:relative; flex:1; min-width:0;">
        <input type="text" id="evilSearchInput"
          placeholder="Search cases..."
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          style="width:100%; padding:7px 10px 7px 32px; border:1px solid var(--border-color); border-radius:7px; font-size:0.88rem; outline:none; box-sizing:border-box; background:var(--surface); color:var(--text-ui);">
        <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style="position:absolute; left:9px; top:50%; transform:translateY(-50%); width:15px; height:15px; pointer-events:none;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <select id="evilBulkAction"
        style="padding:7px 32px 7px 8px; border:1px solid var(--border-color); border-radius:8px; font-size:0.82rem; background-color:var(--surface); cursor:pointer; color:var(--text-ui); flex-shrink:0;">
        <option value="" disabled selected>Select…</option>
        <option value="mark_all_evil">Mark All Evil</option>
        <option value="mark_all_good">Mark All Good</option>
        <option value="mark_these_evil">Mark These Evil</option>
        <option value="mark_these_good">Mark These Good</option>
      </select>
    </div>
    <div id="evilCaseGrid" style="
      flex:1; overflow-y:auto; padding:10px 12px;
      display:grid; grid-template-columns:repeat(3,1fr);
      gap:7px; align-content:start;
    "></div>
    <div style="flex-shrink:0; padding:12px 16px; background:var(--surface2); border-top:1px solid var(--surface-border); display:flex; gap:8px; justify-content:flex-end; align-items:center;">
      <span id="evilUnsavedDot" style="font-size:0.8rem; color:var(--warning-color,#e08000); font-weight:600; display:none;">● Unsaved changes</span>
      <button id="evilResetBtn" style="padding:6px 14px; background:var(--surface); color:var(--text-ui); border:1px solid var(--border-color); border-radius:7px; cursor:pointer; font-size:0.85rem; font-weight:600;">Reset to Default</button>
      <button id="evilCancelBtn" style="padding:6px 14px; background:var(--surface); color:var(--text-ui); border:1px solid var(--border-color); border-radius:7px; cursor:pointer; font-size:0.85rem; font-weight:600;">Cancel</button>
      <button id="evilSaveBtn" style="padding:6px 14px; background:var(--bar-learned); color:var(--text-on-color); border:none; border-radius:7px; cursor:pointer; font-size:0.85rem; font-weight:600; opacity:0.4; pointer-events:none;" disabled>Save &amp; Apply</button>
    </div>
  `;

  evilModalDiv.appendChild(evilInner);
  document.body.appendChild(evilModalDiv);

  function renderEvilGrid(): void {
    const grid = evilInner.querySelector('#evilCaseGrid') as HTMLElement | null;
    if (!grid) return;

    evilFilteredCases = evilSearchTerm
      ? allCases.filter((cn) => {
          const dn = getDispName(cn).toLowerCase();
          const term = evilSearchTerm;
          if (!term.includes('/')) return dn.includes(term);
          const [p1, p2] = term.split('/').map((p) => p.trim());
          const parts = dn.split('/').map((p) => p.trim());
          if (parts.length === 2) {
            return (
              (parts[0].includes(p1) && parts[1].includes(p2)) ||
              (parts[1].includes(p1) && parts[0].includes(p2))
            );
          }
          return false;
        })
      : [...allCases];

    grid.innerHTML = evilFilteredCases
      .map((cn) => {
        const isEvil = localEvilMap[cn] === true;
        const dn = getDispName(cn);
        const displayText = dn.includes('/')
          ? dn.replace(/ /g, '\u00A0').replace('/', '/\u200B')
          : dn;

        const bgColor = isEvil ? 'var(--evil-case-bg)' : 'var(--good-case-bg)';
        const borderColor2 = isEvil ? 'var(--evil-case-border)' : 'var(--good-case-border)';
        const textCol = isEvil ? 'var(--evil-case-text)' : 'var(--good-case-text)';
        const escaped = String(cn);

        return `<div
          data-case="${escaped}"
          onclick="window._evilToggleCase && window._evilToggleCase('${escaped}')"
          style="
            padding:7px 8px; background:${bgColor};
            border:2px solid ${borderColor2}; border-radius:7px;
            cursor:pointer; display:flex; align-items:center;
            user-select:none; box-sizing:border-box; width:100%;
          ">
          <span style="font-size:0.78rem; font-weight:600; color:${textCol}; line-height:1.3; word-break:break-word;">${displayText}</span>
        </div>`;
      })
      .join('');

    const countBar = evilInner.querySelector('#evilCountBar');
    if (countBar) {
      const evilCount = allCases.filter((cn) => localEvilMap[cn] === true).length;
      countBar.textContent =
        `${evilCount} evil, ${allCases.length - evilCount} good` +
        (evilSearchTerm ? ` · ${evilFilteredCases.length} shown` : '');
    }
  }

  function markChanged(): void {
    hasChanges = true;
    const saveBtn = evilInner.querySelector('#evilSaveBtn') as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.style.opacity = '1';
      saveBtn.style.pointerEvents = 'auto';
      saveBtn.removeAttribute('disabled');
    }
    const dot = evilInner.querySelector('#evilUnsavedDot') as HTMLElement | null;
    if (dot) dot.style.display = 'inline';
  }

  (window as unknown as Record<string, unknown>)._evilToggleCase = (cn: string): void => {
    localEvilMap[cn] = !localEvilMap[cn];
    renderEvilGrid();
    markChanged();
  };

  (window as unknown as Record<string, unknown>)._evilBulkHandler = (action: string): void => {
    switch (action) {
      case 'mark_all_evil':
        allCases.forEach((cn) => {
          localEvilMap[cn] = true;
        });
        break;
      case 'mark_all_good':
        allCases.forEach((cn) => {
          localEvilMap[cn] = false;
        });
        break;
      case 'mark_these_evil':
        evilFilteredCases.forEach((cn) => {
          localEvilMap[cn] = true;
        });
        break;
      case 'mark_these_good':
        evilFilteredCases.forEach((cn) => {
          localEvilMap[cn] = false;
        });
        break;
    }
    renderEvilGrid();
    markChanged();
  };

  const searchInput = evilInner.querySelector('#evilSearchInput') as HTMLInputElement;
  searchInput.addEventListener('input', (e) => {
    evilSearchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
    renderEvilGrid();
  });

  const bulkSelect = evilInner.querySelector('#evilBulkAction') as HTMLSelectElement;
  bulkSelect.addEventListener('change', () => {
    if (bulkSelect.value) {
      const handler = (window as unknown as Record<string, unknown>)._evilBulkHandler;
      if (typeof handler === 'function') (handler as (v: string) => void)(bulkSelect.value);
      bulkSelect.value = '';
    }
  });

  function performSave(): void {
    setEvilnessMap({ ...evilnessMap, ...localEvilMap });
    const useEvilInCalc = getEvilnessAffectsParity();
    if (useEvilInCalc) {
      recalculateAllParity();
    } else {
      saveState();
      notify();
    }
    showToast('Evilness settings saved!', 3000, 'success');
    if (modalElement) {
      const si = modalElement.querySelector('input[type="text"]') as HTMLInputElement | null;
      if (si) si.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closeEvilModal(true);
  }

  const evilStackCloser: () => void = () => closeEvilModal(false);

  function closeEvilModal(skipConfirm = false): void {
    if (hasChanges && !skipConfirm) {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2147483646;`;
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface-raised);color:var(--text-ui);padding:24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:2147483647;min-width:300px;`;
      box.innerHTML = `<h3 style="margin:0 0 12px;color:var(--text-ui);font-size:1.1rem;">Unsaved Changes</h3>
        <p style="margin:0 0 20px;color:var(--text-secondary);font-size:0.9rem;">You have unsaved changes. What would you like to do?</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="d-btn" style="padding:8px 16px;background:#6c757d;color:var(--text-on-color);border:none;border-radius:6px;cursor:pointer;font-weight:600;">Discard</button>
          <button class="c-btn" style="padding:8px 16px;background:var(--surface2);color:var(--text-ui);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
          <button class="s-btn" style="padding:8px 16px;background:#28a745;color:var(--text-on-color);border:none;border-radius:6px;cursor:pointer;font-weight:600;">Save</button>
        </div>`;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const discardBtn = box.querySelector('.d-btn') as HTMLElement | null;
      if (discardBtn) discardBtn.onclick = () => {
        overlay.remove();
        closeEvilModal(true);
      };
      const cancelBtn = box.querySelector('.c-btn') as HTMLElement | null;
      if (cancelBtn) cancelBtn.onclick = () => overlay.remove();
      const saveBtn2 = box.querySelector('.s-btn') as HTMLElement | null;
      if (saveBtn2) saveBtn2.onclick = () => {
        overlay.remove();
        performSave();
      };
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    delete w._evilToggleCase;
    delete w._evilBulkHandler;
    closeModalWithHistory(() => {
      removeCloseModalFromStack(evilStackCloser);
      evilModalDiv.remove();
      if (mainCloseBtn) mainCloseBtn.style.display = 'flex';
      if (mainSettingsBtn) mainSettingsBtn.style.display = 'flex';
    });
  }

  (evilInner.querySelector('#evilSaveBtn') as HTMLButtonElement).addEventListener('click', performSave);
  (evilInner.querySelector('#evilCancelBtn') as HTMLButtonElement).addEventListener('click', () => closeEvilModal(false));
  (evilInner.querySelector('#evilModalCloseBtn') as HTMLButtonElement).addEventListener('click', () => closeEvilModal(false));
  pushModalState('evilModal', evilStackCloser);

  (evilInner.querySelector('#evilResetBtn') as HTMLButtonElement).addEventListener('click', () => {
    const presetEvil =
      presetData && (presetData as { evilnessMap?: Record<string, boolean> }).evilnessMap
        ? (presetData as { evilnessMap: Record<string, boolean> }).evilnessMap
        : {};
    allCases.forEach((cn) => {
      localEvilMap[cn] = presetEvil[cn] === true;
    });
    renderEvilGrid();
    markChanged();
  });

  renderEvilGrid();
}

// ── Tracing Position Settings (config) modal ────────────────────────────────
function showTracingPositionSettingsModal(
  modalElement: HTMLElement | null,
  config: TracerConfig,
  mainCloseBtn: HTMLElement | null,
  mainSettingsBtn: HTMLElement | null,
): void {
  const textColor = getTracerTextColor(config.backgroundColor);
  const isDark = isDarkTracerSurface(config.backgroundColor);
  const borderColor = isDark
    ? adjustColorBrightness(config.backgroundColor, 20)
    : adjustColorBrightness(config.backgroundColor, -10);
  const inputBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, 10)
    : adjustColorBrightness(config.backgroundColor, -3);

  const configModalDiv = document.createElement('div');
  configModalDiv.id = 'parityConfigModal';
  configModalDiv.className = 'parity-tracer-config-modal';
  configModalDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10008;
    padding: 2rem;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    scrollbar-width: none;
    -ms-overflow-style: none;
    overflow: hidden;
  `;

  const configContent = document.createElement('div');
  configContent.className = 'parity-tracer-config-content';
  configContent.style.cssText = `
    background: ${config.backgroundColor};
    border-radius: 16px;
    padding: 2rem;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    position: relative;
  `;

  const headerDiv = document.createElement('div');
  headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;';

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = 'display: flex; align-items: center; gap: 10px;';
  headerTitle.innerHTML = `
    <h2 style="font-size: 1.5rem; color: ${textColor}; margin: 0;">Tracing Position Settings</h2>
    <button class="config-info-btn" style="background: rgba(255, 255, 255, 0.1); border: none; color: ${textColor}; cursor: pointer; padding: 6px; border-radius: 6px; display: ${config.hideInstructionButton ? 'none' : 'flex'}; align-items: center; justify-content: center; transition: background 0.2s; width: 32px; height: 32px;" title="Configuration Guide">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </button>
  `;
  headerDiv.appendChild(headerTitle);

  const searchDiv = document.createElement('div');
  searchDiv.className = 'shape-search-container';
  searchDiv.style.cssText = 'margin-bottom: 1.5rem;';
  searchDiv.innerHTML = `
    <input type="text" id="shape-search-input" placeholder="Search shapes by name..." style="width: 100%; padding: 0.75rem; border: 2px solid ${borderColor}; background: ${inputBgColor}; color: ${textColor}; border-radius: 8px; font-size: 0.9rem; transition: all 0.2s;">
  `;

  const casesListDiv = document.createElement('div');
  casesListDiv.className = 'shape-cases-grid';
  casesListDiv.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;';

  // Always reload shapes fresh from storage.
  shapePatterns = { ...getShapePatterns() };
  const sortedEntries = Object.entries(shapePatterns).sort((a, b) => a[1].localeCompare(b[1]));

  const shapeStyle = getHomepageShapeStyle();
  sortedEntries.forEach(([pattern, name], idx) => {
    const caseDiv = document.createElement('div');
    caseDiv.className = 'shape-config-item';
    caseDiv.setAttribute('data-shape-name', name.toLowerCase());

    const totalItems = sortedEntries.length;
    const isSecondToLast = idx === totalItems - 2;
    const isLast = idx === totalItems - 1;

    let gridColumn = '';
    if (totalItems % 3 === 2) {
      if (isSecondToLast) {
        gridColumn = 'transform: translateX(calc(33% + 14px));';
        caseDiv.classList.add('second-to-last-card');
      }
      if (isLast) {
        gridColumn = 'transform: translateX(calc(66% - 14px));';
        caseDiv.classList.add('last-card');
      }
    }

    if (idx === totalItems - 1 && totalItems % 2 === 1) {
      caseDiv.classList.add('last-odd-card');
    }

    const cardBg = isDark
      ? adjustColorBrightness(config.backgroundColor, 12)
      : adjustColorBrightness(config.backgroundColor, -4);
    caseDiv.style.cssText = `
      background: ${cardBg};
      padding: 1rem;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.2s;
      ${gridColumn}
    `;

    const nameSpan = document.createElement('div');
    nameSpan.style.cssText = `font-weight: 600; color: ${textColor}; font-size: 0.9rem; margin-bottom: 0.5rem; text-align: center;`;
    nameSpan.textContent = name;

    const vizDiv = document.createElement('div');
    vizDiv.innerHTML = generateShapeSVG(pattern, 112, 'config-' + pattern, shapeStyle);
    vizDiv.style.cssText = 'width: 100%; margin-bottom: 0.5rem;';

    caseDiv.appendChild(nameSpan);
    caseDiv.appendChild(vizDiv);
    casesListDiv.appendChild(caseDiv);
  });

  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.cssText = `grid-column: 1 / -1; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid ${borderColor}; text-align: center; display: flex; gap: 1rem; justify-content: center;`;

  const saveBtnBg = isDark
    ? adjustColorBrightness(config.backgroundColor, 20)
    : adjustColorBrightness(config.backgroundColor, -10);
  const saveBtnHover = isDark
    ? adjustColorBrightness(config.backgroundColor, 25)
    : adjustColorBrightness(config.backgroundColor, -15);
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save & Apply';
  saveBtn.id = 'configSaveBtn';
  saveBtn.style.cssText = `
    padding: 0.75rem 2rem;
    border: 2px solid ${borderColor};
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
    background: ${saveBtnBg};
    color: ${textColor};
  `;
  saveBtn.onmouseover = () => {
    saveBtn.style.background = saveBtnHover;
  };
  saveBtn.onmouseout = () => {
    saveBtn.style.background = saveBtnBg;
  };

  const resetBtnBg = isDark
    ? adjustColorBrightness(config.backgroundColor, 15)
    : adjustColorBrightness(config.backgroundColor, -8);
  const resetBtnHover = isDark
    ? adjustColorBrightness(config.backgroundColor, 20)
    : adjustColorBrightness(config.backgroundColor, -12);
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset to Default';
  resetBtn.style.cssText = `
    padding: 0.75rem 2rem;
    border: 2px solid ${borderColor};
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s;
    background: ${resetBtnBg};
    color: ${textColor};
  `;
  resetBtn.onmouseover = () => {
    resetBtn.style.background = resetBtnHover;
  };
  resetBtn.onmouseout = () => {
    resetBtn.style.background = resetBtnBg;
  };

  const performSave = (): void => {
    setShapePatterns(shapePatterns);
    refreshHomepageSVGs();
    saveState();
    recalculateAllParity();

    configModalDiv.remove();
    configFloatingCloseBtn.remove();
    configStyle.remove();
    if (floatingSaveBtn) floatingSaveBtn.remove();
    window.removeEventListener('resize', resizeHandler);
    configModalDiv.removeEventListener('scroll', scrollHandler);
    const backdrop = document.querySelector('.parity-tracer-backdrop');
    if (backdrop) {
      backdrop.removeEventListener('scroll', scrollHandler);
    }
    if (mainCloseBtn) mainCloseBtn.style.display = 'flex';
    if (mainSettingsBtn) mainSettingsBtn.style.display = 'flex';

    const liveTracer = modalElement || document.querySelector('.parity-tracer-backdrop');
    if (liveTracer) {
      const scrambleInput = liveTracer.querySelector('input[type="text"]') as HTMLInputElement | null;
      if (scrambleInput) {
        scrambleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    showToast('Settings saved! All parity calculations have been updated.', 3000, 'success');
  };

  saveBtn.onclick = performSave;

  resetBtn.onclick = () => {
    shapePatterns = { ...DEFAULT_SHAPE_PATTERNS };
    setShapePatterns(shapePatterns);
    configModalDiv.remove();
    configFloatingCloseBtn.remove();
    configStyle.remove();
    showTracingPositionSettingsModal(modalElement, config, mainCloseBtn, mainSettingsBtn);
  };

  buttonsDiv.appendChild(saveBtn);
  buttonsDiv.appendChild(resetBtn);

  // Floating save button (appears when the save button scrolls out of view).
  const floatingSaveBtn = document.createElement('button');
  floatingSaveBtn.className = 'config-floating-save-btn';
  floatingSaveBtn.style.cssText = `
    position: fixed;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10010;
    border: none;
    background: ${saveBtnBg};
    color: ${textColor};
    transition: all 0.2s;
    padding: 0;
  `;
  floatingSaveBtn.innerHTML = '<span class="themed-icon themed-icon--save" aria-hidden="true" style="width:24px;height:24px;"></span>';
  floatingSaveBtn.onmouseover = () => {
    floatingSaveBtn.style.background = saveBtnHover;
    floatingSaveBtn.style.transform = 'scale(1.1)';
  };
  floatingSaveBtn.onmouseout = () => {
    floatingSaveBtn.style.background = saveBtnBg;
    floatingSaveBtn.style.transform = 'scale(1)';
  };
  floatingSaveBtn.onclick = performSave;

  document.body.appendChild(floatingSaveBtn);

  let dataChanged = false;

  function updateFloatingSaveBtn(): void {
    try {
      const contentRect = configContent.getBoundingClientRect();
      const saveBtnRect = saveBtn.getBoundingClientRect();
      const saveBtnVisible = saveBtnRect.top >= 0 && saveBtnRect.bottom <= window.innerHeight;

      if (dataChanged && !saveBtnVisible) {
        floatingSaveBtn.style.display = 'flex';
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const modalRight = contentRect.right;
        const modalBottom = contentRect.bottom;

        const calculatedRight = viewportWidth - modalRight + 16;
        const calculatedBottom = viewportHeight - modalBottom + 16;

        floatingSaveBtn.style.right = `${calculatedRight}px`;
        floatingSaveBtn.style.bottom = `${calculatedBottom}px`;
        floatingSaveBtn.style.position = 'fixed';
      } else {
        floatingSaveBtn.style.display = 'none';
      }
    } catch (e) {
      console.error('Error updating floating save button:', e);
    }
  }

  configContent.addEventListener('scroll', updateFloatingSaveBtn);
  window.addEventListener('resize', updateFloatingSaveBtn);

  let updateCount = 0;
  const maxUpdates = 20;
  const updateInterval = setInterval(() => {
    updateFloatingSaveBtn();
    updateCount++;
    if (updateCount >= maxUpdates) {
      clearInterval(updateInterval);
    }
  }, 100);

  updateFloatingSaveBtn();
  setTimeout(updateFloatingSaveBtn, 0);

  setTimeout(() => {
    const configInfoBtn = configContent.querySelector('.config-info-btn') as HTMLButtonElement | null;
    if (configInfoBtn) {
      configInfoBtn.onclick = () => {
        showConfigOrientationInstructionModal(config);
      };
    }
  }, 100);

  casesListDiv.appendChild(buttonsDiv);

  configContent.appendChild(headerDiv);
  configContent.appendChild(searchDiv);
  configContent.appendChild(casesListDiv);
  configModalDiv.appendChild(configContent);

  const configStyle = document.createElement('style');
  configStyle.textContent = `
    .parity-tracer-config-modal::-webkit-scrollbar {
      display: none;
    }
    .parity-tracer-config-content::-webkit-scrollbar {
      display: none;
    }
    .shape-search-container {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      height: auto !important;
      overflow: visible !important;
      position: relative !important;
    }
    .shape-search-container input {
      opacity: 1 !important;
      pointer-events: auto !important;
      position: relative !important;
    }
    @media (max-width: 570px) {
      .shape-search-container {
        display: block !important;
        visibility: visible !important;
      }
      .shape-search-container input {
        opacity: 1 !important;
        pointer-events: auto !important;
        position: relative !important;
      }
      .shape-cases-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .shape-config-item.second-to-last-card,
      .shape-config-item.last-card {
        transform: none !important;
      }
      .shape-config-item.last-odd-card {
        grid-column: 1 / -1;
        max-width: calc(50% - 0.5rem);
        margin: 0 auto !important;
      }
    }
    @media (max-width: 420px) {
      .shape-cases-grid {
        grid-template-columns: 1fr !important;
      }
      .shape-config-item.last-odd-card {
        max-width: 100% !important;
      }
    }
  `;
  document.head.appendChild(configStyle);

  const configFloatingCloseBtn = document.createElement('button');
  configFloatingCloseBtn.className = 'config-floating-close-btn';
  configFloatingCloseBtn.innerHTML = '×';
  configFloatingCloseBtn.style.cssText = `
    position: fixed;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10009;
    border: none;
    background: #f7fafc;
    color: #2d3748;
    transition: transform 0.2s;
  `;

  const configCloseBg = isDark
    ? adjustColorBrightness(config.backgroundColor, 15)
    : adjustColorBrightness(config.backgroundColor, -5);
  const configCloseHover = isDark
    ? adjustColorBrightness(config.backgroundColor, 20)
    : adjustColorBrightness(config.backgroundColor, -8);

  configFloatingCloseBtn.style.background = configCloseBg;
  configFloatingCloseBtn.style.color = textColor;

  configFloatingCloseBtn.onmouseover = () => {
    configFloatingCloseBtn.style.transform = 'scale(1.1)';
    configFloatingCloseBtn.style.background = configCloseHover;
  };
  configFloatingCloseBtn.onmouseout = () => {
    configFloatingCloseBtn.style.transform = 'scale(1)';
    configFloatingCloseBtn.style.background = configCloseBg;
  };

  document.body.appendChild(configFloatingCloseBtn);

  function updateConfigClosePosition(): void {
    const rect = configContent.getBoundingClientRect();
    configFloatingCloseBtn.style.top = `${rect.top + 8}px`;
    configFloatingCloseBtn.style.right = `${window.innerWidth - rect.right + 4}px`;
  }

  setTimeout(updateConfigClosePosition, 10);

  const resizeHandler = (): void => updateConfigClosePosition();
  const scrollHandler = (): void => updateConfigClosePosition();
  window.addEventListener('resize', resizeHandler);
  configModalDiv.addEventListener('scroll', scrollHandler);
  const backdrop = document.querySelector('.parity-tracer-backdrop');
  if (backdrop) {
    backdrop.addEventListener('scroll', scrollHandler);
  }

  setTimeout(() => {
    const searchInput = configContent.querySelector('#shape-search-input') as HTMLInputElement;
    searchInput.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
      const shapeItems = configContent.querySelectorAll('.shape-config-item');
      shapeItems.forEach((item) => {
        const shapeName = (item as HTMLElement).getAttribute('data-shape-name');
        const el = item as HTMLElement;
        if (shapeName && shapeName.includes(searchTerm)) {
          el.style.display = 'flex';
        } else {
          el.style.display = 'none';
        }
      });
    });

    const focusColor = isDark
      ? adjustColorBrightness(config.backgroundColor, 30)
      : adjustColorBrightness(config.backgroundColor, -15);
    searchInput.addEventListener('focus', () => {
      searchInput.style.borderColor = focusColor;
    });
    searchInput.addEventListener('blur', () => {
      searchInput.style.borderColor = borderColor;
    });
  }, 100);

  const closeConfigModal = (skipConfirmation = false): void => {
    if (dataChanged && !skipConfirmation) {
      const choiceContainer = document.createElement('div');
      choiceContainer.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--surface-raised);
        color: var(--text-ui);
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 2147483647;
        min-width: 300px;
      `;

      choiceContainer.innerHTML = `
        <h3 style="margin: 0 0 12px 0; color: var(--text-ui); font-size: 1.1rem;">Unsaved Changes</h3>
        <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 0.95rem;">You have unsaved changes. What would you like to do?</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="discard-btn" style="padding: 8px 16px; background: #6c757d; color: var(--text-on-color); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Discard</button>
          <button class="cancel-btn" style="padding: 8px 16px; background: var(--surface2); color: var(--text-ui); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: 600;">Cancel</button>
          <button class="save-btn" style="padding: 8px 16px; background: #28a745; color: var(--text-on-color); border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Save</button>
        </div>
      `;

      const tempContainer = document.createElement('div');
      tempContainer.id = 'temp-confirm-container-ultimate';
      tempContainer.style.cssText =
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483646; display: flex; align-items: center; justify-content: center;';
      tempContainer.appendChild(choiceContainer);
      document.body.appendChild(tempContainer);

      const discardBtn = choiceContainer.querySelector('.discard-btn') as HTMLElement | null;
      if (discardBtn) discardBtn.onclick = () => {
        tempContainer.remove();
        closeConfigModal(true);
      };
      const cancelBtn2 = choiceContainer.querySelector('.cancel-btn') as HTMLElement | null;
      if (cancelBtn2) cancelBtn2.onclick = () => {
        tempContainer.remove();
      };
      const saveBtn3 = choiceContainer.querySelector('.save-btn') as HTMLElement | null;
      if (saveBtn3) saveBtn3.onclick = () => {
        tempContainer.remove();
        performSave();
      };

      return;
    }

    closeModalWithHistory(() => {
      configContent.removeEventListener('scroll', updateFloatingSaveBtn);
      window.removeEventListener('resize', resizeHandler);
      configModalDiv.removeEventListener('scroll', scrollHandler);
      const backdrop = document.querySelector('.parity-tracer-backdrop');
      if (backdrop) {
        backdrop.removeEventListener('scroll', scrollHandler);
      }

      if (typeof updateInterval !== 'undefined') {
        clearInterval(updateInterval);
      }

      if (floatingSaveBtn && floatingSaveBtn.parentNode) {
        floatingSaveBtn.remove();
      }
      configModalDiv.remove();
      configFloatingCloseBtn.remove();
      configStyle.remove();

      if (mainCloseBtn) mainCloseBtn.style.display = 'flex';
      if (mainSettingsBtn) mainSettingsBtn.style.display = 'flex';
    });
  };

  pushModalState('parityConfigModal', closeConfigModal);

  configFloatingCloseBtn.onclick = () => closeConfigModal();

  setTimeout(() => {
    configContent.querySelectorAll<HTMLElement>('[class*="shape-piece-config-"]').forEach((piece) => {
      piece.style.cursor = 'pointer';
      piece.onclick = (e) => {
        const classList = Array.from((e.target as HTMLElement).classList);
        const configClass = classList.find((c) => c.startsWith('shape-piece-config-'));

        if (configClass) {
          const pattern = configClass.replace('shape-piece-config-', '');
          const clickedIndex = parseInt((e.target as HTMLElement).getAttribute('data-piece-index') || '', 10);

          if (!isNaN(clickedIndex)) {
            const scrollPos = configModalDiv.scrollTop;

            setShapeOrientation(pattern, clickedIndex);
            dataChanged = true;
            updateFloatingSaveBtn();

            const cardElement = (e.target as HTMLElement).closest('.shape-config-item') as HTMLElement | null;
            if (cardElement) {
              const shapeName = cardElement.getAttribute('data-shape-name');

              const vizDiv = cardElement.querySelector('div:nth-child(2)') as HTMLElement | null;
              if (vizDiv) {
                let newPattern = '';
                for (const [pat, name] of Object.entries(shapePatterns)) {
                  if (name.toLowerCase() === shapeName) {
                    newPattern = pat;
                    break;
                  }
                }

                if (newPattern) {
                  vizDiv.innerHTML = generateShapeSVG(newPattern, 112, 'config-' + newPattern, getHomepageShapeStyle());

                  vizDiv.querySelectorAll<HTMLElement>('[class*="shape-piece-config-"]').forEach((newPiece) => {
                    newPiece.style.cursor = 'pointer';
                    newPiece.onclick = piece.onclick;
                  });
                }
              }
            }

            configModalDiv.scrollTop = scrollPos;
          }
        }
      };
    });
  }, 100);

  document.body.appendChild(configModalDiv);
  void configModalDiv.offsetHeight;
}

// ── Main Parity Tracer modal ─────────────────────────────────────────────────
function createParityTracerModalWithAllParametersIncluded(options: ParityTracerOptions = {}): HTMLElement | string {
  shapePatterns = { ...getShapePatterns() };

  const config = buildTracerConfig(options);
  syncColorConfig(config);
  syncEvilnessConfig();

  // If returnOnlyValue, calculate and return only the parity result.
  if (config.returnOnlyParityValue && config.scrambleTextInput) {
    try {
      const { tlHex, blHex } = sq1AlgToHex(config.scrambleTextInput);
      const useClockwise = cornerStickerMode === 'clockwise';
      const parity = calculateParityFromHex(tlHex, blHex, getZ2TracingMode(), useClockwise, config.scrambleTextInput);
      const useEvil = getEvilnessAffectsParity() && parity.evilStep !== null;
      return (useEvil ? parity.isOddWithEvil : parity.isOdd) ? 'Odd' : 'Even';
    } catch (err) {
      console.error('Parity calculation error:', err);
      return 'error';
    }
  }

  const textColor = getTracerTextColor(config.backgroundColor);
  const isDark = isDarkTracerSurface(config.backgroundColor);
  const borderColor = isDark
    ? adjustColorBrightness(config.backgroundColor, 20)
    : adjustColorBrightness(config.backgroundColor, -10);
  const inputBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, DM_INPUT_BG)
    : adjustColorBrightness(config.backgroundColor, LM_INPUT_BG);
  const buttonBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, DM_BUTTON_BG)
    : adjustColorBrightness(config.backgroundColor, LM_BUTTON_BG);
  const hoverBgColor = isDark
    ? adjustColorBrightness(config.backgroundColor, DM_HOVER_BG)
    : adjustColorBrightness(config.backgroundColor, LM_HOVER_BG);

  const backdrop = document.createElement('div');
  backdrop.id = 'parityTracerModal';
  backdrop.className = 'parity-tracer-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10005;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  `;

  const modal = document.createElement('div');
  modal.className = 'parity-tracer-modal-container';
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const maxHeight = vh > 900 ? 'auto' : vh > 600 ? '90vh' : '85vh';
  const padding = vw <= 420 ? '1rem' : '1.5rem';
  const borderRadius = vw <= 420 ? '12px' : '16px';
  modal.style.cssText = `
    position: relative;
    background: ${config.backgroundColor};
    border-radius: ${borderRadius};
    padding: ${padding};
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    max-width: 600px;
    width: 90%;
    max-height: ${maxHeight};
    overflow-y: auto;
    z-index: 10006;
  `;

  const uniqueId = 'pt-' + Math.random().toString(36).substr(2, 9);

  modal.innerHTML = `
    <style>
      .parity-tracer-modal-container * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .parity-tracer-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 1rem;
      }
      .parity-tracer-header h2 {
        font-size: 1.5rem;
        color: ${textColor};
        margin: 0;
      }
      .parity-tracer-header-info-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: ${textColor};
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        display: ${config.hideInstructionButton ? 'none' : 'flex'};
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        width: 32px;
        height: 32px;
      }
      .parity-tracer-header-info-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .utility-buttons-container {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        margin-top: 0.75rem;
        flex-wrap: wrap;
      }
      .utility-toggle-btn {
        padding: 0.5rem 1rem;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s;
        background: ${inputBgColor};
        color: ${textColor};
        min-width: 70px;
      }
      .utility-toggle-btn:hover {
        background: ${buttonBgColor};
      }
      .utility-toggle-btn.active {
        background: ${hoverBgColor};
        border-color: ${textColor};
      }
      .parity-tracer-modal-container::-webkit-scrollbar {
        width: 0px;
        display: none;
      }
      .parity-tracer-modal-container {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .parity-tracer-input-container {
        display: flex;
        gap: 0;
        margin-bottom: 1rem;
        position: relative;
        height: 44px;
      }
      .parity-tracer-input-container input {
        flex: 1;
        padding: 0.75rem;
        border: 2px solid;
        border-right: none;
        border-radius: 8px 0 0 8px;
        font-family: "Monaco", "Consolas", monospace;
        font-size: 0.9rem;
        transition: all 0.2s;
        height: 44px;
        margin: 0;
        min-width: 0;
      }
      @media (max-width: 570px) {
        .parity-tracer-input-container {
          height: 40px;
        }
        .parity-tracer-input-container input {
          padding: 0.5rem;
          font-size: 0.8rem;
          height: 40px;
        }
        .parity-tracer-input-container button {
          padding: 0 0.75rem;
          font-size: 0.85rem;
          height: 40px;
        }
      }
      @media (max-width: 420px) {
        .parity-tracer-input-container {
          height: 36px;
        }
        .parity-tracer-input-container input {
          padding: 0.4rem;
          font-size: 0.75rem;
          height: 36px;
        }
        .parity-tracer-input-container button {
          padding: 0 0.6rem;
          font-size: 0.8rem;
          height: 36px;
        }
      }
      .parity-tracer-input-container input:focus {
        outline: none;
      }
      .parity-tracer-input-container button {
        padding: 0 1rem;
        border: 2px solid;
        border-left: none;
        border-radius: 0 8px 8px 0;
        cursor: pointer;
        transition: all 0.2s;
        height: 44px;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .parity-tracer-input-container button:hover {
        opacity: 0.8;
      }
      .parity-tracer-settings-btn {
        position: fixed;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.25rem;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10007;
        border: none;
      }
      .parity-tracer-settings-btn:hover {
        transform: scale(1.1);
        opacity: 0.9;
      }
      .parity-tracer-close-btn {
        position: fixed;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.25rem;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10007;
        border: none;
      }
      .parity-tracer-close-btn:hover {
        transform: scale(1.1);
        opacity: 0.9;
      }
      .parity-tracer-modal-container .color-dot {
        display: inline-block;
        width: 16px;
        height: 16px;
        border-radius: 3px;
        margin: 0 2px;
        vertical-align: middle;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      .parity-tracer-modal-container .W {
        background: var(--text-primary);
        border: 1px solid var(--surface-border);
      }
      .parity-tracer-modal-container .Y { background: #ffd700; }
      .parity-tracer-modal-container .G { background: #48bb78; }
      .parity-tracer-modal-container .B { background: #4299e1; }
      .parity-tracer-modal-container .R { background: #f56565; }
      .parity-tracer-modal-container .O { background: #ed8936; }
      .parity-tracer-modal-container .results-section {
        margin-top: 1rem;
      }
      .parity-tracer-modal-container .parity-grid-tracer-lib {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      @media (min-width: 600px) {
        .parity-tracer-modal-container .parity-grid-tracer-lib {
          grid-template-columns: 1fr 1fr;
        }
      }
      .shape-piece {
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .shape-piece:hover {
        fill: #ffd700 !important;
        stroke-width: 3;
      }
    </style>
    <div class="parity-tracer-header">
      <h2>Cale's Parity Tracer</h2>
      <button class="parity-tracer-header-info-btn" id="${uniqueId}-header-info" title="Parity Tracer Guide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
    </div>
    <div class="parity-tracer-input-container">
      <input type="text" id="${uniqueId}-scramble" value="${config.scrambleTextInput}" placeholder="Enter your scramble..." style="margin: 0; background: ${inputBgColor}; color: ${textColor}; border-color: ${borderColor}; border-radius:8px;">
    </div>
    <div id="${uniqueId}-visualization" style="display: flex; justify-content: center; margin-bottom: 1rem;"></div>
    <div class="utility-buttons-container">
      <button class="utility-toggle-btn" id="${uniqueId}-z2-btn">z2</button>
      <button class="utility-toggle-btn" id="${uniqueId}-y2-btn">y2</button>
      <button class="utility-toggle-btn" id="${uniqueId}-flip-btn">Flip Color</button>
    </div>
    <div id="${uniqueId}-results" class="results-section"></div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'parity-tracer-close-btn';
  closeBtn.id = `${uniqueId}-close`;
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText += `background: ${buttonBgColor}; color: ${textColor};`;

  const settingsIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" style="display: block; transform: scale(0.7); transform-origin: center;"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/></svg>`;
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'parity-tracer-settings-btn';
  settingsBtn.id = `${uniqueId}-settings`;
  settingsBtn.innerHTML = settingsIcon;
  settingsBtn.style.cssText += `background: ${buttonBgColor}; color: ${textColor};`;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  document.body.appendChild(closeBtn);
  document.body.appendChild(settingsBtn);
  document.body.classList.add('modal-open');

  setTimeout(() => {
    const scrambleInput = modal.querySelector(`#${uniqueId}-scramble`) as HTMLInputElement;
    const vizContainer = modal.querySelector(`#${uniqueId}-visualization`) as HTMLElement;
    const resultsContainer = modal.querySelector(`#${uniqueId}-results`) as HTMLElement;
    const closeBtnElement = document.getElementById(`${uniqueId}-close`) as HTMLButtonElement;
    const settingsBtnElement = document.getElementById(`${uniqueId}-settings`) as HTMLButtonElement;

    function updateButtonPositions(): void {
      const rect = modal.getBoundingClientRect();
      const closeTop = rect.top + 8;
      const closeRight = window.innerWidth - rect.right + 6;
      const settingsBottom = window.innerHeight - rect.bottom + 16;
      const settingsRight = window.innerWidth - rect.right + 6;
      closeBtnElement.style.top = `${closeTop}px`;
      closeBtnElement.style.right = `${closeRight}px`;
      settingsBtnElement.style.bottom = `${settingsBottom}px`;
      settingsBtnElement.style.right = `${settingsRight}px`;
    }

    const buttonUpdateTimings = [0, 50, 100, 200, 300, 500];
    buttonUpdateTimings.forEach((delay) => {
      setTimeout(updateButtonPositions, delay);
    });

    window.addEventListener('resize', updateButtonPositions);
    backdrop.addEventListener('scroll', updateButtonPositions);

    function performAnalysis(): void {
      shapePatterns = { ...getShapePatterns() };
      refreshTracerSettings();
      syncColorConfig(config);

      let scrambleText = scrambleInput.value.trim() || '(0,0)';
      try {
        scrambleText = normalizeScramble(scrambleText) || scrambleText;
      } catch {
        // keep raw input
      }

      const transformedScramble = applyUtilityTransformationsToScramble(scrambleText, {
        z2Enabled: utilityZ2Enabled,
        y2Enabled: utilityY2Enabled,
        flipColorEnabled: utilityFlipColorEnabled,
      });

      try {
        const { tlHex, blHex } = sq1AlgToHex(transformedScramble);
        const useClockwise = cornerStickerMode === 'clockwise';
        const sixStepParity = calculateParityFromHex(tlHex, blHex, getZ2TracingMode(), useClockwise, scrambleText);

        if (config.shouldGenerateImage) {
          const state = applyScramble(transformedScramble);
          const encodedScramble = stateToHex(state);
          if (!encodedScramble.startsWith('Error:')) {
            try {
              const imageSize = getParityTracerImageSize();
              const svgContent = visualizeFromHex(encodedScramble, imageSize, {
                topColor: config.topLayerMainColor,
                bottomColor: config.bottomLayerMainColor,
                frontColor: config.frontFaceColorForVisualization,
                rightColor: config.rightFaceColorForVisualization,
                backColor: config.backFaceColorForVisualization,
                leftColor: config.leftFaceColorForVisualization,
              }, 120);

              const { topUnits: topRawU, botUnits: botRawU } = hexToUnits(tlHex, blHex);
              const topArrowData = calculateArrowAngle(sixStepParity.topTraceRotation, topRawU, 'TOP', sixStepParity.topBits);
              const botArrowData = calculateArrowAngle(sixStepParity.botTraceRotation, botRawU, 'BOTTOM', sixStepParity.botBits);

              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = svgContent;

              const svgs = tempDiv.querySelectorAll('svg');
              if (svgs.length >= 2) {
                const topGeometry = getSvgGeometry(svgs[0], imageSize);
                const botGeometry = getSvgGeometry(svgs[1], imageSize);

                const topUnit10vh = topGeometry.puzzleSize * 0.4;
                const botUnit10vh = botGeometry.puzzleSize * 0.4;
                const topRingRadius = topUnit10vh * 0.7 + topUnit10vh * 0.4;
                const botRingRadius = botUnit10vh * 0.7 + botUnit10vh * 0.4;

                const firstSvg = svgs[0];
                const arrowSvg1 = generateArrowSVG(
                  topGeometry.centerX,
                  topGeometry.centerY,
                  topRingRadius,
                  topArrowData.startAngle,
                  topArrowData.arcDegrees,
                  topGeometry.puzzleSize,
                  sixStepParity.wasSwapped ? 2 : 1,
                );
                firstSvg.insertAdjacentHTML('beforeend', arrowSvg1);

                const secondSvg = svgs[1];
                const arrowSvg2 = generateArrowSVG(
                  botGeometry.centerX,
                  botGeometry.centerY,
                  botRingRadius,
                  botArrowData.startAngle,
                  botArrowData.arcDegrees,
                  botGeometry.puzzleSize,
                  sixStepParity.wasSwapped ? 1 : 2,
                );
                secondSvg.insertAdjacentHTML('beforeend', arrowSvg2);
              }

              vizContainer.innerHTML = tempDiv.innerHTML;

              const svgsInContainer = vizContainer.querySelectorAll('svg');
              if (svgsInContainer.length >= 2) {
                const addSymmetryButton = (svg: SVGSVGElement, layerType: 'top' | 'bottom', match: MatchedShape): void => {
                  const canCycleSymmetry = match.symmetryDegree > 1;

                  const geometry = getSvgGeometry(svg, imageSize);
                  const unit10vh = geometry.puzzleSize * 0.4;
                  const ringRadius = unit10vh * 0.7 + unit10vh * 0.4;

                  const svgNS = 'http://www.w3.org/2000/svg';
                  const buttonCircle = document.createElementNS(svgNS, 'circle');

                  buttonCircle.setAttribute('cx', String(geometry.centerX));
                  buttonCircle.setAttribute('cy', String(geometry.centerY));
                  buttonCircle.setAttribute('r', String(ringRadius * 0.3));
                  buttonCircle.setAttribute('fill', 'transparent');
                  buttonCircle.setAttribute('style', `cursor: ${canCycleSymmetry ? 'pointer' : 'default'};`);

                  if (canCycleSymmetry) {
                    buttonCircle.addEventListener('click', () => {
                      const offsetKey = getSymmetryOffsetKey(tlHex, blHex);
                      const offsetEntry = getParityTracerSymmetryOffset(offsetKey);

                      const currentOffset = offsetEntry[layerType] || 0;
                      const maxSymmetries = match.name === 'Star' ? 2 : match.symmetryDegree;
                      const newOffset = (currentOffset + 1) % maxSymmetries;

                      offsetEntry[layerType] = newOffset;

                      performAnalysis();
                    });
                  }

                  svg.appendChild(buttonCircle);
                };

                addSymmetryButton(svgsInContainer[0] as SVGSVGElement, 'top', sixStepParity.topMatch);
                addSymmetryButton(svgsInContainer[1] as SVGSVGElement, 'bottom', sixStepParity.botMatch);
              }
            } catch (err) {
              vizContainer.innerHTML = `<div style="color: #e53e3e;">Visualization error: ${(err as Error).message}</div>`;
            }
          } else {
            vizContainer.innerHTML = `<div style="color: #e53e3e; font-family: monospace;">${encodedScramble}</div>`;
          }
        }

        displayResults(resultsContainer, sixStepParity, config);
      } catch (err) {
        console.error(err);
        resultsContainer.innerHTML =
          '<div style="color: #e53e3e; padding: 1rem;">Error parsing scramble. Please check the format.</div>';
      }
    }

    scrambleInput.addEventListener('input', () => {
      performAnalysis();
    });

    scrambleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });

    const z2Btn = modal.querySelector(`#${uniqueId}-z2-btn`) as HTMLButtonElement;
    const y2Btn = modal.querySelector(`#${uniqueId}-y2-btn`) as HTMLButtonElement;
    const flipBtn = modal.querySelector(`#${uniqueId}-flip-btn`) as HTMLButtonElement;

    z2Btn.addEventListener('click', () => {
      utilityZ2Enabled = !utilityZ2Enabled;
      z2Btn.classList.toggle('active', utilityZ2Enabled);
      performAnalysis();
    });

    y2Btn.addEventListener('click', () => {
      utilityY2Enabled = !utilityY2Enabled;
      y2Btn.classList.toggle('active', utilityY2Enabled);
      performAnalysis();
    });

    flipBtn.addEventListener('click', () => {
      utilityFlipColorEnabled = !utilityFlipColorEnabled;
      flipBtn.classList.toggle('active', utilityFlipColorEnabled);
      performAnalysis();
    });

    // Re-trace when evilness settings change while the tracer is open behind settings.
    let lastEvilKey = `${evilnessFactor}|${evilnessAffectsParity}`;
    const unsubscribeEvil = subscribe(() => {
      const key = `${evilnessFactor}|${evilnessAffectsParity}`;
      if (key === lastEvilKey) return;
      lastEvilKey = key;
      performAnalysis();
    });

    const doCloseMainModalCleanup = (): void => {
      unsubscribeEvil();
      utilityZ2Enabled = false;
      utilityY2Enabled = false;
      utilityFlipColorEnabled = false;
      activeTracerClose = null;
      activeTracerSilentClose = null;

      window.removeEventListener('resize', updateButtonPositions);
      backdrop.remove();
      closeBtnElement.remove();
      settingsBtnElement.remove();
      document.body.classList.remove('modal-open');
    };

    const closeMainModal = (): void => {
      closeModalWithHistory(doCloseMainModalCleanup);
    };

    // Silent variant: clean up the DOM + modal stack WITHOUT a history.back().
    const closeParityTracerModalSilent = (): void => {
      removeCloseModalFromStack(closeMainModal);
      doCloseMainModalCleanup();
    };

    activeTracerClose = closeMainModal;
    activeTracerSilentClose = closeParityTracerModalSilent;

    pushModalState('parityTracerModal', closeMainModal);

    closeBtnElement.addEventListener('click', closeMainModal);

    const headerInfoBtn = modal.querySelector(`#${uniqueId}-header-info`) as HTMLButtonElement | null;
    if (headerInfoBtn) {
      headerInfoBtn.addEventListener('click', () => {
        showParityTracerInstructionModal(config);
      });
    }

    settingsBtnElement.addEventListener('click', () => {
      openUnifiedSettings('parity');
    });

    performAnalysis();
  }, 0);

  return backdrop;
}

// ── Public entry points (mirror legacy window functions) ─────────────────────
function openNewParityAnalysis(setup: string | null, fromTrainingCaseInfo = false): void {
  const modal = createParityTracerModalWithAllParametersIncluded({
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff',
    hideInstructionButton: hideInstructionsSetting(),
    instructionText1: 'Enter your scramble in the top input bar to trace parity using Cale\'s method.',
    instructionText2: 'You can change the color scheme from Color Scheme Settings in the main Settings menu.',
    instructionText3: 'Customize the tracing start point from the settings button at the bottom right.',
    topColor: colorScheme.topColor,
    topColorName: getColorName(colorScheme.topColor),
    topColorShort: getColorName(colorScheme.topColor).charAt(0),
    bottomColor: colorScheme.bottomColor,
    bottomColorName: getColorName(colorScheme.bottomColor),
    bottomColorShort: getColorName(colorScheme.bottomColor).charAt(0),
    frontColor: colorScheme.frontColor,
    rightColor: colorScheme.rightColor,
    backColor: colorScheme.backColor,
    leftColor: colorScheme.leftColor,
    scrambleText: setup || '',
    generateImage: true,
    imageSize: Number(readCspObject(CSP_PREFERENCES_KEY).ptImageSize) || 280,
  });
  if (fromTrainingCaseInfo && modal instanceof HTMLElement) {
    modal.classList.add('training-followup-modal');
  }
}

function buildConfigFromColorScheme(): TracerConfig {
  return {
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff',
    hideInstructionButton: hideInstructionsSetting(),
    instructionText1: '',
    instructionText2: '',
    instructionText3: '',
    topLayerMainColor: resolveThemeAwareWhite(colorScheme.topColor),
    topLayerColorFullName: getColorName(colorScheme.topColor),
    topLayerColorAbbreviation: getColorName(colorScheme.topColor).charAt(0),
    bottomLayerMainColor: resolveThemeAwareWhite(colorScheme.bottomColor),
    bottomLayerColorFullName: getColorName(colorScheme.bottomColor),
    bottomLayerColorAbbreviation: getColorName(colorScheme.bottomColor).charAt(0),
    frontFaceColorForVisualization: colorScheme.frontColor,
    rightFaceColorForVisualization: colorScheme.rightColor,
    backFaceColorForVisualization: colorScheme.backColor,
    leftFaceColorForVisualization: colorScheme.leftColor,
    scrambleTextInput: '',
    shouldGenerateImage: true,
    imageSizeInPixels: Number(readCspObject(CSP_PREFERENCES_KEY).ptImageSize) || 280,
    returnOnlyParityValue: false,
  };
}

function openParityTracingPersonalization(): void {
  showTracingPositionSettingsModal(null, buildConfigFromColorScheme(), null, null);
}

function openEvilnessCasesFromSettings(): void {
  showEvilnessCasesModal(null, buildConfigFromColorScheme(), null, null);
}

function hideInstructionsSetting(): boolean {
  return hideInstructions;
}

function getColorName(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#000000': 'Black',
    '#474747': 'Black',
    '#FFFFFF': 'White',
    '#FFFF00': 'Yellow',
    '#FFD700': 'Yellow',
  };
  return colorMap[hexColor.toUpperCase()] || 'Top';
}

// ── Window shims ─────────────────────────────────────────────────────────────
export const ParityTracerLibrary = {
  createModal: createParityTracerModalWithAllParametersIncluded,
  openConfigModal: (
    modalElement: HTMLElement | null,
    config: TracerConfig | ParityTracerOptions,
    mainCloseBtn: HTMLElement | null,
    _mainInstructionBtn: HTMLElement | null,
    mainSettingsBtn: HTMLElement | null,
  ): void => {
    showTracingPositionSettingsModal(modalElement, config as TracerConfig, mainCloseBtn, mainSettingsBtn);
  },
  openEvilnessCasesModal: (config: TracerConfig): void => {
    showEvilnessCasesModal(null, config, null, null);
  },
  reloadShapesFromStorage: (): void => {
    shapePatterns = { ...getShapePatterns() };
  },
  version: '2.0.0',
};

export function installParityTracerShims(): void {
  const w = window as unknown as Record<string, unknown>;
  w.ParityTracerLibrary = ParityTracerLibrary;
  w.openNewParityAnalysis = openNewParityAnalysis;
  w.openParityTracingPersonalization = openParityTracingPersonalization;
  w._openEvilnessCasesFromSettings = openEvilnessCasesFromSettings;
  w.closeParityTracerModal = (): void => {
    if (activeTracerClose) activeTracerClose();
  };
  w.closeParityTracerModalSilent = (): void => {
    if (activeTracerSilentClose) activeTracerSilentClose();
  };
}
