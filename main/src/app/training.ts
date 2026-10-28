/**
 * Training modal + trainer picker + multi-case selector + quizzes.
 * Port of legacy js/training-modal.js (2497 lines) + js/multi-trainer.js (645).
 *
 * Everything is imperative DOM: the training modal, shape-index selector,
 * trainer picker, evilness/parity/color quizzes and the case selector are all
 * created and driven from here, backed by the CSS in main/public/training-modal.css.
 *
 * Live-update bridges (`resizeCurrentTrainingScramble`, `_trApplyTextSize`,
 * `applyPrevScrambleBar`, ...) are exposed on `window` so the React settings
 * modal (Trainer tab) can drive the open training modal exactly like legacy
 * settings.js did.
 */
import {
  comparePriorityCases,
  data,
  colorScheme,
  cornerStickerMode,
  evilnessFactor,
  hideInstructions,
  getDisplayName,
  isCaseEvil,
  learnedCases,
  learningCases,
  plannedLevels,
} from './state';
import type { AlgCase } from '../data/types';
import { getCaseId } from '../data/cases';
import { CSPData } from '../lib/dataStore';
import { parseHexFormat } from '../lib/scramble';
import { scrambleFromState } from '../lib/solver';
import { processScramble } from '../lib/colorizer';
import { shapeIndexToHex } from '../lib/cube';
import { visualizeFromScramble, visualizeShapes } from '../lib/drawScramble';
import { getColorName, getParityText } from '../lib/parityAnalyzer';
import { pushModalState, closeModalWithHistory, getTopModalId, hasOpenModal } from './modal';
import { showToast } from './toast';
import { mountInfoTip } from '../components/mountInfoTip';
import { renderCard } from './cardHTML';
import { openNotesModal } from './notes';
import { decorateLearningOrderGrid } from './learningOrder';
import { CSP_TRAINING_KEY, readCspObject, updateCspObject } from '../lib/storage';

// ── Training modal state (mirrors legacy) ───────────────────────────────────
let currentTrainingCase: number | null = null;
let trainingScrambles: number[] = [];
let timerRunning = false;
let timerStartTime = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerElapsed = 0;
let isHolding = false;
let preGeneratedScrambles: ScrambleData[] = [];
let currentScrambleText = '';
let scrambleHistory: ScrambleData[] = [];
let currentHistoryIndex = -1;
const trainingStorage = readCspObject(CSP_TRAINING_KEY);
let trainingScrambleImageSize = Number(trainingStorage.scramImageSize) || 280;
let trainingScrambleTextSize = Number(trainingStorage.scramTextSize) || 16;
let trainingHoldToStart = Number(trainingStorage.holdToStart) || 0.22;
let holdStartTime = 0;
let isHoldReady = false;
let inspectionStartTime = 0;
let inspectionElapsed = 0;
let lastInspectionElapsed = 0;
let lastParityQuizWrong = false;
let inspectionInterval: ReturnType<typeof setInterval> | null = null;
let isInspectionPhase = false;
let parityQuizPhase = false;
let parityQuizAnswer: 'even' | 'odd' | null = null;
let spacePressed = false;
let shiftKeyTimerWasRunning = false;
let shiftShortcutTriggered = false;
let resetDismissedTooltipOnPointerMove: ((event: PointerEvent) => void) | null = null;
let shapeIndexRenderVersion = 0;
let shapeIndexRenderFrame: number | null = null;
let trainerEmpty = false;

interface ScrambleData {
  text: string;
  image: string;
  caseName?: number;
  passEnd?: boolean;
  passAnnounced?: boolean;
}

interface ShapeIndexRenderEntry {
  index: number;
  type: 'org' | 'mir';
  button: HTMLButtonElement;
}

const SHAPE_INDEX_WRAPPER_PADDING = 16;

// Live-setting mirrors (bridged to window so React settings can mutate them).
let trainingEnableInspection = trainingStorage.inspection === true;
let trainingEnableParityQuiz = trainingStorage.parityQuiz === true;
let trainingHideScrambleImage = trainingStorage.hideScramImage === true;

// Inspection beeps (Web Audio).
let _trainingAudioCtx: AudioContext | null = null;
let _inspBeep8Fired = false;
let _inspBeep12Fired = false;
let _inspBeep15Fired = false;

// ── Multi-case / selector state (mirrors legacy multi-trainer.js) ───────────
const trainingSelections: Record<string, number[]> = {};
let selectorSelectedCases = new Set<number>();
let selectorSearchTerm = '';
let selectorFilteredData: AlgCase[] = [];
let multiTrainingCases: number[] = [];
let _goThroughRemaining: number[] = [];
let _lastGoThroughCase: number | null = null;
let selectorStorageKey = 'sq1-selector-cases';
let multiCaseMode = false;
let evilQuizOnSelectionChange: ((ids: number[]) => void) | null = null;
let parityQuizOnSelectionChange: ((ids: number[]) => void) | null = null;

const TIMER_SELECTOR_KEY = 'sq1-selector-cases';

// ── Scramble text/image helpers ──────────────────────────────────────────────
// Draw-scramble ring distance, matching the parity tracer's visualization.
const TRAINING_SCRAMBLE_RING_DISTANCE = 120;

// Paired scramble SVG geometry relative to `size` (same math as getShapeIndexSvgSize).
const SCRAMBLE_CORE_RATIO = 220 / 400;
const SCRAMBLE_WIDTH_RATIO =
  SCRAMBLE_CORE_RATIO * 2 +
  SCRAMBLE_CORE_RATIO * (0.44 * (2 + TRAINING_SCRAMBLE_RING_DISTANCE / 100) - 1);
const SCRAMBLE_HEIGHT_RATIO = SCRAMBLE_CORE_RATIO * (1 + 0.0891);

// Largest image size that fits the viewport. Temporary cap: never written to settings.
function getEffectiveImageSize(requested: number = trainingScrambleImageSize || 280): number {
  const sidePad = window.innerWidth <= 768 ? 36 : 20; // matches container + zone padding in CSS
  const maxByWidth = (document.documentElement.clientWidth - sidePad * 2) / SCRAMBLE_WIDTH_RATIO;
  const maxByHeight = (window.innerHeight * 0.45) / SCRAMBLE_HEIGHT_RATIO;
  return Math.max(60, Math.floor(Math.min(requested, maxByWidth, maxByHeight)));
}

function formatMedianTime(timesMs: number[]): string {
  if (timesMs.length === 0) return 'Median: —';
  const sorted = [...timesMs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return `Median: ${(median / 1000).toFixed(3)}s`;
}

function hexToScrambleText(hexCode: string): string {
  let text = hexCode;
  try {
    const state = parseHexFormat(hexCode);
    const notation = scrambleFromState(state) || hexCode;
    const processed = processScramble(notation);
    text = processed.html || notation;
  } catch {
    // keep hex fallback
  }
  return text;
}

function hexToScrambleImage(hexCode: string, size = getEffectiveImageSize()): string {
  let image = '<div style="color: var(--text-muted)">Image unavailable</div>';
  try {
    const state = parseHexFormat(hexCode);
    const notation = scrambleFromState(state) || hexCode;
    image = visualizeFromScramble(notation, size, colorScheme, TRAINING_SCRAMBLE_RING_DISTANCE);
  } catch {
    // keep placeholder
  }
  return image;
}

// ── Scramble generation ──────────────────────────────────────────────────────
function generateNextScrambleData(): ScrambleData | null {
  if (multiCaseMode) return generateMultiCaseScrambleData();
  if (trainingScrambles.length === 0 || currentTrainingCase === null) return null;

  const randomIndex = Math.floor(Math.random() * trainingScrambles.length);
  const scramble = trainingScrambles[randomIndex];
  const hexCode = shapeIndexToHex(scramble);

  return {
    text: hexToScrambleText(hexCode),
    image: hexToScrambleImage(hexCode),
    caseName: currentTrainingCase,
  };
}

function generateMultiCaseScrambleData(): ScrambleData | null {
  if (!multiTrainingCases || multiTrainingCases.length === 0) return null;

  let caseName: number | undefined;
  let passEnd = false;
  if (isGoThroughEnabled(TIMER_SELECTOR_KEY)) {
    // Draw from the pool at generation time so lookahead scrambles cover distinct cases.
    if (_goThroughRemaining.length === 0) resetGoThroughPool(_lastGoThroughCase);
    caseName = _goThroughRemaining.shift();
    _lastGoThroughCase = caseName ?? null;
    passEnd = _goThroughRemaining.length === 0 && multiTrainingCases.length > 1;
  } else {
    caseName = multiTrainingCases[Math.floor(Math.random() * multiTrainingCases.length)];
  }
  if (!caseName) return null;

  const shapeIndexItem = CSPData.getShapeEntry(caseName);
  if (!shapeIndexItem) return null;

  // Multi-case training always uses every angle of each case.
  const indices = [...(shapeIndexItem.org || []), ...(shapeIndexItem.mir || [])];
  if (indices.length === 0) return null;

  const scramble = indices[Math.floor(Math.random() * indices.length)];
  const hexCode = shapeIndexToHex(scramble);

  return {
    text: hexToScrambleText(hexCode),
    image: hexToScrambleImage(hexCode),
    caseName,
    passEnd,
  };
}

function hasTrainerScrambles(): boolean {
  return multiCaseMode ? multiTrainingCases.length > 0 : trainingScrambles.length > 0;
}

// Nothing selected: hide the scramble and show "--:--". Returns true when empty.
function syncEmptyState(): boolean {
  const empty = !hasTrainerScrambles();
  const wasEmpty = trainerEmpty;
  trainerEmpty = empty;
  document.getElementById('trainingModal')?.classList.toggle('training-empty', empty);
  const timerEl = document.getElementById('trainingTimer');
  if (empty) {
    resetTimerStateOnEscape(true);
    preGeneratedScrambles = [];
    scrambleHistory = [];
    currentHistoryIndex = -1;
    currentScrambleText = '';
    const scrambleEl = document.getElementById('trainingScramble');
    if (scrambleEl) {
      scrambleEl.style.fontSize = trainingScrambleTextSize + 'px';
      const prompt = multiCaseMode ? 'Select a case to start training' : 'Select an angle to start training';
      scrambleEl.innerHTML = `<span style="color:var(--text-muted);font-style:italic;font-family:inherit;">${prompt}</span>`;
    }
    // Solved cube keeps the layout (and timer position) identical to the populated state.
    const imgEl = document.getElementById('trainingScrambleImage');
    if (imgEl) {
      let solved = '';
      if (!trainingHideScrambleImage) {
        try {
          solved = visualizeFromScramble(
            '(0,0)',
            getEffectiveImageSize(),
            colorScheme,
            TRAINING_SCRAMBLE_RING_DISTANCE,
          );
        } catch {
          // leave blank on failure
        }
      }
      imgEl.innerHTML = solved;
    }
    if (timerEl) timerEl.textContent = '--:--';
    applyPrevScrambleBar();
  } else if (wasEmpty && timerEl) {
    timerEl.textContent = '0.000';
  }
  return empty;
}

// ── Modal creation ───────────────────────────────────────────────────────────
function createTrainingModal(): HTMLElement {
  let modal = document.getElementById('trainingModal') as HTMLElement | null;
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'trainingModal';
  modal.className = 'training-modal';
  modal.innerHTML = `
        <div class="training-modal-header">
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="training-modal-title" id="trainingCaseName" style="background: none; border: none; cursor: pointer; padding: 0; font: inherit; text-align: left; color: var(--link-color); text-decoration: underline;" title="Click to select angles to train">Training: Case Name</button>
                <button class="training-modal-info training-info-btn" id="trainingInfoBtn" title="Training mode help">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </button>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="training-modal-refresh" id="trainingPrevBtn" title="Previous scramble">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <button class="training-modal-refresh" id="trainingNextBtn" title="Next scramble">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 6 15 12 9 18"></polyline>
                    </svg>
                </button>
                <button class="training-modal-refresh" id="trainingSettingsBtn" title="Training settings">
                    <span class="themed-icon themed-icon--training-settings" aria-hidden="true"></span>
                </button>
                <button class="training-modal-close" id="trainingCloseBtn" title="Close training">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="training-modal-scramble" id="trainingScramble" title="Click to analyze parity">Loading...</div>
        <div class="training-modal-timer-zone" id="trainingTimerZone">
            <div class="training-modal-image-container">
                <div class="training-modal-image" id="trainingScrambleImage"></div>
            </div>
            <div id="trainingTimerSubInfo" style="display:none; font-size:0.78rem;color:var(--text-muted);font-weight:500;text-align:center;line-height:1.6;width:100%;"></div>
            <div class="training-modal-timer" id="trainingTimer">0.000</div>
            <div class="training-case-actions">
                <button class="training-case-action" id="trainingPeekNotesBtn" data-tooltip="Peek the notes for this CSP (Shift + H)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14.5a7 7 0 1 1 7 0c-.8.6-1.2 1.3-1.4 2.5h-4.2c-.2-1.2-.6-1.9-1.4-2.5Z"></path>
                    </svg>
                    <span>Peek notes</span>
                </button>
                <button class="training-case-action" id="trainingCaseInfoBtn" data-tooltip="See the full info for this CSP (Shift + I)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path>
                    </svg>
                    <span>Case info</span>
                </button>
            </div>
            <div id="trainingInspectionLabel" style="display:none; font-size:0.78rem;color:var(--accent);font-weight:600;letter-spacing:0.05em;"></div>
        </div>
    <div id="prevScrambleBar" style="position:fixed; bottom:0; left:0; width:100%; display:none; padding:8px 16px; font-family:Consolas,Monaco,'Courier New',monospace; text-align:center; z-index:10001; box-sizing:border-box;"><span style="color: var(--prevscramble-empty-color); font-style:italic;">No previous scramble to show</span></div>
    `;

  document.body.appendChild(modal);

  document.getElementById('trainingNextBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    nextScrambleManual();
  });

  document.getElementById('trainingPrevBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    previousScramble();
  });

  document.getElementById('trainingCloseBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTrainingModal();
  });

  document.getElementById('trainingScramble')!.addEventListener('click', (e) => {
    e.stopPropagation();
    openParityAnalysisFromTraining();
  });

  document.getElementById('prevScrambleBar')!.addEventListener('click', (e) => {
    e.stopPropagation();
    const prev = scrambleHistory[currentHistoryIndex - 1];
    if (prev) openParityAnalysisFromTraining(prev.text);
  });

  document.getElementById('trainingCaseName')!.addEventListener('click', (e) => {
    e.stopPropagation();
    openShapeIndexSelector();
  });

  document.getElementById('trainingInfoBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    openTrainingInfoModal();
  });

  document.getElementById('trainingSettingsBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    openTrainingSettingsModal();
  });

  document.getElementById('trainingPeekNotesBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shiftKeyTimerWasRunning) shiftShortcutTriggered = true;
    const caseId = getCurrentTrainingCaseId();
    if (caseId === undefined) {
      showToast('No case is assigned to this scramble.', 2500, 'error');
      return;
    }
    openNotesModal(String(caseId), true);
    if (document.getElementById('notesModal')) {
      dismissTrainingCaseTooltip(e.currentTarget as HTMLElement);
    }
  });

  document.getElementById('trainingCaseInfoBtn')!.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shiftKeyTimerWasRunning) shiftShortcutTriggered = true;
    openTrainingCaseInfoModal();
  });

  const caseActions = document.querySelector('.training-case-actions')!;
  ['mousedown', 'mouseup', 'mouseleave', 'touchstart', 'touchend'].forEach((eventName) => {
    caseActions.addEventListener(eventName, (e) => e.stopPropagation());
  });

  const timerZone = document.getElementById('trainingTimerZone')!;

  timerZone.addEventListener('mousedown', () => {
    if (parityQuizPhase) return;
    handleTimerMouseDown();
  });
  timerZone.addEventListener('mouseup', () => {
    if (parityQuizPhase) return;
    handleTimerMouseUp();
  });
  timerZone.addEventListener('mouseleave', () => {
    if (parityQuizPhase) return;
    handleTimerMouseLeave();
  });

  timerZone.addEventListener('touchstart', (e) => {
    if (parityQuizPhase) return;
    handleTimerTouchStart(e);
  });
  timerZone.addEventListener('touchend', (e) => {
    if (parityQuizPhase) return;
    handleTimerTouchEnd(e);
  });

  return modal;
}

function getCurrentTrainingCaseId(): number | undefined {
  return scrambleHistory[currentHistoryIndex]?.caseName ?? currentTrainingCase ?? undefined;
}

function dismissTrainingCaseTooltip(button: HTMLElement): void {
  button.classList.add('tooltip-dismissed');
  if (resetDismissedTooltipOnPointerMove) {
    document.removeEventListener('pointermove', resetDismissedTooltipOnPointerMove);
  }

  resetDismissedTooltipOnPointerMove = (event: PointerEvent) => {
    const bounds = button.getBoundingClientRect();
    if (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    ) {
      return;
    }

    button.classList.remove('tooltip-dismissed');
    document.removeEventListener('pointermove', resetDismissedTooltipOnPointerMove!);
    resetDismissedTooltipOnPointerMove = null;
  };
  document.addEventListener('pointermove', resetDismissedTooltipOnPointerMove);
}

function openTrainingCaseInfoModal(): void {
  const caseId = getCurrentTrainingCaseId();
  if (caseId === undefined) {
    showToast('No case is assigned to this scramble.', 2500, 'error');
    return;
  }

  const item = data.find((entry) => entry.id === caseId);
  if (!item) {
    showToast('Case information is unavailable.', 2500, 'error');
    return;
  }

  const modalId = 'trainingCaseInfoModal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'modal active training-overlay-modal';
  modal.innerHTML = `
    <div class="training-case-info-content">
      ${renderCard(item)}
    </div>
  `;
  document.body.appendChild(modal);
  dismissTrainingCaseTooltip(
    document.getElementById('trainingCaseInfoBtn')!,
  );
  modal.addEventListener('click', (event) => {
    if ((event.target as Element).closest('.training-case-info-close')) {
      event.stopPropagation();
      closeTrainingCaseInfoModal();
    }
  });
  const cardActions = modal.querySelector('.card-header-actions');
  if (cardActions) {
    const closeButton = document.createElement('button');
    closeButton.className = 'training-case-info-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close case information');
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    cardActions.appendChild(closeButton);
  }
  pushModalState(modalId, closeTrainingCaseInfoModal);
}

function closeTrainingCaseInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('trainingCaseInfoModal');
    if (modal) {
      modal.dispatchEvent(new Event('sqg:training-case-info-closing'));
      modal.remove();
    }
  });
}

// ── Open/close ───────────────────────────────────────────────────────────────
export function openTrainingModal(caseName: string): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  const modal = createTrainingModal();
  const titleEl = document.getElementById('trainingCaseName')!;

  multiCaseMode = false;
  titleEl.onclick = null;
  currentTrainingCase = caseId;

  const dataItem = CSPData.getCase(caseId);
  if (!dataItem) {
    showToast('Case not found.', 2500, 'error');
    return;
  }

  const shapeIndexItem = CSPData.getShapeEntry(dataItem.id);
  if (!shapeIndexItem) {
    showToast('Case not found in shape index.', 2500, 'error');
    return;
  }

  const allScrambles = [...(shapeIndexItem.org || []), ...(shapeIndexItem.mir || [])];

  // Always start with every angle selected; selection is not kept between sessions.
  const selectedKey = `training_selected_${caseId}`;
  trainingScrambles = [...allScrambles];
  trainingSelections[selectedKey] = trainingScrambles;

  if (trainingScrambles.length === 0) {
    showToast('No training scrambles available for this case.', 2500, 'error');
    return;
  }

  pushModalState('trainingModal', closeTrainingModal);

  titleEl.textContent = `Training: ${getDisplayName(caseId)}`;
  preGeneratedScrambles = [];
  timerElapsed = 0;
  scrambleHistory = [];
  currentHistoryIndex = -1;
  isHoldReady = false;

  loadTrainingSettings();

  for (let i = 0; i < 3; i++) {
    preGeneratedScrambles.push(generateNextScrambleData()!);
  }

  displayNextScramble();

  modal.classList.add('active');
  document.body.classList.add('modal-open');
  applyPrevScrambleBar();
  applyTimerSize();
}

export function trainCaseFromContextMenu(caseName: string, openedFromTrainingCaseInfo: boolean): void {
  if (!openedFromTrainingCaseInfo) {
    openTrainingModal(caseName);
    return;
  }

  if (!multiCaseMode) return;

  closeTrainingCaseInfoModal();
  closeTrainingModal();
  openTrainingModal(caseName);
}

function closeTrainingModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('trainingModal');
    if (!modal) return;

    modal.classList.remove('active');
    document.body.classList.remove('modal-open');

    const bar = document.getElementById('prevScrambleBar');
    if (bar) bar.style.display = 'none';

    if (timerRunning) stopTimerOnly();

    preGeneratedScrambles = [];
    timerElapsed = 0;
    scrambleHistory = [];
    currentHistoryIndex = -1;
    currentTrainingCase = null;
    isHoldReady = false;
    isInspectionPhase = false;
    parityQuizPhase = false;
    if (inspectionInterval) clearInterval(inspectionInterval);
    if (trainerEmpty) {
      const timerEl = document.getElementById('trainingTimer');
      if (timerEl) timerEl.textContent = '0.000';
    }
    trainerEmpty = false;
    modal.classList.remove('training-empty');
    multiCaseMode = false;
  });
}

function loadTrainingSettings(): void {
  const settings = readCspObject(CSP_TRAINING_KEY);
  trainingScrambleImageSize = Number(settings.scramImageSize) || 280;
  trainingScrambleTextSize = Number(settings.scramTextSize) || 16;
  trainingHoldToStart = Number(settings.holdToStart) || 0.22;
  trainingEnableInspection = settings.inspection === true;
  trainingEnableParityQuiz = settings.parityQuiz === true;
  trainingHideScrambleImage = settings.hideScramImage === true;
}

// ── Scramble display ─────────────────────────────────────────────────────────
function displayNextScramble(): void {
  if (syncEmptyState()) return;

  // Announce once the last case of a pass has been left.
  const leaving = scrambleHistory[currentHistoryIndex];
  if (multiCaseMode && leaving?.passEnd && !leaving.passAnnounced) {
    leaving.passAnnounced = true;
    showToast('Gone through each case!', 3000, 'success');
  }

  clearInterval(inspectionInterval as ReturnType<typeof setInterval>);
  isInspectionPhase = false;
  parityQuizPhase = false;
  inspectionElapsed = 0;
  const overlay = document.getElementById('parityQuizOverlay');
  if (overlay) overlay.remove();
  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) insLabel.style.display = 'none';
  lastParityQuizWrong = false;

  const sub = document.getElementById('multiCaseSub');
  if (sub) sub.style.display = multiCaseMode ? 'block' : 'none';

  if (currentHistoryIndex < scrambleHistory.length - 1) {
    currentHistoryIndex++;
    displayScrambleData(scrambleHistory[currentHistoryIndex]);
    applyPrevScrambleBar();
    return;
  }

  if (preGeneratedScrambles.length === 0) return;

  const scrambleData = preGeneratedScrambles.shift();

  if (scrambleData) {
    displayScrambleData(scrambleData);

    scrambleHistory.push(scrambleData);
    currentHistoryIndex = scrambleHistory.length - 1;

    if (scrambleHistory.length > 50) {
      scrambleHistory.shift();
      currentHistoryIndex--;
    }
  }

  setTimeout(() => {
    preGeneratedScrambles.push(generateNextScrambleData()!);
  }, 0);

  applyPrevScrambleBar();
}

function displayScrambleData(scrambleData: ScrambleData): void {
  if (scrambleData.caseName !== undefined) currentTrainingCase = scrambleData.caseName;
  currentScrambleText = scrambleData.text.replace(/<[^>]*>/g, '');
  const scrambleEl = document.getElementById('trainingScramble')!;
  scrambleEl.innerHTML = scrambleData.text;
  scrambleEl.style.fontSize = trainingScrambleTextSize + 'px';
  const imgEl = document.getElementById('trainingScrambleImage')!;
  imgEl.innerHTML = trainingHideScrambleImage ? '' : scrambleData.image;
  applyHideScrambleImage();
}

function previousScramble(): void {
  if (currentHistoryIndex <= 0) return;

  stopTimerOnly();
  currentHistoryIndex--;

  const scrambleData = scrambleHistory[currentHistoryIndex];
  currentScrambleText = scrambleData.text.replace(/<[^>]*>/g, '');
  const scrambleEl = document.getElementById('trainingScramble')!;
  scrambleEl.innerHTML = scrambleData.text;
  scrambleEl.style.fontSize = trainingScrambleTextSize + 'px';
  const imgEl = document.getElementById('trainingScrambleImage')!;
  imgEl.innerHTML = trainingHideScrambleImage ? '' : scrambleData.image;
  applyPrevScrambleBar();
}

function nextScrambleManual(): void {
  stopTimerOnly();
  displayNextScramble();
}

function applyTimerSize(): void {
  const size = Number(readCspObject(CSP_TRAINING_KEY).timerSize) || 80;
  const el = document.getElementById('trainingTimer');
  if (el) el.style.fontSize = size + 'px';
}

function applyHideScrambleImage(): void {
  const modal = document.getElementById('trainingModal');
  if (modal) modal.classList.toggle('hide-scramble-image', trainingHideScrambleImage);
}

function applyPrevScrambleBar(): void {
  const bar = document.getElementById('prevScrambleBar');
  if (!bar) return;
  const trainingActive = document.getElementById('trainingModal')?.classList.contains('active');
  const enabled = readCspObject(CSP_TRAINING_KEY).showPrevScram === true;
  bar.style.fontSize = Math.max(10, trainingScrambleTextSize - 2) + 'px';
  if (!enabled || !trainingActive) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  const prevIdx = currentHistoryIndex - 1;
  const hasPrev = prevIdx >= 0 && !!scrambleHistory[prevIdx];
  bar.style.cursor = hasPrev ? 'pointer' : 'default';
  bar.title = hasPrev ? 'Click to analyze parity' : '';
  if (prevIdx < 0 || !scrambleHistory[prevIdx]) {
    bar.innerHTML =
      '<span style="color:var(--text-muted); font-style:italic; font-family:inherit;">No previous scramble to show</span>';
  } else {
    bar.innerHTML = `<span style="color: var(--text-secondary); font-family:inherit;">Previous scramble: </span>${scrambleHistory[prevIdx].text}`;
  }
}

function regenerateScrambleLookaheadLegacy(): void {
  if (syncEmptyState()) return;
  preGeneratedScrambles = [];
  for (let i = 0; i < 3; i++) {
    preGeneratedScrambles.push(generateNextScrambleData()!);
  }
  if (currentHistoryIndex === scrambleHistory.length - 1 || scrambleHistory.length === 0) {
    displayNextScramble();
  }
}

// Resize the currently-displayed scramble image in place WITHOUT advancing to a
// new scramble (used when the user changes the training image-size setting).
function resizeCurrentTrainingScramble(): void {
  if (trainerEmpty) {
    syncEmptyState();
    return;
  }
  const imgEl = document.getElementById('trainingScrambleImage');
  if (imgEl && !trainingHideScrambleImage && currentScrambleText) {
    try {
      const img = visualizeFromScramble(
        currentScrambleText,
        getEffectiveImageSize(),
        colorScheme,
        TRAINING_SCRAMBLE_RING_DISTANCE,
      );
      imgEl.innerHTML = img;
      if (scrambleHistory[currentHistoryIndex]) scrambleHistory[currentHistoryIndex].image = img;
    } catch {
      // keep existing image on failure
    }
  }
  preGeneratedScrambles = [];
  for (let i = 0; i < 3; i++) preGeneratedScrambles.push(generateNextScrambleData()!);
}

// ── Parity tracer hook (tracer itself is ported separately) ──────────────────
function openParityAnalysisFromTraining(scrambleText: string = currentScrambleText): void {
  const cleanScramble = scrambleText.replace(/<[^>]*>/g, '').trim();

  const tracerLib = (window as unknown as { ParityTracerLibrary?: unknown }).ParityTracerLibrary;
  if (!tracerLib) {
    showToast('Parity Tracer library not loaded', 2500, 'info');
    return;
  }

  const createModal = (tracerLib as { createModal: (opts: Record<string, unknown>) => void })
    .createModal;
  createModal({
    backgroundColor:
      getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff',
    hideInstructionButton: hideInstructions,
    instructionText1:
      'Enter your scramble in the top input bar and press Analyze to trace parity using Kale\'s method.',
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
    scrambleText: cleanScramble,
    generateImage: true,
    imageSize: trainingScrambleImageSize || 280,
  });
}

// ── Timer handlers ───────────────────────────────────────────────────────────
function handleTimerMouseDown(): void {
  if (trainerEmpty || timerRunning) return;
  if (trainingEnableInspection && !isInspectionPhase && !parityQuizPhase) {
    if (trainingEnableParityQuiz) startParityQuizInspection();
    else startInspection();
    return;
  }
  if (isInspectionPhase && !parityQuizPhase) {
    beginHold();
    return;
  }
  beginHold();
}

function handleTimerMouseUp(): void {
  if (timerRunning) {
    stopTimerOnly();
    goThroughConsume();
    displayNextScramble();
    return;
  }
  releaseHold();
}

function handleTimerMouseLeave(): void {
  if (isHolding && !timerRunning) {
    isHolding = false;
    isHoldReady = false;
    document.getElementById('trainingTimer')!.style.color = 'var(--text-ui)';
  }
}

function handleTimerTouchStart(e: Event): void {
  e.preventDefault();
  if (trainerEmpty || timerRunning) return;
  if (trainingEnableInspection && !isInspectionPhase && !parityQuizPhase) {
    if (trainingEnableParityQuiz) startParityQuizInspection();
    else startInspection();
    return;
  }
  beginHold();
}

function handleTimerTouchEnd(e: Event): void {
  e.preventDefault();
  if (timerRunning) {
    stopTimerOnly();
    goThroughConsume();
    displayNextScramble();
    return;
  }
  releaseHold();
}

function beginHold(): void {
  startHold();
}

function startHold(): void {
  isHolding = true;
  isHoldReady = false;
  holdStartTime = Date.now();
  document.getElementById('trainingTimer')!.style.color = 'var(--card-learning-border)';
  const holdCheckInterval = setInterval(() => {
    if (!isHolding) {
      clearInterval(holdCheckInterval);
      return;
    }
    const holdDuration = (Date.now() - holdStartTime) / 1000;
    if (holdDuration >= trainingHoldToStart && !isHoldReady) {
      isHoldReady = true;
      document.getElementById('trainingTimer')!.style.color = 'var(--card-learned-border)';
      clearInterval(holdCheckInterval);
    }
  }, 10);
}

function releaseHold(): void {
  const timerEl = document.getElementById('trainingTimer')!;
  if (isInspectionPhase && !parityQuizPhase && isHolding && isHoldReady) {
    isHolding = false;
    isHoldReady = false;
    timerEl.style.color = 'var(--text-ui)';
    stopInspectionAndStartTimer();
    return;
  }
  if (isInspectionPhase && !parityQuizPhase && isHolding) {
    isHolding = false;
    isHoldReady = false;
    timerEl.style.color = 'var(--accent)';
    return;
  }
  if (!isInspectionPhase && isHolding && isHoldReady) {
    isHolding = false;
    isHoldReady = false;
    timerEl.style.color = 'var(--text-ui)';
    startTimer();
    return;
  }
  if (isHolding) {
    isHolding = false;
    isHoldReady = false;
    timerEl.style.color = 'var(--text-ui)';
  }
}

// ── Inspection beeps (Web Audio, no asset needed) ────────────────────────────
function playInspectionBeep(freq = 800, count = 1, vol = 0.15, gap = 0.13): void {
  try {
    const Ctx =
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
      window.AudioContext;
    if (!Ctx) return;
    if (!_trainingAudioCtx) _trainingAudioCtx = new Ctx();
    const ctx = _trainingAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * gap;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  } catch {
    // audio not available
  }
}

function checkInspectionBeeps(): void {
  if (readCspObject(CSP_TRAINING_KEY).inspectionBeep !== true) return;
  if (!_inspBeep8Fired && inspectionElapsed >= 8000) {
    _inspBeep8Fired = true;
    playInspectionBeep(660, 1, 0.1, 0.13);
  }
  if (!_inspBeep12Fired && inspectionElapsed >= 12000) {
    _inspBeep12Fired = true;
    playInspectionBeep(820, 2, 0.15, 0.14);
  }
  if (!_inspBeep15Fired && inspectionElapsed >= 15000) {
    _inspBeep15Fired = true;
    playInspectionBeep(980, 3, 0.2, 0.1);
  }
}

function resetBeepFlags(): void {
  _inspBeep8Fired = false;
  _inspBeep12Fired = false;
  _inspBeep15Fired = false;
}

function startInspection(): void {
  isInspectionPhase = true;
  inspectionElapsed = 0;
  resetBeepFlags();
  inspectionStartTime = Date.now();
  const timerEl = document.getElementById('trainingTimer')!;
  timerEl.style.color = 'var(--accent)';
  timerEl.textContent = '0.000';
  const subInfo = document.getElementById('trainingTimerSubInfo');
  if (subInfo) subInfo.style.display = 'none';

  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) {
    insLabel.textContent = 'inspecting…';
    insLabel.style.display = 'block';
  }

  if (inspectionInterval) clearInterval(inspectionInterval);
  inspectionInterval = setInterval(() => {
    inspectionElapsed = Date.now() - inspectionStartTime;
    timerEl.textContent = (inspectionElapsed / 1000).toFixed(3);
    checkInspectionBeeps();
  }, 10);
}

function stopInspectionAndStartTimer(): void {
  if (inspectionInterval) clearInterval(inspectionInterval);
  inspectionElapsed = Date.now() - inspectionStartTime;
  lastInspectionElapsed = inspectionElapsed;
  isInspectionPhase = false;
  parityQuizPhase = false;
  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) insLabel.style.display = 'none';
  startTimer();
}

function startParityQuizInspection(): void {
  const cleanScramble = currentScrambleText.replace(/<[^>]*>/g, '').trim();
  let parity: 'Odd' | 'Even' | 'Error' | null = null;
  try {
    parity = getParityText(cleanScramble, colorScheme, cornerStickerMode);
  } catch {
    // fall through
  }

  parityQuizAnswer = parity === 'Even' ? 'even' : parity === 'Odd' ? 'odd' : null;
  parityQuizPhase = true;
  isInspectionPhase = true;
  inspectionElapsed = 0;
  resetBeepFlags();
  inspectionStartTime = Date.now();

  const timerEl = document.getElementById('trainingTimer')!;
  timerEl.style.color = 'var(--accent)';
  timerEl.textContent = '0.000';
  const existingSubInfo = document.getElementById('trainingTimerSubInfo');
  if (existingSubInfo) existingSubInfo.style.display = 'none';

  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) {
    insLabel.textContent = 'inspecting…';
    insLabel.style.display = 'block';
  }

  const timerZone = document.getElementById('trainingTimerZone')!;
  timerZone.style.position = 'relative';

  let overlay = document.getElementById('parityQuizOverlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'parityQuizOverlay';
  overlay.style.cssText = `
        position:absolute; top:0; left:0; width:100%; height:100%;
        display:flex; flex-direction:row; z-index:100; border-radius:inherit; overflow:hidden;
    `;

  const useEvilLabels = evilnessFactor;
  const goodLabel = useEvilLabels ? 'GOOD ALG' : 'EVEN';
  const badLabel = useEvilLabels ? 'BAD ALG' : 'ODD';

  overlay.innerHTML = `
        <button id="pqGoodBtn" style="
            flex:1; border:none; cursor:pointer;
            background:rgba(45,106,45,0.10);
            transition:background 0.15s;
            display:flex; align-items:center; justify-content:center;
            font-size:1rem; font-weight:800;
            color:var(--nice-case); letter-spacing:0.06em;
        ">${goodLabel}</button>
        <div style="width:1px;background:rgba(0,0,0,0.07);flex-shrink:0;"></div>
        <button id="pqBadBtn" style="
            flex:1; border:none; cursor:pointer;
            background:rgba(139,0,0,0.10);
            transition:background 0.15s;
            display:flex; align-items:center; justify-content:center;
            font-size:1rem; font-weight:800;
            color:var(--evil-case); letter-spacing:0.06em;
        ">${badLabel}</button>
    `;

  timerZone.appendChild(overlay);

  const mq = window.matchMedia('(max-width:500px)');
  const applyLayout = (narrow: boolean) => {
    overlay.style.flexDirection = narrow ? 'column' : 'row';
    const divider = overlay.querySelector('div');
    if (divider) {
      (divider as HTMLElement).style.width = narrow ? '100%' : '1px';
      (divider as HTMLElement).style.height = narrow ? '1px' : '100%';
    }
  };
  applyLayout(mq.matches);
  mq.addEventListener('change', (e) => applyLayout(e.matches));

  if (inspectionInterval) clearInterval(inspectionInterval);
  inspectionInterval = setInterval(() => {
    inspectionElapsed = Date.now() - inspectionStartTime;
    timerEl.textContent = (inspectionElapsed / 1000).toFixed(3);
    checkInspectionBeeps();
  }, 10);

  let firstAnswerWrong = false;

  const handlePQAnswer = (userSaidGood: boolean) => {
    const correctIsGood = parityQuizAnswer === 'even';
    if (userSaidGood === correctIsGood) {
      overlay.remove();
      parityQuizPhase = false;
      if (firstAnswerWrong) lastParityQuizWrong = true;
      stopInspectionAndStartTimer();
    } else {
      firstAnswerWrong = true;
      const wrongBtn = document.getElementById(
        userSaidGood ? 'pqGoodBtn' : 'pqBadBtn',
      ) as HTMLButtonElement | null;
      if (wrongBtn) {
        const origBg = wrongBtn.style.background;
        const origColor = wrongBtn.style.color;
        wrongBtn.style.background = 'rgba(200,0,0,0.22)';
        wrongBtn.style.color = 'rgba(180,0,0,0.8)';
        wrongBtn.disabled = true;
        setTimeout(() => {
          wrongBtn.style.background = origBg;
          wrongBtn.style.color = origColor;
          wrongBtn.disabled = false;
        }, 700);
      }
    }
  };

  document.getElementById('pqGoodBtn')!.addEventListener('click', () => handlePQAnswer(true));
  document.getElementById('pqBadBtn')!.addEventListener('click', () => handlePQAnswer(false));
}

function startTimer(): void {
  if (timerRunning) return;

  timerElapsed = 0;
  timerRunning = true;
  timerStartTime = Date.now();

  const timerEl = document.getElementById('trainingTimer')!;
  timerEl.style.color = 'var(--text-ui)';

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerElapsed = Date.now() - timerStartTime;
    updateTimerDisplay();
  }, 10);
}

function stopTimerOnly(): void {
  if (!timerRunning) return;

  timerRunning = false;
  if (timerInterval) clearInterval(timerInterval);

  lastInspectionElapsed = inspectionElapsed;
  const wasParityWrong = lastParityQuizWrong;
  lastParityQuizWrong = false;
  const timerEl = document.getElementById('trainingTimer')!;
  timerEl.style.color = 'var(--text-ui)';
  timerEl.textContent = (timerElapsed / 1000).toFixed(3);

  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) insLabel.style.display = 'none';

  const subInfo = document.getElementById('trainingTimerSubInfo');
  if (!subInfo) return;

  if (trainingEnableInspection && lastInspectionElapsed > 0) {
    const insTime = (lastInspectionElapsed / 1000).toFixed(3);
    const solveTime = (timerElapsed / 1000).toFixed(3);
    let html = `<span style="color:var(--accent);font-weight:700;">(${insTime}s inspection)</span>`;
    if (wasParityWrong) {
      html += `<br><span style="color:var(--evil-case);font-weight:600;">✗ wrong parity answer</span>`;
    }
    subInfo.innerHTML = html;
    subInfo.style.display = 'block';
    const r = subInfo.getBoundingClientRect();
    const midX = (r.left + r.right) / 2;
    const midY = (r.top + r.bottom) / 2;
    void midX;
    void midY;
    void solveTime;
  } else {
    subInfo.style.display = 'none';
  }
}

function updateTimerDisplay(): void {
  const seconds = (timerElapsed / 1000).toFixed(3);
  document.getElementById('trainingTimer')!.textContent = seconds;
}

// ── Shape Index Selector ─────────────────────────────────────────────────────
function openShapeIndexSelector(): void {
  if (multiCaseMode) return;
  if (!currentTrainingCase) return;
  const shapeIndexItem = CSPData.getShapeEntry(currentTrainingCase);
  if (!shapeIndexItem) return;

  if (shapeIndexRenderFrame !== null) cancelAnimationFrame(shapeIndexRenderFrame);
  shapeIndexRenderFrame = null;
  const renderVersion = ++shapeIndexRenderVersion;

  pushModalState('shapeIndexSelectorModal', closeShapeIndexSelector);

  document.body.classList.add('modal-open');

  let selectorModal = document.getElementById('shapeIndexSelectorModal');
  if (!selectorModal) {
    selectorModal = document.createElement('div');
    selectorModal.id = 'shapeIndexSelectorModal';
    selectorModal.className = 'shape-index-selector-modal';
    selectorModal.innerHTML = `
            <div class="shape-index-selector-content">
                <div class="shape-index-selector-header">
                    <span class="shape-index-selector-title">Select Angles to Train</span>
                    <button class="shape-index-selector-close" onclick="closeShapeIndexSelector()">&times;</button>
                </div>
                <div class="shape-index-selector-body" id="shapeIndexSelectorBody"></div>
            </div>
        `;
    document.body.appendChild(selectorModal);
  }

  const selectedKey = `training_selected_${currentTrainingCase}`;
  const currentSelection = trainingSelections[selectedKey] || [];

  const body = document.getElementById('shapeIndexSelectorBody')!;
  const selectorGridStyle =
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); max-width: 100%; gap: 10px; margin-top: 10px;';

  selectorModal.style.visibility = 'hidden';
  selectorModal.classList.add('active');
  const sizing = getShapeIndexSvgSize(selectorGridStyle);
  const gridStyle = `${selectorGridStyle} grid-auto-rows: ${sizing.buttonHeight}px;`;
  const orgIndices = shapeIndexItem.org || [];
  const mirIndices = shapeIndexItem.mir || [];
  const renderEntries = (indices: number[], type: 'org' | 'mir') =>
    indices
      .map((idx) => {
        const active = currentSelection.includes(idx);
        return `
            <button class="shape-index-toggle ${active ? 'active' : ''}"
                    data-index="${idx}"
                    data-type="${type}"
                    onclick="toggleShapeIndex(${idx})"
                    style="background: ${active ? 'var(--surface-border)' : 'var(--surface)'};">
                <span class="shape-index-loading" aria-hidden="true"></span>
            </button>
        `;
      })
      .join('');

  body.innerHTML = `
        <div class="shape-index-section">
            <div class="shape-index-section-header">
                <span style="font-weight: 600;">Original Orientation</span>
                <div>
                    <button onclick="selectAllIndices('org')" style="padding: 3px 10px; margin-right: 5px; background: var(--surface2); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 3px; cursor: pointer; font-size: 0.8rem;">Select All</button>
                    <button onclick="deselectAllIndices('org')" style="padding: 3px 10px; background: var(--surface2); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 3px; cursor: pointer; font-size: 0.8rem;">Deselect All</button>
                </div>
            </div>
            <div class="shape-index-toggles" id="orgToggles" style="${gridStyle}">
                ${renderEntries(orgIndices, 'org')}
            </div>
        </div>
        <div class="shape-index-section" style="margin-top: 20px;">
            <div class="shape-index-section-header">
                <span style="font-weight: 600;">Mirror Orientation</span>
                <div>
                    <button onclick="selectAllIndices('mir')" style="padding: 3px 10px; margin-right: 5px; background: var(--surface2); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 3px; cursor: pointer; font-size: 0.8rem;">Select All</button>
                    <button onclick="deselectAllIndices('mir')" style="padding: 3px 10px; background: var(--surface2); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 3px; cursor: pointer; font-size: 0.8rem;">Deselect All</button>
                </div>
            </div>
            <div class="shape-index-toggles" id="mirToggles" style="${gridStyle}">
                ${renderEntries(mirIndices, 'mir')}
            </div>
        </div>
    `;

  const content = selectorModal.querySelector<HTMLElement>('.shape-index-selector-content')!;
  const header = selectorModal.querySelector<HTMLElement>('.shape-index-selector-header')!;
  content.style.height = '';
  content.style.height = `${Math.max(
    window.innerHeight * 0.2,
    Math.min(body.scrollHeight + header.offsetHeight, window.innerHeight * 0.8),
  )}px`;

  const orgButtons = Array.from(
    body.querySelectorAll<HTMLButtonElement>('#orgToggles .shape-index-toggle'),
  );
  const mirButtons = Array.from(
    body.querySelectorAll<HTMLButtonElement>('#mirToggles .shape-index-toggle'),
  );
  const entries: ShapeIndexRenderEntry[] = [
    ...orgIndices.map((index, i) => ({ index, type: 'org' as const, button: orgButtons[i] })),
    ...mirIndices.map((index, i) => ({ index, type: 'mir' as const, button: mirButtons[i] })),
  ];

  const orgGrid = document.getElementById('orgToggles')!;
  const orgGridRect = orgGrid.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const bodyStyle = getComputedStyle(body);
  const paddingTop = parseFloat(bodyStyle.paddingTop);
  const paddingBottom = parseFloat(bodyStyle.paddingBottom);
  const rowGap = parseFloat(getComputedStyle(orgGrid).rowGap);
  const visibleGridHeight = Math.max(
    sizing.buttonHeight,
    body.clientHeight - paddingTop - paddingBottom - (orgGridRect.top - bodyRect.top - paddingTop),
  );
  const visibleRows = Math.max(
    1,
    Math.ceil((visibleGridHeight + rowGap) / (sizing.buttonHeight + rowGap)),
  );
  const firstScreenCount = Math.min(
    entries.length,
    Math.max(sizing.columns, visibleRows * sizing.columns),
    sizing.columns,
  );

  for (let i = 0; i < firstScreenCount; i++) {
    renderShapeIndexEntry(entries[i], sizing.svgSize);
  }
  selectorModal.style.visibility = '';
  body.scrollTop = 0;
  renderRemainingShapeIndexEntries(entries, firstScreenCount, sizing.svgSize, renderVersion);
}

function getShapeIndexSvgSize(gridStyle: string): {
  svgSize: number;
  buttonHeight: number;
  columns: number;
} {
  const body = document.getElementById('shapeIndexSelectorBody');
  if (!body) throw new Error('Shape index selector body is missing');

  const grid = document.createElement('div');
  grid.className = 'shape-index-toggles';
  grid.id = 'shapeIndexSizingProbe';
  grid.style.cssText = gridStyle;
  for (let i = 0; i < 8; i++) {
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.className = 'shape-index-toggle';
    grid.appendChild(probe);
  }
  body.appendChild(grid);

  const probe = grid.firstElementChild as HTMLButtonElement;
  const buttonRect = probe.getBoundingClientRect();
  const buttonStyle = getComputedStyle(probe);
  const borderX = parseFloat(buttonStyle.borderLeftWidth) + parseFloat(buttonStyle.borderRightWidth);
  const borderY = parseFloat(buttonStyle.borderTopWidth) + parseFloat(buttonStyle.borderBottomWidth);
  const paddingX = parseFloat(buttonStyle.paddingLeft) + parseFloat(buttonStyle.paddingRight);
  const paddingY = parseFloat(buttonStyle.paddingTop) + parseFloat(buttonStyle.paddingBottom);
  const rowTop = probe.getBoundingClientRect().top;
  const columns = Math.max(
    1,
    Array.from(grid.children).filter(
      (child) => Math.abs((child as HTMLElement).getBoundingClientRect().top - rowTop) < 1,
    ).length,
  );
  const buttonHeight = buttonRect.height;
  grid.remove();

  const svgAvailableWidth =
    buttonRect.width - borderX - paddingX - SHAPE_INDEX_WRAPPER_PADDING * 2;
  const svgAvailableHeight =
    buttonHeight - borderY - paddingY - SHAPE_INDEX_WRAPPER_PADDING * 2;
  const coreSizeRatio = 220 / 400;
  const ringGapRatio =
    coreSizeRatio * (0.44 * (2 + TRAINING_SCRAMBLE_RING_DISTANCE / 100) - 1);
  const pairedSvgWidthRatio = coreSizeRatio * 2 + ringGapRatio;
  const svgHeightRatio = coreSizeRatio * (1 + 0.0891);
  return {
    svgSize: Math.max(
      1,
      Math.floor(
        Math.min(svgAvailableWidth / pairedSvgWidthRatio, svgAvailableHeight / svgHeightRatio),
      ),
    ),
    buttonHeight,
    columns,
  };
}

function renderShapeIndexEntry(entry: ShapeIndexRenderEntry, svgSize: number): void {
  const shapeHTML = visualizeShapes(
    shapeIndexToHex(entry.index),
    svgSize,
    '#e7e7e7ff',
    'transparent',
    window.getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
    1,
    TRAINING_SCRAMBLE_RING_DISTANCE,
    `${SHAPE_INDEX_WRAPPER_PADDING}px`,
  );
  entry.button.innerHTML = shapeHTML;
}

function renderRemainingShapeIndexEntries(
  entries: ShapeIndexRenderEntry[],
  startIndex: number,
  svgSize: number,
  renderVersion: number,
): void {
  let nextIndex = startIndex;
  const renderFrame = (): void => {
    if (
      renderVersion !== shapeIndexRenderVersion ||
      !document.getElementById('shapeIndexSelectorModal')?.classList.contains('active')
    ) {
      shapeIndexRenderFrame = null;
      return;
    }

    const deadline = performance.now() + 8;
    while (nextIndex < entries.length && performance.now() < deadline) {
      renderShapeIndexEntry(entries[nextIndex++], svgSize);
    }

    if (nextIndex < entries.length) {
      shapeIndexRenderFrame = requestAnimationFrame(renderFrame);
    } else {
      shapeIndexRenderFrame = null;
    }
  };

  if (startIndex < entries.length) {
    shapeIndexRenderFrame = requestAnimationFrame(renderFrame);
  }
}

function toggleShapeIndex(index: number): void {
  if (!currentTrainingCase) return;
  const selectedKey = `training_selected_${currentTrainingCase}`;
  if (!trainingSelections[selectedKey]) {
    const shapeIndexItem = CSPData.getShapeEntry(currentTrainingCase);
    trainingSelections[selectedKey] = [
      ...(shapeIndexItem?.org || []),
      ...(shapeIndexItem?.mir || []),
    ];
  }

  const currentSelection = trainingSelections[selectedKey];
  const indexPos = currentSelection.indexOf(index);

  if (indexPos > -1) {
    currentSelection.splice(indexPos, 1);
  } else {
    currentSelection.push(index);
  }

  const button = document.querySelector(
    `button.shape-index-toggle[data-index="${index}"]`,
  ) as HTMLButtonElement | null;
  if (button) {
    button.classList.toggle('active');
    button.style.background = button.classList.contains('active')
      ? 'var(--surface-border)'
      : 'var(--surface)';
  }

  trainingScrambles = currentSelection;
  regenerateScrambleLookaheadLegacy();

  if (currentSelection.length === 0) {
    console.warn('No shape indices selected');
  }
}

function selectAllIndices(type: 'org' | 'mir'): void {
  if (!currentTrainingCase) return;
  const shapeIndexItem = CSPData.getShapeEntry(currentTrainingCase);
  if (!shapeIndexItem) return;

  const selectedKey = `training_selected_${currentTrainingCase}`;
  if (!trainingSelections[selectedKey]) trainingSelections[selectedKey] = [];

  const indices = type === 'org' ? shapeIndexItem.org || [] : shapeIndexItem.mir || [];

  indices.forEach((idx) => {
    if (!trainingSelections[selectedKey].includes(idx)) {
      trainingSelections[selectedKey].push(idx);
    }
  });

  const buttons = document.querySelectorAll<HTMLButtonElement>(`button.shape-index-toggle[data-type="${type}"]`);
  buttons.forEach((btn) => {
    btn.classList.add('active');
    btn.style.background = 'var(--surface-border)';
  });

  trainingScrambles = trainingSelections[selectedKey];
  regenerateScrambleLookaheadLegacy();
}

function deselectAllIndices(type: 'org' | 'mir'): void {
  if (!currentTrainingCase) return;
  const shapeIndexItem = CSPData.getShapeEntry(currentTrainingCase);
  if (!shapeIndexItem) return;

  const selectedKey = `training_selected_${currentTrainingCase}`;
  if (!trainingSelections[selectedKey]) trainingSelections[selectedKey] = [];

  const indices = type === 'org' ? shapeIndexItem.org || [] : shapeIndexItem.mir || [];

  trainingSelections[selectedKey] = trainingSelections[selectedKey].filter(
    (idx) => !indices.includes(idx),
  );

  const buttons = document.querySelectorAll<HTMLButtonElement>(`button.shape-index-toggle[data-type="${type}"]`);
  buttons.forEach((btn) => {
    btn.classList.remove('active');
    btn.style.background = 'var(--surface)';
  });

  trainingScrambles = trainingSelections[selectedKey];
  regenerateScrambleLookaheadLegacy();
}

function closeShapeIndexSelector(): void {
  closeModalWithHistory(() => {
    shapeIndexRenderVersion++;
    if (shapeIndexRenderFrame !== null) cancelAnimationFrame(shapeIndexRenderFrame);
    shapeIndexRenderFrame = null;
    const modal = document.getElementById('shapeIndexSelectorModal');
    if (modal) {
      modal.classList.remove('active');
      if (!hasOpenModal()) document.body.classList.remove('modal-open');
    }
  });
}

// ── Global keyboard handlers (registered once in installTrainingShims) ──────
function resetTimerStateOnEscape(wasTimerRunning: boolean): void {
  if (inspectionInterval) clearInterval(inspectionInterval);
  if (timerRunning) {
    if (timerInterval) clearInterval(timerInterval);
    timerRunning = false;
  }
  isInspectionPhase = false;
  parityQuizPhase = false;
  isHolding = false;
  isHoldReady = false;
  spacePressed = false;
  inspectionElapsed = 0;
  resetBeepFlags();
  const overlay = document.getElementById('parityQuizOverlay');
  if (overlay) overlay.remove();
  const insLabel = document.getElementById('trainingInspectionLabel');
  if (insLabel) insLabel.style.display = 'none';

  const timerEl = document.getElementById('trainingTimer');
  if (timerEl) {
    timerEl.style.color = 'var(--text-ui)';
    if (wasTimerRunning) {
      timerElapsed = 0;
      timerEl.textContent = '0.000';
    } else {
      timerEl.textContent = timerElapsed > 0 ? (timerElapsed / 1000).toFixed(3) : '0.000';
    }
  }
  const subInfo = document.getElementById('trainingTimerSubInfo');
  if (subInfo) {
    subInfo.style.display =
      !wasTimerRunning && trainingEnableInspection && lastInspectionElapsed > 0
        ? 'block'
        : 'none';
  }
}

function handleTrainingKeyDown(e: KeyboardEvent): void {
  if (document.getElementById('evilnessQuizModal')) return;
  const modal = document.getElementById('trainingModal');
  if (!modal || !modal.classList.contains('active')) return;
  if (getTopModalId() && getTopModalId() !== 'trainingModal') return;

  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && timerRunning) {
    shiftKeyTimerWasRunning = true;
    shiftShortcutTriggered = false;
    return;
  }

  if (e.shiftKey && e.code === 'KeyH') {
    e.preventDefault();
    document.getElementById('trainingPeekNotesBtn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }
  if (e.shiftKey && e.code === 'KeyI') {
    e.preventDefault();
    document.getElementById('trainingCaseInfoBtn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }

  if (parityQuizPhase) {
    const leftKeys = new Set([
      'Tab',
      'Backquote',
      'Digit1',
      'Digit2',
      'Digit4',
      'Digit5',
      'Digit6',
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyR',
      'KeyT',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyF',
      'KeyG',
      'KeyZ',
      'KeyX',
      'KeyC',
      'KeyV',
    ]);
    const rightKeys = new Set([
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0',
      'Minus',
      'Equal',
      'KeyY',
      'KeyU',
      'KeyI',
      'KeyO',
      'KeyP',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'KeyJ',
      'KeyK',
      'KeyL',
      'Semicolon',
      'Quote',
      'KeyN',
      'KeyM',
      'Comma',
      'Period',
      'Slash',
      'Enter',
      'NumpadEnter',
    ]);
    if (leftKeys.has(e.code) || rightKeys.has(e.code)) {
      e.preventDefault();
      const goodBtn = document.getElementById('pqGoodBtn') as HTMLButtonElement | null;
      const badBtn = document.getElementById('pqBadBtn') as HTMLButtonElement | null;
      if (leftKeys.has(e.code) && goodBtn && !goodBtn.disabled) goodBtn.click();
      else if (rightKeys.has(e.code) && badBtn && !badBtn.disabled) badBtn.click();
      return;
    }
  }

  if (e.code === 'Escape') {
    if (getTopModalId() && getTopModalId() !== 'trainingModal') return;
    e.preventDefault();
    // Claim the Esc here so the global modal-stack handler (modal.ts) doesn't ALSO
    // pop the stack and close the training modal. While the trainer is open, Esc is
    // handled exclusively below (close sub-modal / reset timer / close).
    e.stopImmediatePropagation();
    const infoModal = document.getElementById('trainingInfoModal');
    const shapeModal = document.getElementById('shapeIndexSelectorModal');
    const selectorModal = document.getElementById('trainingSelectorModal');
    if (infoModal && infoModal.classList.contains('active')) {
      closeTrainingInfoModal();
      return;
    }
    if (shapeModal && shapeModal.classList.contains('active')) {
      closeShapeIndexSelector();
      return;
    }
    if (selectorModal && selectorModal.style.display !== 'none') {
      closeSelectorModal();
      return;
    }
    const wasTimerRunning = timerRunning;
    if (isInspectionPhase || parityQuizPhase || timerRunning || isHolding || spacePressed) {
      resetTimerStateOnEscape(wasTimerRunning);
      return;
    }
    closeTrainingModal();
    return;
  }

  if (timerRunning && e.shiftKey) {
    e.preventDefault();
    return;
  }

  if (e.code === 'Space' && parityQuizPhase) {
    e.preventDefault();
    showToast('Choose the correct parity option first', 2000, 'info');
    return;
  }

  if (timerRunning) {
    e.preventDefault();
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') return;
    stopTimerOnly();
    goThroughConsume();
    displayNextScramble();
    spacePressed = false;
    return;
  }

  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    if (trainerEmpty) return;
    if (!spacePressed) {
      spacePressed = true;
      if (trainingEnableInspection && !isInspectionPhase && !parityQuizPhase) {
        if (trainingEnableParityQuiz) startParityQuizInspection();
        else startInspection();
        return;
      }
      beginHold();
    }
  }
}

function handleQuizKeyDown(e: KeyboardEvent): void {
  if (document.getElementById('evilnessQuizModal')) return;
  const leftKeys = new Set([
    'Tab',
    'Backquote',
    'Digit1',
    'Digit2',
    'Digit4',
    'Digit5',
    'Digit6',
    'KeyQ',
    'KeyW',
    'KeyE',
    'KeyR',
    'KeyT',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyF',
    'KeyG',
    'KeyZ',
    'KeyX',
    'KeyC',
    'KeyV',
  ]);
  const rightKeys = new Set([
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
    'Minus',
    'Equal',
    'KeyY',
    'KeyU',
    'KeyI',
    'KeyO',
    'KeyP',
    'BracketLeft',
    'BracketRight',
    'Backslash',
    'KeyJ',
    'KeyK',
    'KeyL',
    'Semicolon',
    'Quote',
    'KeyN',
    'KeyM',
    'Comma',
    'Period',
    'Slash',
    'Enter',
    'NumpadEnter',
  ]);

  const evilModal = document.getElementById('evilnessQuizModal');
  if (evilModal) {
    const niceBtn = document.getElementById('evilQuizNice') as HTMLButtonElement | null;
    const badBtn = document.getElementById('evilQuizEvil') as HTMLButtonElement | null;
    if (niceBtn && !niceBtn.disabled && leftKeys.has(e.code)) {
      e.preventDefault();
      niceBtn.click();
      return;
    }
    if (badBtn && !badBtn.disabled && rightKeys.has(e.code)) {
      e.preventDefault();
      badBtn.click();
      return;
    }
  }

  const parityModal = document.getElementById('parityQuizModal');
  if (parityModal) {
    const niceBtn = document.getElementById('parityQuizNice') as HTMLButtonElement | null;
    const badBtn = document.getElementById('parityQuizBad') as HTMLButtonElement | null;
    if (niceBtn && !niceBtn.disabled && leftKeys.has(e.code)) {
      e.preventDefault();
      niceBtn.click();
      return;
    }
    if (badBtn && !badBtn.disabled && rightKeys.has(e.code)) {
      e.preventDefault();
      badBtn.click();
      return;
    }
  }
}

function handleTrainingKeyUp(e: KeyboardEvent): void {
  if (document.getElementById('evilnessQuizModal')) return;
  const modal = document.getElementById('trainingModal');
  if (!modal || !modal.classList.contains('active')) return;

  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    const shouldStopTimer = shiftKeyTimerWasRunning && !shiftShortcutTriggered;
    shiftKeyTimerWasRunning = false;
    shiftShortcutTriggered = false;
    if (shouldStopTimer && timerRunning) {
      e.preventDefault();
      stopTimerOnly();
      goThroughConsume();
      displayNextScramble();
      spacePressed = false;
    }
    return;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    if (timerRunning) {
      stopTimerOnly();
      goThroughConsume();
      displayNextScramble();
    } else {
      nextScrambleManual();
    }
    return;
  }

  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    if (timerRunning) {
      stopTimerOnly();
      goThroughConsume();
      displayNextScramble();
    } else {
      previousScramble();
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    spacePressed = false;
    const timerEl = document.getElementById('trainingTimer')!;
    if (isInspectionPhase && !parityQuizPhase && isHolding && isHoldReady) {
      isHolding = false;
      isHoldReady = false;
      timerEl.style.color = 'var(--text-ui)';
      stopInspectionAndStartTimer();
      return;
    }
    if (isInspectionPhase && !parityQuizPhase && isHolding) {
      isHolding = false;
      isHoldReady = false;
      timerEl.style.color = 'var(--accent)';
      return;
    }
    if (!isInspectionPhase && isHolding && isHoldReady) {
      isHolding = false;
      isHoldReady = false;
      timerEl.style.color = 'var(--text-ui)';
      startTimer();
      return;
    }
    if (isHolding) {
      isHolding = false;
      isHoldReady = false;
      timerEl.style.color = 'var(--text-ui)';
    }
  }
}

// ── Settings / info modals ───────────────────────────────────────────────────
function openTrainingSettingsModal(): void {
  (window as unknown as { openUnifiedSettings: (tab: string) => void }).openUnifiedSettings(
    'trainer',
  );
}

function openTrainingInfoModal(): void {
  pushModalState('trainingInfoModal', closeTrainingInfoModal);

  let infoModal = document.getElementById('trainingInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'trainingInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">Training Guides</span>
                    <button class="training-info-close" onclick="closeTrainingInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text">Press on the top left corner to <b>select cases to train</b>, or to select a particular <b>angle</b> for one case <i>(for case-wise training)</i>.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text">Use the <b>&lt; / &gt;</b> buttons or <b>← / →</b> keys to navigate scrambles; moving past the latest generates a new one.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text">Check settings for a bunch of customizability.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">4</div>
                        <div class="training-info-text">The <b>out-of-cubeshape</b> part of the scramble is colored. <span style="color: var(--double-align-color); font-weight: 600;">Blue</span> means the scramble goes out of CS from (0,0) alignment, <span style="color: var(--double-misalign-color); font-weight: 600;">red</span> means it goes out at (1,-1) alignment.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">5</div>
                        <div class="training-info-text">To use the Parity Tracer for the <b>current scramble</b>, directly <b>click</b> on the scramble.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">6</div>
                        <div class="training-info-text">Enable <b>inspection</b> and then enable <b>Parity quiz during inspection</b> to activate the <b>parity quiz</b> feature in inspection.</div>
                    </div>
                    <h3>Parity Quiz guide:</h3></br>
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text">If your evilness is turned <b>off</b>, the app will ask you if the scramble is <b>even</b> or <b>odd</b> parity.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text">If your evilness is turned <b>on</b>, the app will ask you if the scramble requires <b>good alg</b> or <b>bad alg</b> (I believe you already know what those are).</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text">Click on the left side of the screen, or <b>any left side key</b> (ie. QWERASDFZXCV1234 etc) on your keyboard to answer <b>Even / Good Alg</b>. Do the opposite to answer <b>Odd / Bad alg</b></div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">4</div>
                        <div class="training-info-text">Time your time to trace parity, and the time to plan the algorithm for better grasp over a case.</div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }

  infoModal.classList.add('active');
}

function closeTrainingInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('trainingInfoModal');
    if (modal) modal.classList.remove('active');
  });
}

// ── Quiz shared helpers ──────────────────────────────────────────────────────
function quizGetParityFromHex(hexCode: string): 'Odd' | 'Even' | 'Error' | null {
  try {
    const state = parseHexFormat(hexCode);
    const notation = scrambleFromState(state);
    if (!notation) return null;
    return getParityText(notation, colorScheme, cornerStickerMode);
  } catch {
    return null;
  }
}

function readSelectedCaseIds(key: string): number[] | null {
  try {
    const field = key === 'sq1-selector-evilness'
      ? 'selectedEvilness'
      : key === 'sq1-selector-parity'
        ? 'selectedParityQuiz'
        : 'selectedMulti';
    const value: unknown = readCspObject(CSP_TRAINING_KEY)[field];
    if (!Array.isArray(value)) return null;
    const caseIds = value.map(getCaseId).filter((id): id is number => id !== undefined);
    updateCspObject(CSP_TRAINING_KEY, { [field]: caseIds });
    return caseIds;
  } catch {
    return null;
  }
}

// ── 1. EVILNESS QUIZ ─────────────────────────────────────────────────────────
function openEvilnessQuiz(): void {
  startEvilnessQuiz(resolveInitialSelection('sq1-selector-evilness'));
}

function startEvilnessQuiz(chosenCaseNames: number[]): void {
  let evilCaseNames = chosenCaseNames.filter((cn) => CSPData.hasCase(cn));
  if (evilCaseNames.length === 0) return;

  let evilRemaining: number[] = [];
  function resetEvilRemaining(): void {
    evilRemaining = [...evilCaseNames];
    for (let i = evilRemaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [evilRemaining[i], evilRemaining[j]] = [evilRemaining[j], evilRemaining[i]];
    }
  }
  resetEvilRemaining();

  function pickEvilItem(): { idx: number; caseName: number } | null {
    if (evilCaseNames.length === 0) return null;
    let caseName: number | undefined;
    if (isGoThroughEnabled('sq1-selector-evilness')) {
      if (evilRemaining.length === 0) {
        if (evilCaseNames.length > 1) showToast('Gone through each case!', 3000, 'success');
        resetEvilRemaining();
      }
      caseName = evilRemaining.shift();
    } else {
      caseName = evilCaseNames[Math.floor(Math.random() * evilCaseNames.length)];
    }
    if (!caseName) return null;
    const entry = CSPData.getShapeEntry(caseName);
    if (!entry) return null;
    const idxs = [...(entry.org || []), ...(entry.mir || [])];
    if (idxs.length === 0) return null;
    return { idx: idxs[Math.floor(Math.random() * idxs.length)], caseName };
  }

  const quizLog: {
    caseName: number;
    wasEvil: boolean;
    correct: boolean;
    timeMs: number;
  }[] = [];
  let quizStartTime = 0;
  let currentItem: { idx: number; caseName: number } | null = null;
  let timerInt: ReturnType<typeof setInterval> | null = null;
  let quizRunning = false;
  let sidebarOpen = false;
  let currentHexCode: string | null = null;

  const modal = document.createElement('div');
  modal.id = 'evilnessQuizModal';
  modal.className = 'training-modal active';
  modal.innerHTML = `
        <div class="training-modal-header">
            <div style="display:flex;gap:10px;align-items:center;">
                <button class="training-modal-title" id="evilQuizCaseCount" style="background:none;border:none;cursor:pointer;padding:0;font:inherit;text-align:left;color:var(--link-color);text-decoration:underline;" title="Select cases">${chosenCaseNames.length} cases selected</button>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <button class="training-modal-refresh" id="evilQuizPrevBtn" title="Previous" style="display:none;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button class="training-modal-refresh" id="evilQuizNextBtn" title="Next" disabled>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>
                </button>
                <button class="training-modal-refresh" id="evilQuizSettingsBtn" title="Settings">
                    <span class="themed-icon themed-icon--training-settings" aria-hidden="true"></span>
                </button>
                <button class="training-modal-close" id="evilQuizClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="training-modal-timer-zone" id="evilQuizTimerZone" style="position:relative;flex-direction:column;gap:1rem;justify-content:center;align-items:center;cursor:default;">
            <div class="training-modal-image-container">
                <div class="training-modal-image" id="evilQuizImage"></div>
            </div>
            <div class="training-modal-timer" id="evilQuizTimer">0.000</div>
            <div id="evilQuizStartOverlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:var(--surface);display:flex;align-items:flex-start;justify-content:center;z-index:50;border-radius:inherit;padding-top:2rem;box-sizing:border-box;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:1.2rem;max-width:320px;text-align:center;padding:1.5rem;">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-ui);">Evilness Quiz</div>
                    <div style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;">
                        You'll be shown an image of a scramble. Decide if the CS is a <span style="color:var(--nice-case);font-weight:700;">nice</span> case or a <span style="color:var(--evil-case);font-weight:700;">evil</span> case.<br><br>
                        Press the <strong>left half</strong> of the screen (or left-side keys) for nice, and the <strong>right half</strong> (or right-side keys) for evil.
                    </div>
                    <button id="evilQuizStartBtn" style="padding:0.9rem 2.2rem;background:var(--accent);color:var(--text-on-color);border:none;border-radius:12px;font-size:1.1rem;font-weight:700;cursor:pointer;">Start</button>
                </div>
            </div>
        </div>
        <div id="evilQuizSidebar" style="display:none;position:fixed;top:0;right:0;width:260px;height:100%;background:var(--surface);border-left:1px solid var(--border-color);z-index:10001;overflow-y:auto;flex-direction:column;">
            <div style="padding:14px 16px;font-weight:700;color:var(--text-ui);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <span>Case Log</span>
                <button id="evilQuizSidebarClose" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted);line-height:1;">&times;</button>
            </div>
            <div id="evilQuizMedian" style="padding:10px 12px;font-size:0.85rem;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);"></div>
            <div id="evilQuizLogList" style="padding:10px 12px;font-size:0.82rem;color:var(--text-ui);display:flex;flex-direction:column;gap:6px;"></div>
        </div>
    `;

  const closeQuiz = () => {
    closeModalWithHistory(() => {
      if (timerInt) clearInterval(timerInt);
      const sm = document.getElementById('evilQuizSettingsModal');
      if (sm) sm.remove();
      modal.remove();
      document.body.classList.remove('modal-open');
      evilQuizOnSelectionChange = null;
    });
  };

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  pushModalState('evilnessQuizModal', closeQuiz);

  evilQuizOnSelectionChange = function (selectedArray) {
    evilCaseNames = (selectedArray || []).filter((cn) => CSPData.hasCase(cn));
    resetEvilRemaining();
    const countEl = document.getElementById('evilQuizCaseCount');
    if (countEl) countEl.textContent = `${evilCaseNames.length} cases selected`;
    updateEvilStartState();
    if (evilCaseNames.length === 0 && quizRunning) stopEvilQuiz();
  };

  function openEvilQuizSettings(): void {
    (window as unknown as { openUnifiedSettings: (tab: string) => void }).openUnifiedSettings(
      'trainer',
    );
  }

  function evilQuizUpdateImageSize(size: number): void {
    if (currentHexCode) {
      try {
        const state = parseHexFormat(currentHexCode);
        const notation = scrambleFromState(state);
        const imgEl = document.getElementById('evilQuizImage');
        if (imgEl && notation)
          imgEl.innerHTML = visualizeFromScramble(
            notation,
            getEffectiveImageSize(size),
            colorScheme,
            TRAINING_SCRAMBLE_RING_DISTANCE,
          );
      } catch {
        // keep current image
      }
    }
  }
  (window as unknown as Record<string, unknown>)._evilQuizUpdateImageSize = evilQuizUpdateImageSize;

  function renderSidebar(): void {
    const list = document.getElementById('evilQuizLogList');
    if (!list) return;
    const median = document.getElementById('evilQuizMedian');
    if (median) median.textContent = formatMedianTime(quizLog.map((entry) => entry.timeMs));
    if (quizLog.length === 0) {
      list.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">No answers yet.</span>';
      return;
    }
    list.innerHTML = [...quizLog]
      .reverse()
      .map((entry) => {
        const icon = entry.correct ? '✓' : '✗';
        const color = entry.correct ? 'var(--nice-case)' : '#cc0000';
        const timeStr = (entry.timeMs / 1000).toFixed(3) + 's';
        const evilStr = entry.wasEvil ? 'Evil' : 'Nice';
        return `<div style="padding:6px 8px;border-radius:6px;background:${entry.correct ? 'var(--card-learned-bg)' : 'var(--toast-error-bg)'};border:1px solid ${entry.correct ? 'var(--card-learned-border)' : 'var(--evil-case)'};">
                <span style="color:${color};font-weight:700;">${icon}</span>
                <span style="font-weight:600;margin-left:4px;">${getDisplayName(entry.caseName)}</span>
                <span style="color:var(--text-muted);margin-left:4px;">(${evilStr})</span>
                <span style="float:right;color:var(--text-muted)">${timeStr}</span>
            </div>`;
      })
      .join('');
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
    const sb = document.getElementById('evilQuizSidebar');
    if (sb) {
      sb.style.display = sidebarOpen ? 'flex' : 'none';
      renderSidebar();
    }
  }

  function nextQuestion(): void {
    if (!quizRunning) return;
    if (timerInt) clearInterval(timerInt);
    const picked = pickEvilItem();
    if (!picked) return;
    currentItem = picked;

    currentHexCode = shapeIndexToHex(currentItem.idx);
    let imgHTML = '';
    try {
      const state = parseHexFormat(currentHexCode);
      const notation = scrambleFromState(state);
      imgHTML = notation
        ? visualizeFromScramble(notation, getEffectiveImageSize(), colorScheme, TRAINING_SCRAMBLE_RING_DISTANCE)
        : '<div style="color:var(--text-muted);padding:1rem;">Image unavailable</div>';
    } catch {
      imgHTML = '<div style="color:var(--text-muted);padding:1rem;">Image unavailable</div>';
    }

    document.getElementById('evilQuizImage')!.innerHTML = imgHTML;
    document.getElementById('evilQuizTimer')!.textContent = '0.000';

    const existing = document.getElementById('evilQuizAnswerOverlay');
    if (existing) existing.remove();

    const timerZone = document.getElementById('evilQuizTimerZone')!;
    const overlay = document.createElement('div');
    overlay.id = 'evilQuizAnswerOverlay';
    overlay.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:row;z-index:100;border-radius:inherit;overflow:hidden;`;
    overlay.innerHTML = `
            <button id="evilQuizNice" style="flex:1;border:none;cursor:pointer;background:rgba(45,106,45,0.10);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:var(--nice-case);letter-spacing:0.06em;transition:background 0.15s;">NICE</button>
            <div style="width:1px;background:rgba(0,0,0,0.07);flex-shrink:0;"></div>
            <button id="evilQuizEvil" style="flex:1;border:none;cursor:pointer;background:rgba(139,0,0,0.10);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:var(--evil-case);letter-spacing:0.06em;transition:background 0.15s;">EVIL</button>
        `;
    timerZone.appendChild(overlay);

    const mq = window.matchMedia('(max-width:500px)');
    const applyLayout = (narrow: boolean) => {
      overlay.style.flexDirection = narrow ? 'column' : 'row';
      const div = overlay.querySelector('div');
      if (div) {
        (div as HTMLElement).style.width = narrow ? '100%' : '1px';
        (div as HTMLElement).style.height = narrow ? '1px' : '100%';
      }
    };
    applyLayout(mq.matches);
    mq.addEventListener('change', (e) => applyLayout(e.matches));

    quizStartTime = Date.now();
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
      document.getElementById('evilQuizTimer')!.textContent = (
        (Date.now() - quizStartTime) / 1000
      ).toFixed(3);
    }, 10);

    document.getElementById('evilQuizNice')!.addEventListener('click', () => handleAnswer(false));
    document.getElementById('evilQuizEvil')!.addEventListener('click', () => handleAnswer(true));
  }

  function handleAnswer(userSaidEvil: boolean): void {
    if (timerInt) clearInterval(timerInt);
    const elapsed = Date.now() - quizStartTime;
    const isEvil = currentItem ? isCaseEvil(currentItem.caseName) : false;
    const correct = userSaidEvil === isEvil;
    if (currentItem) {
      quizLog.push({ caseName: currentItem.caseName, wasEvil: isEvil, correct, timeMs: elapsed });
    }
    if (sidebarOpen) renderSidebar();

    if (correct) {
      nextQuestion();
    } else {
      const wrongBtn = (userSaidEvil
        ? document.getElementById('evilQuizEvil')
        : document.getElementById('evilQuizNice')) as HTMLButtonElement | null;
      if (wrongBtn) {
        wrongBtn.style.background = 'rgba(200,0,0,0.22)';
        wrongBtn.style.color = 'rgba(180,0,0,0.9)';
        wrongBtn.disabled = true;
        const otherBtn = (userSaidEvil
          ? document.getElementById('evilQuizNice')
          : document.getElementById('evilQuizEvil')) as HTMLButtonElement | null;
        if (otherBtn) otherBtn.disabled = true;
      }
      setTimeout(nextQuestion, 600);
    }
  }

  document.getElementById('evilQuizClose')!.addEventListener('click', closeQuiz);
  document.getElementById('evilQuizNextBtn')!.addEventListener('click', () => {
    if (quizRunning) nextQuestion();
  });
  document.getElementById('evilQuizCaseCount')!.addEventListener('click', () => {
    openSelectorModal('sq1-selector-evilness');
  });
  document.getElementById('evilQuizSettingsBtn')!.addEventListener('click', openEvilQuizSettings);
  document.getElementById('evilQuizSidebarClose')!.addEventListener('click', () => {
    sidebarOpen = false;
    document.getElementById('evilQuizSidebar')!.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (sidebarOpen && !document.getElementById('evilQuizSidebar')!.contains(e.target as Node)) {
      sidebarOpen = false;
      document.getElementById('evilQuizSidebar')!.style.display = 'none';
    }
  });

  const hamburgerBtn = document.createElement('button');
  hamburgerBtn.className = 'training-modal-refresh';
  hamburgerBtn.title = 'Case log';
  hamburgerBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });
  const rightDiv = modal.querySelector('.training-modal-header > div:last-child')!;
  rightDiv.insertBefore(hamburgerBtn, rightDiv.firstChild);

  function handleEvilKeyDown(e: KeyboardEvent): void {
    if (!document.getElementById('evilnessQuizModal')) {
      document.removeEventListener('keydown', handleEvilKeyDown);
      return;
    }

    const leftKeys = new Set([
      'Tab',
      'Backquote',
      'Digit1',
      'Digit2',
      'Digit4',
      'Digit5',
      'Digit6',
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyR',
      'KeyT',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyF',
      'KeyG',
      'KeyZ',
      'KeyX',
      'KeyC',
      'KeyV',
    ]);
    const rightKeys = new Set([
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0',
      'Minus',
      'Equal',
      'KeyY',
      'KeyU',
      'KeyI',
      'KeyO',
      'KeyP',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'KeyJ',
      'KeyK',
      'KeyL',
      'Semicolon',
      'Quote',
      'KeyN',
      'KeyM',
      'Comma',
      'Period',
      'Slash',
      'Enter',
      'NumpadEnter',
    ]);

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (sidebarOpen) {
        sidebarOpen = false;
        const sidebar = document.getElementById('evilQuizSidebar');
        if (sidebar) sidebar.style.display = 'none';
        return;
      }
      if (quizRunning) {
        quizRunning = false;
        if (timerInt) clearInterval(timerInt);
        (document.getElementById('evilQuizNextBtn') as HTMLButtonElement).disabled = true;
        resetEvilRemaining();
        const existing = document.getElementById('evilQuizAnswerOverlay');
        if (existing) existing.remove();
        showEvilStartOverlay();
        return;
      }
      closeQuiz();
      document.removeEventListener('keydown', handleEvilKeyDown);
      return;
    }

    if (!quizRunning) return;
    const niceBtn = document.getElementById('evilQuizNice') as HTMLButtonElement | null;
    const evilBtn = document.getElementById('evilQuizEvil') as HTMLButtonElement | null;
    if (leftKeys.has(e.code) && niceBtn && !niceBtn.disabled) {
      e.preventDefault();
      niceBtn.click();
    } else if (rightKeys.has(e.code) && evilBtn && !evilBtn.disabled) {
      e.preventDefault();
      evilBtn.click();
    }
  }

  document.addEventListener('keydown', handleEvilKeyDown);

  document.getElementById('evilQuizStartBtn')!.addEventListener('click', () => {
    tryStartEvilQuiz(document.getElementById('evilQuizStartOverlay')!);
  });
  updateEvilStartState();

  function tryStartEvilQuiz(overlay: HTMLElement): void {
    if (evilCaseNames.length === 0) {
      showToast('Select a case to start training.', 2500, 'error');
      return;
    }
    overlay.remove();
    quizRunning = true;
    (document.getElementById('evilQuizNextBtn') as HTMLButtonElement).disabled = false;
    nextQuestion();
  }

  // Dimmed (not `disabled`) so clicking still shows the message.
  function updateEvilStartState(): void {
    const btn = document.getElementById('evilQuizStartBtn');
    if (!btn) return;
    const none = evilCaseNames.length === 0;
    btn.setAttribute('aria-disabled', String(none));
    btn.style.opacity = none ? '0.5' : '';
    btn.style.cursor = none ? 'not-allowed' : 'pointer';
  }

  function showEvilStartOverlay(): void {
    document.getElementById('evilQuizStartOverlay')?.remove();
    const startOverlay = document.createElement('div');
    startOverlay.id = 'evilQuizStartOverlay';
    startOverlay.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;background:var(--surface);display:flex;align-items:flex-start;justify-content:center;z-index:50;border-radius:inherit;padding-top:2rem;box-sizing:border-box;';
    startOverlay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:1.2rem;max-width:320px;text-align:center;padding:1.5rem;">
        <div style="font-size:1.1rem;font-weight:700;color:var(--text-ui);">Evilness Quiz</div>
        <div style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;">
            You'll be shown an image of a scramble. Decide if the CS is a <span style="color:var(--nice-case);font-weight:700;">nice</span> case or a <span style="color:var(--evil-case);font-weight:700;">evil</span> case.<br><br>
            Press the <strong>left half</strong> of the screen (or left-side keys) for nice, and the <strong>right half</strong> (or right-side keys) for evil.
        </div>
        <button id="evilQuizStartBtn" style="padding:0.9rem 2.2rem;background:var(--accent);color:var(--text-on-color);border:none;border-radius:12px;font-size:1.1rem;font-weight:700;cursor:pointer;">Start</button>
    </div>`;
    document.getElementById('evilQuizTimerZone')!.appendChild(startOverlay);
    document.getElementById('evilQuizStartBtn')!.addEventListener('click', () => {
      tryStartEvilQuiz(startOverlay);
    });
    updateEvilStartState();
  }

  // Return to the start screen (e.g. every case was deselected mid-quiz).
  function stopEvilQuiz(): void {
    quizRunning = false;
    if (timerInt) clearInterval(timerInt);
    (document.getElementById('evilQuizNextBtn') as HTMLButtonElement).disabled = true;
    document.getElementById('evilQuizAnswerOverlay')?.remove();
    showEvilStartOverlay();
  }
}

// ── 2. PARITY QUIZ ───────────────────────────────────────────────────────────
function openParityQuiz(): void {
  startParityQuiz(resolveInitialSelection('sq1-selector-parity'));
}

function startParityQuiz(chosenCaseNames: number[]): void {
  let allIndices: { idx: number; caseName: number }[] = [];
  function rebuildParityIndices(names: number[]): void {
    allIndices = [];
    (names || []).forEach((cn) => {
      const entry = CSPData.getShapeEntry(cn);
      if (entry) {
        (entry.org || []).forEach((idx) => allIndices.push({ idx, caseName: cn }));
        (entry.mir || []).forEach((idx) => allIndices.push({ idx, caseName: cn }));
      }
    });
  }
  rebuildParityIndices(chosenCaseNames);
  if (allIndices.length === 0) return;

  const quizLog: { caseName: number; parity: string | null; correct: boolean; timeMs: number }[] = [];
  let quizStartTime = 0;
  let currentItem: { idx: number; caseName: number } | null = null;
  let currentParity: string | null = null;
  let timerInt: ReturnType<typeof setInterval> | null = null;
  let questionCount = 0;
  let sidebarOpen = false;

  const modal = document.createElement('div');
  modal.id = 'parityQuizModal';
  modal.className = 'training-modal active';
  modal.innerHTML = `
        <div class="training-modal-header">
            <div style="display:flex;gap:10px;align-items:center;">
                <span class="training-modal-title">Parity Quiz</span>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <div id="parityQuizProgress" style="font-size:0.85rem;color:var(--text-muted)">Q1 | 0/0</div>
                <button class="training-modal-refresh" id="parityQuizLogToggle" title="Case log">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
                <button class="training-modal-refresh" id="parityQuizSelectCases" title="Select cases" style="width:auto;padding:0 12px;font-size:0.8rem;font-weight:600;">Cases</button>
                <button class="training-modal-close" id="parityQuizClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="training-modal-scramble" id="parityQuizScramble" style="cursor:default;"></div>
        <div class="training-modal-timer-zone" style="flex-direction:column;gap:1rem;justify-content:center;align-items:center;cursor:default;">
            <div class="training-modal-image-container">
                <div class="training-modal-image" id="parityQuizImage"></div>
            </div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--text-ui);">Which alg do you need?</div>
            <div style="display:flex;gap:1rem;justify-content:center;width:100%;max-width:320px;">
                <button id="parityQuizGood" style="flex:1;padding:0.9rem;background:var(--nice-case);color:var(--text-on-color);border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity 0.2s;">Good Alg</button>
                <button id="parityQuizBad" style="flex:1;padding:0.9rem;background:var(--evil-case);color:var(--text-on-color);border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity 0.2s;">Bad Alg</button>
            </div>
            <div id="parityQuizFeedback" style="min-height:26px;font-size:0.95rem;font-weight:600;color:var(--text-ui);"></div>
            <div class="training-modal-timer" id="parityQuizTimer">0.000</div>
        </div>
        <div id="parityQuizSidebar" style="display:none;position:fixed;top:0;right:0;width:260px;height:100%;background:var(--surface);border-left:1px solid var(--border-color);z-index:10001;overflow-y:auto;flex-direction:column;">
            <div style="padding:14px 16px;font-weight:700;color:var(--text-ui);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <span>Case Log</span>
                <button id="parityQuizSidebarClose" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted);line-height:1;">&times;</button>
            </div>
            <div id="parityQuizMedian" style="padding:10px 12px;font-size:0.85rem;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);"></div>
            <div id="parityQuizLogList" style="padding:10px 12px;font-size:0.82rem;color:var(--text-ui);display:flex;flex-direction:column;gap:6px;"></div>
        </div>
    `;

  const closeQuiz = () => {
    closeModalWithHistory(() => {
      if (timerInt) clearInterval(timerInt);
      modal.remove();
      document.body.classList.remove('modal-open');
      parityQuizOnSelectionChange = null;
    });
  };

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  pushModalState('parityQuizModal', closeQuiz);

  parityQuizOnSelectionChange = function (selectedArray) {
    rebuildParityIndices(selectedArray);
  };

  function renderSidebar(): void {
    const list = document.getElementById('parityQuizLogList');
    if (!list) return;
    const median = document.getElementById('parityQuizMedian');
    if (median) median.textContent = formatMedianTime(quizLog.map((entry) => entry.timeMs));
    if (quizLog.length === 0) {
      list.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">No answers yet.</span>';
      return;
    }
    list.innerHTML = [...quizLog]
      .reverse()
      .map((entry) => {
        const icon = entry.correct ? '✓' : '✗';
        const color = entry.correct ? 'var(--nice-case)' : '#cc0000';
        const timeStr = (entry.timeMs / 1000).toFixed(3) + 's';
        const parityStr = entry.parity ?? 'Unknown';
        return `<div style="padding:6px 8px;border-radius:6px;background:${entry.correct ? 'var(--card-learned-bg)' : 'var(--toast-error-bg)'};border:1px solid ${entry.correct ? 'var(--card-learned-border)' : 'var(--evil-case)'};">
                <span style="color:${color};font-weight:700;">${icon}</span>
                <span style="font-weight:600;margin-left:4px;">${getDisplayName(entry.caseName)}</span>
                <span style="color:var(--text-muted);margin-left:4px;">(${parityStr})</span>
                <span style="float:right;color:var(--text-muted)">${timeStr}</span>
            </div>`;
      })
      .join('');
  }

  function toggleSidebar(open = !sidebarOpen): void {
    sidebarOpen = open;
    const sidebar = document.getElementById('parityQuizSidebar');
    if (sidebar) {
      sidebar.style.display = sidebarOpen ? 'flex' : 'none';
      if (sidebarOpen) renderSidebar();
    }
  }

  document.getElementById('parityQuizLogToggle')!.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });
  document.getElementById('parityQuizSidebarClose')!.addEventListener('click', () => toggleSidebar(false));
  modal.addEventListener('click', (e) => {
    const sidebar = document.getElementById('parityQuizSidebar');
    if (sidebarOpen && sidebar && !sidebar.contains(e.target as Node)) toggleSidebar(false);
  });

  function nextQuestion(): void {
    if (!currentItem || allIndices.length > 0) {
      currentItem = allIndices[Math.floor(Math.random() * allIndices.length)];
    }
    questionCount++;

    const hexCode = shapeIndexToHex(currentItem.idx);
    let scrambleText = '';
    let imgHTML = '';

    try {
      const state = parseHexFormat(hexCode);
      const notation = scrambleFromState(state);
      scrambleText = notation || hexCode;
      imgHTML = notation
        ? visualizeFromScramble(notation, getEffectiveImageSize(), colorScheme, TRAINING_SCRAMBLE_RING_DISTANCE)
        : '<div style="color:var(--text-muted);padding:1rem;">Image unavailable</div>';
      currentParity = quizGetParityFromHex(hexCode);
    } catch {
      currentParity = null;
      imgHTML = '<div style="color:var(--text-muted);padding:1rem;">Image unavailable</div>';
    }

    document.getElementById('parityQuizScramble')!.textContent = scrambleText;
    document.getElementById('parityQuizImage')!.innerHTML = imgHTML;
    const score = quizLog.filter((l) => l.correct).length;
    document.getElementById('parityQuizProgress')!.textContent = `Q${questionCount} | ${score}/${quizLog.length}`;
    document.getElementById('parityQuizFeedback')!.textContent = '';
    document.getElementById('parityQuizTimer')!.textContent = '0.000';
    (document.getElementById('parityQuizGood') as HTMLButtonElement).disabled = false;
    (document.getElementById('parityQuizBad') as HTMLButtonElement).disabled = false;

    quizStartTime = Date.now();
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
      document.getElementById('parityQuizTimer')!.textContent = (
        (Date.now() - quizStartTime) / 1000
      ).toFixed(3);
    }, 10);
  }

  function handleAnswer(userSaidGood: boolean): void {
    if (timerInt) clearInterval(timerInt);
    const elapsed = Date.now() - quizStartTime;
    (document.getElementById('parityQuizGood') as HTMLButtonElement).disabled = true;
    (document.getElementById('parityQuizBad') as HTMLButtonElement).disabled = true;

    const correctIsGood = currentParity === 'Even';
    const correct = userSaidGood === correctIsGood;
    if (currentItem) {
      quizLog.push({
        caseName: currentItem.caseName,
        parity: currentParity,
        correct,
        timeMs: elapsed,
      });
    }
    if (sidebarOpen) renderSidebar();

    const fb = document.getElementById('parityQuizFeedback')!;
    fb.textContent = correct
      ? 'Correct!'
      : `Wrong — parity is ${currentParity}, need the ${correctIsGood ? 'Good' : 'Bad'} alg.`;
    fb.style.color = correct ? 'var(--nice-case)' : 'var(--evil-case)';

    setTimeout(nextQuestion, 1400);
  }

  document.getElementById('parityQuizGood')!.addEventListener('click', () => handleAnswer(true));
  document.getElementById('parityQuizBad')!.addEventListener('click', () => handleAnswer(false));
  document.getElementById('parityQuizClose')!.addEventListener('click', closeQuiz);
  document.getElementById('parityQuizSelectCases')!.addEventListener('click', () => {
    openSelectorModal('sq1-selector-parity');
  });

  nextQuestion();
}

// ── 3. THREE-COLOR RECOGNITION PRACTICE ──────────────────────────────────────
function openColorRecognitionPractice(): void {
  startColorRecognitionPractice();
}

function startColorRecognitionPractice(): void {
  const faceColors = {
    F: colorScheme.frontColor,
    R: colorScheme.rightColor,
    B: colorScheme.backColor,
    L: colorScheme.leftColor,
  };
  const faceCodenames = { F: 'R', R: 'G', B: 'O', L: 'B' };
  const opposites: Record<string, string> = { R: 'O', O: 'R', G: 'B', B: 'G' };

  function calcTrioParity(codes: string[]): number | null {
    const trio = codes.slice(0, 3);
    let aloneIdx = -1;
    for (let i = 0; i < 3; i++) {
      const opp = opposites[trio[i]];
      if (!trio.some((c, j) => j !== i && c === opp)) {
        aloneIdx = i;
        break;
      }
    }
    if (aloneIdx === -1) return null;
    let pair: string;
    if (aloneIdx === 0) pair = trio[0] + trio[1];
    else if (aloneIdx === 2) pair = trio[0] + trio[2];
    else pair = trio[1] + trio[2];
    if (['RG', 'GR', 'OB', 'BO'].includes(pair)) return 1;
    if (['RB', 'BR', 'OG', 'GO'].includes(pair)) return 0;
    return null;
  }

  function getFaceEmoji(face: keyof typeof faceColors): string {
    const col = faceColors[face];
    const r = parseInt(col.substr(1, 2), 16);
    const g = parseInt(col.substr(3, 2), 16);
    const b = parseInt(col.substr(5, 2), 16);
    if (r > 150 && g < 100 && b < 100) return '🟥';
    if (r > 150 && g > 100 && b < 80) return '🟧';
    if (r > 150 && g > 150 && b < 80) return '🟨';
    if (r < 100 && g > 130 && b < 100) return '🟩';
    if (r < 100 && g < 100 && b > 130) return '🟦';
    return '⬜';
  }

  function trioEmoji(trio: (keyof typeof faceColors)[]): string {
    return trio.map((f) => getFaceEmoji(f)).join('');
  }

  const faceKeys: (keyof typeof faceColors)[] = ['F', 'R', 'B', 'L'];

  function permute(arr: (keyof typeof faceColors)[]): (keyof typeof faceColors)[][] {
    if (arr.length <= 1) return [arr];
    const res: (keyof typeof faceColors)[][] = [];
    for (let i = 0; i < arr.length; i++) {
      permute([...arr.slice(0, i), ...arr.slice(i + 1)]).forEach((p) => res.push([arr[i], ...p]));
    }
    return res;
  }
  const faceComboTrios: (keyof typeof faceColors)[][] = [];
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      for (let k = j + 1; k < 4; k++)
        faceComboTrios.push([faceKeys[i], faceKeys[j], faceKeys[k]]);
  const allOrdered: (keyof typeof faceColors)[][] = [];
  faceComboTrios.forEach((trio) => permute(trio).forEach((p) => allOrdered.push(p)));

  function sharesTwo(a: (keyof typeof faceColors)[], b: (keyof typeof faceColors)[]): boolean {
    if (new Set([...a]).size === new Set([...a, ...b]).size && a.length === b.length) {
      const sa = new Set(a);
      const sb = new Set(b);
      if ([...sa].every((x) => sb.has(x))) return true;
    }
    let samePos = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) samePos++;
    }
    return samePos >= 2;
  }
  function shufflePacket(prev: (keyof typeof faceColors)[][] | null): (keyof typeof faceColors)[][] {
    const arr = [...allOrdered];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const firstForbidden = prev ? prev[prev.length - 1] : null;
    if (firstForbidden && sharesTwo(firstForbidden, arr[0])) {
      for (let i = 1; i < arr.length; i++) {
        if (!sharesTwo(firstForbidden, arr[i])) {
          [arr[0], arr[i]] = [arr[i], arr[0]];
          break;
        }
      }
    }
    for (let i = 1; i < arr.length; i++) {
      if (sharesTwo(arr[i - 1], arr[i])) {
        let swapped = false;
        for (let j = i + 1; j < arr.length; j++) {
          if (!sharesTwo(arr[i - 1], arr[j]) && (i + 1 >= arr.length || !sharesTwo(arr[j], arr[i + 1]))) {
            [arr[i], arr[j]] = [arr[j], arr[i]];
            swapped = true;
            break;
          }
        }
        if (!swapped)
          for (let j = i + 1; j < arr.length; j++) {
            if (!sharesTwo(arr[i - 1], arr[j])) {
              [arr[i], arr[j]] = [arr[j], arr[i]];
              break;
            }
          }
      }
    }
    return arr;
  }

  const packetHistory: (keyof typeof faceColors)[][][] = [];
  const queue: (keyof typeof faceColors)[][] = [];
  function refillQueue(): void {
    const prev = packetHistory.length > 0 ? packetHistory[packetHistory.length - 1] : null;
    const packet = shufflePacket(prev);
    packetHistory.push(packet);
    queue.push(...packet);
  }
  refillQueue();

  let questionCount = 0;
  const quizLog: {
    trio: string;
    emoji: string;
    correctIsEven: boolean;
    correct: boolean;
    timeMs: number;
  }[] = [];
  let currentTrio: (keyof typeof faceColors)[] | null = null;
  let currentParityVal: number | null = null;
  let quizStartTime = 0;
  let timerInt: ReturnType<typeof setInterval> | null = null;
  let nextQuestionTimeout: ReturnType<typeof setTimeout> | null = null;
  let quizRunning = false;
  let sidebarOpen = false;

  const modal = document.createElement('div');
  modal.id = 'colorRecogModal';
  modal.className = 'training-modal active';
  modal.innerHTML = `
        <div class="training-modal-header">
            <div style="display:flex;gap:10px;align-items:center;">
                <span class="training-modal-title">Parity Quiz</span>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
                <div id="colorRecogProgress" style="font-size:0.85rem;color:var(--text-muted)">Q1 | 0/0</div>
                <button class="training-modal-refresh" id="colorRecogHamburger" title="Answer log">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
                <button class="training-modal-close" id="colorRecogClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="training-modal-timer-zone" id="colorRecogTimerZone" style="position:relative;flex-direction:column;gap:1rem;justify-content:center;align-items:center;cursor:default;">
            <div id="colorRecogTrio" style="position:relative;z-index:101;pointer-events:none;display:flex;justify-content:center;gap:1rem;"></div>
            <div class="training-modal-timer" id="colorRecogTimer">0.000</div>
            <div id="colorRecogStartOverlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:var(--surface);display:flex;align-items:flex-start;justify-content:center;z-index:50;border-radius:inherit;padding-top:2rem;box-sizing:border-box;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:1.2rem;max-width:320px;text-align:center;padding:1.5rem;">
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-ui);">Parity Quiz</div>
                    <div style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;">
                        You'll see three colors. Based on their colors, determine whether the parity is <span style="color:var(--nice-case);font-weight:700;">Even</span> or <span style="color:var(--evil-case);font-weight:700;">Odd</span>.<br><br>
                        Press the <strong>left half</strong> of the screen (or left-side keys) for Even, and the <strong>right half</strong> (or right-side keys) for Odd.
                    </div>
                    <button id="colorRecogStartBtn" style="padding:0.9rem 2.2rem;background:var(--accent);color:var(--text-on-color);border:none;border-radius:12px;font-size:1.1rem;font-weight:700;cursor:pointer;">Start</button>
                </div>
            </div>
        </div>
        <div id="colorRecogSidebar" style="display:none;position:fixed;top:0;right:0;width:260px;height:100%;background:var(--surface);border-left:1px solid var(--border-color);z-index:10001;overflow-y:auto;flex-direction:column;">
            <div style="padding:14px 16px;font-weight:700;color:var(--text-ui);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <span>Answer Log</span>
                <button id="colorRecogSidebarClose" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--text-muted);line-height:1;">&times;</button>
            </div>
            <div id="colorRecogLogList" style="padding:10px 12px;font-size:0.82rem;color:var(--text-ui);display:flex;flex-direction:column;gap:6px;"></div>
        </div>
    `;

  const closeQuiz = () => {
    closeModalWithHistory(() => {
      if (timerInt) clearInterval(timerInt);
      if (nextQuestionTimeout) clearTimeout(nextQuestionTimeout);
      document.removeEventListener('keydown', handleColorKeyDown);
      document.getElementById('colorRecogTrio')!.replaceChildren();
      modal.remove();
      document.body.classList.remove('modal-open');
    });
  };

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  pushModalState('colorRecogModal', closeQuiz);

  function renderTrio(trio: (keyof typeof faceColors)[]): string {
    return trio
      .map((face) => {
        const col = faceColors[face];
        return `<div style="width:90px;height:90px;border-radius:14px;background:${col};box-shadow:0 2px 10px rgba(0,0,0,0.2);"></div>`;
      })
      .join('');
  }

  function renderSidebar(): void {
    const list = document.getElementById('colorRecogLogList');
    if (!list) return;
    if (quizLog.length === 0) {
      list.innerHTML = '<span style="color:var(--text-muted);font-style:italic;">No answers yet.</span>';
      return;
    }
    list.innerHTML = [...quizLog]
      .reverse()
      .map((entry) => {
        const icon = entry.correct ? '✓' : '✗';
        const color = entry.correct ? 'var(--nice-case)' : '#cc0000';
        const timeStr = (entry.timeMs / 1000).toFixed(3) + 's';
        const answerStr = entry.correctIsEven ? 'Even' : 'Odd';
        return `<div style="padding:6px 8px;border-radius:6px;background:${entry.correct ? 'var(--card-learned-bg)' : 'var(--toast-error-bg)'};border:1px solid ${entry.correct ? 'var(--card-learned-border)' : 'var(--evil-case)'};">
                <span style="color:${color};font-weight:700;">${icon}</span>
                <span style="font-size:1.1em;margin-left:4px;">${entry.emoji}</span>
                <span style="color:#888;font-size:0.78rem;margin-left:4px;">${answerStr}</span>
                <span style="float:right;color:var(--text-muted)">${timeStr}</span>
            </div>`;
      })
      .join('');
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
    const sb = document.getElementById('colorRecogSidebar');
    if (sb) {
      sb.style.display = sidebarOpen ? 'flex' : 'none';
      renderSidebar();
    }
  }

  function removeAnswerOverlay(): void {
    const ex = document.getElementById('colorRecogAnswerOverlay');
    if (ex) ex.remove();
  }

  function nextQuestion(): void {
    if (!quizRunning) return;
    if (nextQuestionTimeout) {
      clearTimeout(nextQuestionTimeout);
      nextQuestionTimeout = null;
    }
    if (timerInt) clearInterval(timerInt);
    removeAnswerOverlay();

    if (queue.length === 0) refillQueue();
    currentTrio = queue.shift() || null;
    if (!currentTrio) return;
    currentParityVal = calcTrioParity(currentTrio.map((f) => faceCodenames[f]));
    questionCount++;

    const score = quizLog.filter((l) => l.correct).length;
    document.getElementById('colorRecogTrio')!.innerHTML = renderTrio(currentTrio);
    document.getElementById('colorRecogProgress')!.textContent = `Q${questionCount} | ${score}/${quizLog.length}`;
    document.getElementById('colorRecogTimer')!.textContent = '0.000';

    const timerZone = document.getElementById('colorRecogTimerZone')!;
    const overlay = document.createElement('div');
    overlay.id = 'colorRecogAnswerOverlay';
    overlay.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:row;z-index:100;border-radius:inherit;overflow:hidden;`;
    overlay.innerHTML = `
            <button id="colorRecogEven" style="flex:1;border:none;cursor:pointer;background:rgba(45,106,45,0.10);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:rgba(45,106,45,0.85);letter-spacing:0.06em;transition:background 0.15s;">EVEN</button>
            <div style="width:1px;background:rgba(0,0,0,0.07);flex-shrink:0;"></div>
            <button id="colorRecogOdd" style="flex:1;border:none;cursor:pointer;background:rgba(139,0,0,0.10);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:rgba(139,0,0,0.85);letter-spacing:0.06em;transition:background 0.15s;">ODD</button>
        `;
    timerZone.appendChild(overlay);

    const mq = window.matchMedia('(max-width:500px)');
    const applyLayout = (narrow: boolean) => {
      overlay.style.flexDirection = narrow ? 'column' : 'row';
      const div = overlay.querySelector('div');
      if (div) {
        (div as HTMLElement).style.width = narrow ? '100%' : '1px';
        (div as HTMLElement).style.height = narrow ? '1px' : '100%';
      }
    };
    applyLayout(mq.matches);
    mq.addEventListener('change', (e) => applyLayout(e.matches));

    quizStartTime = Date.now();
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
      document.getElementById('colorRecogTimer')!.textContent = (
        (Date.now() - quizStartTime) / 1000
      ).toFixed(3);
    }, 10);

    document.getElementById('colorRecogEven')!.addEventListener('click', () => handleAnswer(true));
    document.getElementById('colorRecogOdd')!.addEventListener('click', () => handleAnswer(false));
  }

  function handleAnswer(userSaidEven: boolean): void {
    if (timerInt) clearInterval(timerInt);
    const elapsed = Date.now() - quizStartTime;
    const correctIsEven = currentParityVal === 0;
    const correct = userSaidEven === correctIsEven;
    if (currentTrio) {
      quizLog.push({
        trio: currentTrio.join('/'),
        emoji: trioEmoji(currentTrio),
        correctIsEven,
        correct,
        timeMs: elapsed,
      });
    }
    if (sidebarOpen) renderSidebar();

    if (correct) {
      nextQuestion();
    } else {
      const wrongBtn = (userSaidEven
        ? document.getElementById('colorRecogEven')
        : document.getElementById('colorRecogOdd')) as HTMLButtonElement | null;
      if (wrongBtn) {
        wrongBtn.style.background = 'rgba(200,0,0,0.22)';
        wrongBtn.style.color = 'rgba(180,0,0,0.9)';
        wrongBtn.disabled = true;
        const otherBtn = (userSaidEven
          ? document.getElementById('colorRecogOdd')
          : document.getElementById('colorRecogEven')) as HTMLButtonElement | null;
        if (otherBtn) otherBtn.disabled = true;
        nextQuestionTimeout = setTimeout(() => {
          nextQuestionTimeout = null;
          nextQuestion();
        }, 600);
      }
    }
  }

  function handleColorKeyDown(e: KeyboardEvent): void {
    if (!document.getElementById('colorRecogModal')) {
      document.removeEventListener('keydown', handleColorKeyDown);
      return;
    }
    const leftKeys = new Set([
      'Tab',
      'Backquote',
      'Digit1',
      'Digit2',
      'Digit4',
      'Digit5',
      'Digit6',
      'KeyQ',
      'KeyW',
      'KeyE',
      'KeyR',
      'KeyT',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyF',
      'KeyG',
      'KeyZ',
      'KeyX',
      'KeyC',
      'KeyV',
    ]);
    const rightKeys = new Set([
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0',
      'Minus',
      'Equal',
      'KeyY',
      'KeyU',
      'KeyI',
      'KeyO',
      'KeyP',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'KeyJ',
      'KeyK',
      'KeyL',
      'Semicolon',
      'Quote',
      'KeyN',
      'KeyM',
      'Comma',
      'Period',
      'Slash',
      'Enter',
      'NumpadEnter',
    ]);

    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (sidebarOpen) {
        sidebarOpen = false;
        const sidebar = document.getElementById('colorRecogSidebar');
        if (sidebar) sidebar.style.display = 'none';
        return;
      }
      if (quizRunning) {
        quizRunning = false;
        if (questionCount > quizLog.length) questionCount--;
        const score = quizLog.filter((entry) => entry.correct).length;
        document.getElementById('colorRecogProgress')!.textContent =
          `Q${questionCount} | ${score}/${quizLog.length}`;
        if (timerInt) clearInterval(timerInt);
        if (nextQuestionTimeout) {
          clearTimeout(nextQuestionTimeout);
          nextQuestionTimeout = null;
        }
        removeAnswerOverlay();
        document.getElementById('colorRecogTrio')!.replaceChildren();
        showColorRecogStartOverlay();
        return;
      }
      closeQuiz();
      return;
    }

    if (!quizRunning) return;
    const evenBtn = document.getElementById('colorRecogEven') as HTMLButtonElement | null;
    const oddBtn = document.getElementById('colorRecogOdd') as HTMLButtonElement | null;
    if (leftKeys.has(e.code) && evenBtn && !evenBtn.disabled) {
      e.preventDefault();
      evenBtn.click();
    } else if (rightKeys.has(e.code) && oddBtn && !oddBtn.disabled) {
      e.preventDefault();
      oddBtn.click();
    }
  }
  document.addEventListener('keydown', handleColorKeyDown);

  document.getElementById('colorRecogClose')!.addEventListener('click', closeQuiz);
  document.getElementById('colorRecogHamburger')!.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });
  document.getElementById('colorRecogSidebarClose')!.addEventListener('click', () => {
    sidebarOpen = false;
    document.getElementById('colorRecogSidebar')!.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (sidebarOpen && !document.getElementById('colorRecogSidebar')!.contains(e.target as Node)) {
      sidebarOpen = false;
      document.getElementById('colorRecogSidebar')!.style.display = 'none';
    }
  });

  function showColorRecogStartOverlay(): void {
    const existing = document.getElementById('colorRecogStartOverlay');
    if (existing) existing.remove();
    const timerZone = document.getElementById('colorRecogTimerZone')!;
    const startOverlay = document.createElement('div');
    startOverlay.id = 'colorRecogStartOverlay';
    startOverlay.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;background:var(--surface);display:flex;align-items:flex-start;justify-content:center;z-index:50;border-radius:inherit;padding-top:2rem;box-sizing:border-box;';
    startOverlay.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:1.2rem;max-width:320px;text-align:center;padding:1.5rem;">
                <div style="font-size:1.1rem;font-weight:700;color:var(--text-ui);">Parity Quiz</div>
                <div style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;">
                    You'll see three colors. Based on their colors, determine whether the parity is <span style="color:var(--nice-case);font-weight:700;">Even</span> or <span style="color:var(--evil-case);font-weight:700;">Odd</span>.<br><br>
                    Press the <strong>left half</strong> of the screen (or left-side keys) for Even, and the <strong>right half</strong> (or right-side keys) for Odd.
                </div>
                <button id="colorRecogStartBtn" style="padding:0.9rem 2.2rem;background:var(--accent);color:var(--text-on-color);border:none;border-radius:12px;font-size:1.1rem;font-weight:700;cursor:pointer;">Start</button>
            </div>`;
    timerZone.appendChild(startOverlay);
    document.getElementById('colorRecogStartBtn')!.addEventListener('click', () => {
      startOverlay.remove();
      quizRunning = true;
      nextQuestion();
    });
  }

  showColorRecogStartOverlay();
}

// ── TRAINER PICKER ───────────────────────────────────────────────────────────
function openTrainerPickerModal(): void {
  let picker = document.getElementById('trainerPickerModal');
  if (picker) picker.remove();

  picker = document.createElement('div');
  picker.id = 'trainerPickerModal';
  picker.className = 'shape-index-selector-modal active';

  const evilnessEnabled = evilnessFactor;
  const evilnessBtn = evilnessEnabled
    ? `<button onclick="trainerPickerLaunch('evilness')" class="trainer-pick-btn">Evilness Quiz</button>`
    : '';

  picker.innerHTML = `
        <div class="shape-index-selector-content" style="max-width:380px;">
            <div class="shape-index-selector-header">
                <span class="shape-index-selector-title">Choose Trainer</span>
                <button class="shape-index-selector-close" id="trainerPickerClose">&times;</button>
            </div>
            <div class="shape-index-selector-body" style="display:flex;flex-direction:column;gap:10px;">
                <button onclick="trainerPickerLaunch('timer')" class="trainer-pick-btn">Timer Training</button>
                ${evilnessBtn}
                <button onclick="trainerPickerLaunch('color')" class="trainer-pick-btn">Parity Quiz</button>
            </div>
        </div>
    `;

  const style = document.getElementById('trainerPickerStyle') || document.createElement('style');
  style.id = 'trainerPickerStyle';
  style.textContent = `.trainer-pick-btn{padding:14px 18px;background:var(--surface2);border:2px solid var(--border-color);border-radius:10px;cursor:pointer;font-size:0.95rem;font-weight:600;color:var(--text-ui);text-align:left;width:100%;transition:all 0.15s;} .trainer-pick-btn:hover{border-color:var(--accent-hover);background:var(--hover-bg);}`;
  if (!style.parentNode) document.head.appendChild(style);

  document.body.appendChild(picker);
  pushModalState('trainerPickerModal', closeTrainerPickerModal);
  document.getElementById('trainerPickerClose')!.addEventListener('click', closeTrainerPickerModal);
}

function closeTrainerPickerModal(): void {
  closeModalWithHistory(() => {
    const picker = document.getElementById('trainerPickerModal');
    if (picker) picker.remove();
  });
}

function trainerPickerLaunch(type: 'timer' | 'evilness' | 'parity' | 'color'): void {
  const picker = document.getElementById('trainerPickerModal');
  if (picker) picker.remove();
  if (type === 'color') {
    startColorRecognitionPractice();
    return;
  }

  const KEYS: Record<string, string> = {
    timer: 'sq1-selector-cases',
    evilness: 'sq1-selector-evilness',
    parity: 'sq1-selector-parity',
  };
  const chosen = resolveInitialSelection(KEYS[type]);

  if (type === 'timer') {
    openMultiCaseTrainingModal(chosen);
  } else if (type === 'evilness') {
    startEvilnessQuiz(chosen);
  } else if (type === 'parity') {
    startParityQuiz(chosen);
  }
}

// ── MULTI-CASE TRAINING SELECTOR (multi-trainer.js) ──────────────────────────
function saveSelectorSelection(key?: string): void {
  try {
    const storageKey = key || selectorStorageKey || 'sq1-selector-cases';
    const field = storageKey === 'sq1-selector-evilness'
      ? 'selectedEvilness'
      : storageKey === 'sq1-selector-parity'
        ? 'selectedParityQuiz'
        : 'selectedMulti';
    updateCspObject(CSP_TRAINING_KEY, { [field]: [...selectorSelectedCases] });
  } catch {
    // ignore
  }
}

function loadSelectorSelection(key?: string): void {
  let stored = false;
  try {
    const storageKey = key || selectorStorageKey || 'sq1-selector-cases';
    const field = storageKey === 'sq1-selector-evilness'
      ? 'selectedEvilness'
      : storageKey === 'sq1-selector-parity'
        ? 'selectedParityQuiz'
        : 'selectedMulti';
    const arr = readCspObject(CSP_TRAINING_KEY)[field];
    if (Array.isArray(arr)) {
      selectorSelectedCases = new Set(
        arr.map(getCaseId).filter((id): id is number => id !== undefined),
      );
      stored = true;
    }
  } catch {
    // ignore
  }
  // Default to all cases only when nothing has ever been saved (an empty saved list is valid).
  if (!stored) {
    selectorSelectedCases = new Set(data.map((item) => item.id));
    saveSelectorSelection(key);
  }
}

function isGoThroughEnabled(selectorKey?: string): boolean {
  const key = selectorKey || selectorStorageKey || TIMER_SELECTOR_KEY;
  const field = key === 'sq1-selector-evilness'
    ? 'eachCaseEvilness'
    : key === 'sq1-selector-parity'
      ? 'eachCaseParityQuiz'
      : 'eachCaseMulti';
  return readCspObject(CSP_TRAINING_KEY)[field] === true;
}

// Resolve the starting selection for a trainer. An empty saved list falls back to all cases.
function resolveInitialSelection(key: string): number[] {
  selectorStorageKey = key;
  const saved = readSelectedCaseIds(key);
  const chosen = saved && saved.length > 0 ? saved : data.map((item) => item.id);
  selectorSelectedCases = new Set(chosen);
  if (!saved || saved.length === 0) saveSelectorSelection(key);
  return chosen;
}

function openTrainingSelector(): void {
  openMultiCaseTrainingModal(resolveInitialSelection('sq1-selector-cases'));
}

function openSelectorModal(storageKey?: string): void {
  if (storageKey) selectorStorageKey = storageKey;
  else if (!selectorStorageKey) selectorStorageKey = 'sq1-selector-cases';

  loadSelectorSelection(selectorStorageKey);

  createSelectorModal();
  const modal = document.getElementById('trainingSelectorModal');
  if (!modal) return;

  pushModalState('trainingSelectorModal', closeSelectorModal);

  renderSelectorCases();
  const caseGrid = document.getElementById('selectorCaseGrid');
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  const resetScrollPosition = (): void => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (caseGrid) caseGrid.scrollTop = 0;
  };
  resetScrollPosition();
  requestAnimationFrame(resetScrollPosition);

  const inp = document.getElementById('selectorSearchInput') as HTMLInputElement | null;
  if (inp) inp.value = selectorSearchTerm;

  const gt = document.getElementById('selectorGoThrough') as HTMLInputElement | null;
  if (gt) gt.checked = isGoThroughEnabled(selectorStorageKey);
}

function closeSelectorModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('trainingSelectorModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  });
}

function createSelectorModal(): void {
  if (document.getElementById('trainingSelectorModal')) return;

  const modal = document.createElement('div');
  modal.id = 'trainingSelectorModal';
  modal.style.cssText = `
        display: none;
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: var(--modal-overlay);
        z-index: 10001;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
    `;

  modal.innerHTML = `
        <div style="
            background: var(--surface);
            border-radius: 14px;
            width: min(560px, 100%);
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            overflow: hidden;
        ">
            <div style="flex-shrink:0; padding: 16px 20px; background: var(--modal-header-bg); border-bottom: 1px solid var(--surface-border); display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:1.15rem; font-weight:700; color: var(--text-ui);">Select Cases</span>
                    <span id="selectorCountBar" style="font-size:0.8rem; color:var(--text-secondary); font-weight:400;"></span>
                </div>
                <button onclick="closeSelectorModal()" style="background:none; border:none; font-size:1.6rem; cursor:pointer; color:var(--text-secondary); line-height:1; padding:0;">&times;</button>
            </div>

            <div style="flex-shrink:0; padding: 10px 14px; background:var(--surface2); border-bottom:1px solid var(--surface-border); display:flex; gap:8px; align-items:center;">
                <div style="position:relative; flex:1; min-width:0;">
                    <input type="text" id="selectorSearchInput"
                        placeholder="Search cases..."
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                        style="width:100%; padding:7px 10px 7px 32px; border: 1px solid var(--border-color); border-radius:7px; font-size:0.88rem; outline:none; box-sizing:border-box;"
                        oninput="onSelectorSearch(this.value)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        style="position:absolute; left:9px; top:50%; transform:translateY(-50%); width:15px; height:15px; pointer-events:none;">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </div>
                <select id="selectorBulkAction"
                    style="padding:7px 10px; border:1px solid var(--border-color); border-radius:8px; font-size:0.82rem; background-color:var(--surface); cursor:pointer; color:var(--text-secondary); flex-shrink:0;"
                    onchange="applySelectorBulkAction(this.value); this.value='';">
                    <option value="" disabled selected>Select…</option>
                    <option value="select_all">Select All</option>
                    <option value="select_learning">Select Learning</option>
                    <option value="select_learned">Select Learned</option>
                    <option value="select_learning_learned">Select Learning + Learned</option>
                    <option value="select_these">Select These (add to selection)</option>
                    <option value="deselect_learned">Deselect Learned</option>
                    <option value="deselect_these">Deselect These</option>
                    <option value="deselect_all">Deselect All</option>
                </select>
            </div>

            <div id="selectorCaseGrid" style="
                flex:1; overflow-y:auto; padding:10px 12px;
                display:grid;
                grid-template-columns: repeat(3, 1fr);
                gap:7px;
                align-content:start;
            "></div>

            <div style="flex-shrink:0; padding:10px 16px; background:var(--surface2); border-top:1px solid var(--surface-border); display:flex; align-items:center; gap:9px;">
                <input type="checkbox" id="selectorGoThrough"
                    onchange="_toggleGoThroughFromSelector(this.checked)" style="transform:scale(1.2); cursor:pointer;">
                <label for="selectorGoThrough" style="font-size:0.88rem; color:var(--text-secondary); cursor:pointer;">
                    Go through each case once
                    <span id="selectorGoThroughTip"></span>
                </label>
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const tipHost = modal.querySelector<HTMLElement>('#selectorGoThroughTip');
  if (tipHost) {
    mountInfoTip(tipHost, 'Go through each selected case once, and show a message after a full pass.');
  }
}

function onSelectorSearch(val: string): void {
  selectorSearchTerm = val.toLowerCase().trim();
  renderSelectorCases();
}

function toggleGoThroughFromSelector(checked: boolean): void {
  const key = selectorStorageKey || TIMER_SELECTOR_KEY;
  const field = key === 'sq1-selector-evilness'
    ? 'eachCaseEvilness'
    : key === 'sq1-selector-parity'
      ? 'eachCaseParityQuiz'
      : 'eachCaseMulti';
  updateCspObject(CSP_TRAINING_KEY, { [field]: checked });
  resetGoThroughPool();
  if (multiCaseMode) regenerateMultiScrambleLookahead();
  if (evilQuizOnSelectionChange) evilQuizOnSelectionChange([...selectorSelectedCases]);
  if (parityQuizOnSelectionChange) parityQuizOnSelectionChange([...selectorSelectedCases]);
  const s = document.getElementById('tr_goThrough') as HTMLInputElement | null;
  if (s) s.checked = checked;
}

function getSelectorSorted(arr: AlgCase[]): AlgCase[] {
  return [...arr].sort(comparePriorityCases);
}

function getSelectorFilteredData(): AlgCase[] {
  if (!selectorSearchTerm) return getSelectorSorted(data);
  return getSelectorSorted(
    data.filter((item) => {
      const displayName = getDisplayName(item.id).toLowerCase();
      const name = item.key.toLowerCase();
      const term = selectorSearchTerm;
      if (!term.includes('/')) {
        return displayName.includes(term) || name.includes(term);
      }
      const [p1, p2] = term.split('/').map((p) => p.trim());
      const parts = displayName.split('/').map((p) => p.trim());
      if (parts.length === 2) {
        return (
          (parts[0].includes(p1) && parts[1].includes(p2)) ||
          (parts[1].includes(p1) && parts[0].includes(p2))
        );
      }
      return false;
    }),
  );
}

function renderSelectorCases(): void {
  const grid = document.getElementById('selectorCaseGrid');
  if (!grid) return;

  selectorFilteredData = getSelectorFilteredData();

  grid.innerHTML = selectorFilteredData
    .map((item) => {
      const isSelected = selectorSelectedCases.has(item.id);
      const isLearned = learnedCases.has(item.id);
      const isLearning = learningCases.has(item.id);
      const priorityLevel = plannedLevels.get(item.id) || 4;

      let bgColor: string;
      let borderColor: string;
      let textColor: string;
      let checkColor: string;
      if (isLearned) {
        bgColor = isSelected ? 'var(--card-learned-header)' : 'var(--card-learned-bg)';
        borderColor = 'var(--card-learned-border)';
        textColor = 'var(--text-ui)';
        checkColor = 'var(--card-learned-border)';
      } else if (isLearning) {
        bgColor = isSelected ? 'var(--card-learning-header)' : 'var(--card-learning-bg)';
        borderColor = 'var(--card-learning-border)';
        textColor = 'var(--text-ui)';
        checkColor = 'var(--card-learning-border)';
      } else {
        const priorityBgs = [
          'var(--p1-bg)',
          'var(--p2-bg)',
          'var(--p3-bg)',
          'var(--p4-bg)',
          'var(--p5-bg)',
          'var(--p6-bg)',
          'var(--p7-bg)',
        ];
        const priorityBords = [
          'var(--p1-border)',
          'var(--p2-border)',
          'var(--p3-border)',
          'var(--p4-border)',
          'var(--p5-border)',
          'var(--p6-border)',
          'var(--p7-border)',
        ];
        bgColor = isSelected ? priorityBgs[priorityLevel - 1] : 'var(--surface)';
        borderColor = isSelected ? priorityBords[priorityLevel - 1] : 'var(--border-color)';
        textColor = 'var(--text-ui)';
        checkColor = 'var(--accent)';
      }

      const displayName = getDisplayName(item.id);

      return `
            <div data-case="${item.id}" onclick="toggleSelectorCase('${item.id}')"
                style="
                    padding: 7px 8px;
                    background: ${bgColor};
                    border: 2px solid ${borderColor};
                    border-radius: 7px;
                    cursor: pointer;
                    display: flex;
                    align-items: flex-start;
                    gap: 7px;
                    user-select: none;
                    box-sizing: border-box;
                    width: 100%;
                ">
                <div style="
                    width:16px; height:16px; border-radius:3px; flex-shrink:0; margin-top:1px;
                    border:2px solid ${isSelected ? checkColor : 'var(--border-color)'};
                    background:${isSelected ? checkColor : 'var(--surface)'};
                    display:flex; align-items:center; justify-content:center;
                ">
                    ${isSelected ? `<svg viewBox="0 0 12 12" fill="none" stroke="var(--text-on-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:9px;height:9px;"><polyline points="2 6 5 9 10 3"/></svg>` : ''}
                </div>
                <span style="font-size:0.78rem; font-weight:600; color:${textColor}; line-height:1.3; word-break:break-word;">${displayName.includes('/') ? displayName.replace(/ /g, '\u00A0').replace('/', '/\u200B') : displayName}</span>
            </div>
        `;
    })
    .join('');
  decorateLearningOrderGrid(grid, '[data-case]', 'data-case');

  const countBar = document.getElementById('selectorCountBar');
  if (countBar) {
    const total = selectorSelectedCases.size;
    countBar.textContent =
      `${total} out of ${data.length} selected` +
      (selectorSearchTerm ? ` · ${selectorFilteredData.length} shown` : '');
  }
}

function toggleSelectorCase(caseName: string): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  if (selectorSelectedCases.has(caseId)) {
    selectorSelectedCases.delete(caseId);
  } else {
    selectorSelectedCases.add(caseId);
  }
  saveSelectorSelection(selectorStorageKey);
  renderSelectorCases();
  syncMultiTrainerSelection();
  if (evilQuizOnSelectionChange) evilQuizOnSelectionChange([...selectorSelectedCases]);
  if (parityQuizOnSelectionChange) parityQuizOnSelectionChange([...selectorSelectedCases]);
}

function applySelectorBulkAction(action: string): void {
  switch (action) {
    case 'select_all':
      selectorSelectedCases.clear();
      data.forEach((i) => selectorSelectedCases.add(i.id));
      break;
    case 'select_learning':
      selectorSelectedCases.clear();
      data.forEach((i) => {
        if (learningCases.has(i.id)) selectorSelectedCases.add(i.id);
      });
      break;
    case 'select_learned':
      selectorSelectedCases.clear();
      data.forEach((i) => {
        if (learnedCases.has(i.id)) selectorSelectedCases.add(i.id);
      });
      break;
    case 'select_learning_learned':
      selectorSelectedCases.clear();
      data.forEach((i) => {
        if (learningCases.has(i.id) || learnedCases.has(i.id)) selectorSelectedCases.add(i.id);
      });
      break;
    case 'select_these':
      selectorFilteredData.forEach((i) => selectorSelectedCases.add(i.id));
      break;
    case 'deselect_learned':
      data.forEach((i) => {
        if (learnedCases.has(i.id)) selectorSelectedCases.delete(i.id);
      });
      break;
    case 'deselect_these':
      selectorFilteredData.forEach((i) => selectorSelectedCases.delete(i.id));
      break;
    case 'deselect_all':
      selectorSelectedCases.clear();
      break;
  }
  saveSelectorSelection(selectorStorageKey);
  renderSelectorCases();
  syncMultiTrainerSelection();
  if (evilQuizOnSelectionChange) evilQuizOnSelectionChange([...selectorSelectedCases]);
  if (parityQuizOnSelectionChange) parityQuizOnSelectionChange([...selectorSelectedCases]);
}

// ── Multi-case training modal ────────────────────────────────────────────────
function openMultiCaseTrainingModal(caseNames: number[]): void {
  multiTrainingCases = caseNames;
  resetGoThroughPool();

  const modal = createTrainingModal();
  const titleEl = document.getElementById('trainingCaseName')!;

  pushModalState('trainingModal', closeTrainingModal);

  titleEl.onclick = (e) => {
    e.stopPropagation();
    openSelectorModal(selectorStorageKey || 'sq1-selector-cases');
  };
  updateMultiTrainingTitle();

  loadTrainingSettings();

  timerElapsed = 0;
  scrambleHistory = [];
  currentHistoryIndex = -1;
  isHoldReady = false;
  preGeneratedScrambles = [];

  multiCaseMode = true;

  for (let i = 0; i < 3; i++) {
    preGeneratedScrambles.push(generateNextScrambleData()!);
  }

  displayNextScramble();

  modal.classList.add('active');
  document.body.classList.add('modal-open');
  applyPrevScrambleBar();
  applyTimerSize();
}

function updateMultiTrainingTitle(): void {
  const titleEl = document.getElementById('trainingCaseName');
  if (!titleEl) return;
  const n = multiTrainingCases.length;
  titleEl.textContent = `${n} case${n !== 1 ? 's' : ''} selected`;
}

// Apply selector changes to the running multi-case trainer.
function syncMultiTrainerSelection(): void {
  if (!multiCaseMode) return;
  multiTrainingCases = [...selectorSelectedCases];
  const current = scrambleHistory[currentHistoryIndex];
  resetGoThroughPool(current?.caseName);
  const currentValid =
    current?.caseName !== undefined && selectorSelectedCases.has(current.caseName);
  if (currentValid) {
    preGeneratedScrambles = [];
    for (let i = 0; i < 3; i++) preGeneratedScrambles.push(generateNextScrambleData()!);
    updateMultiTrainingTitle();
  } else {
    regenerateMultiScrambleLookahead();
  }
}

function regenerateMultiScrambleLookahead(): void {
  if (syncEmptyState()) {
    updateMultiTrainingTitle();
    return;
  }
  preGeneratedScrambles = [];
  for (let i = 0; i < 3; i++) {
    preGeneratedScrambles.push(generateNextScrambleData()!);
  }
  if (currentHistoryIndex === scrambleHistory.length - 1 || scrambleHistory.length === 0) {
    displayNextScramble();
  }
  updateMultiTrainingTitle();
}

function resetGoThroughPool(avoidFirst?: number | null): void {
  _goThroughRemaining = [...multiTrainingCases];
  for (let i = _goThroughRemaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [_goThroughRemaining[i], _goThroughRemaining[j]] = [_goThroughRemaining[j], _goThroughRemaining[i]];
  }
  if (
    avoidFirst &&
    _goThroughRemaining.length > 1 &&
    _goThroughRemaining[0] === avoidFirst
  ) {
    const k = 1 + Math.floor(Math.random() * (_goThroughRemaining.length - 1));
    [_goThroughRemaining[0], _goThroughRemaining[k]] = [
      _goThroughRemaining[k],
      _goThroughRemaining[0],
    ];
  }
}

function goThroughConsume(): void {
  // No-op: the pool is consumed at generation time and passes are announced in displayNextScramble.
}

// ── Export / import hooks (called from state.ts exportData/importData) ───────
function selectorExportHook(stateObj: Record<string, unknown>): Record<string, unknown> {
  const training = stateObj.training && typeof stateObj.training === 'object'
    ? stateObj.training as Record<string, unknown>
    : {};
  training.selectedMulti = [...selectorSelectedCases];
  stateObj.training = training;
  return stateObj;
}

function selectorImportHook(stateObj: Record<string, unknown>): void {
  const training = stateObj.training && typeof stateObj.training === 'object'
    ? stateObj.training as Record<string, unknown>
    : stateObj;
  const selected = training.selectedMulti ?? training.selectorSelectedCases;
  if (Array.isArray(selected)) {
    selectorSelectedCases = new Set(
      (selected as unknown[])
        .map(getCaseId)
        .filter((id): id is number => id !== undefined),
    );
    saveSelectorSelection();
  }
}

// ── Live-update bridges for the React Trainer settings tab (legacy settings.js) ─
export function applyImageSizeLive(val: number): void {
  trainingScrambleImageSize = val;
  resizeCurrentTrainingScramble();
}

export function applyTextSizeLive(val: number): void {
  const el = document.getElementById('trainingScramble');
  if (el) el.style.fontSize = val + 'px';
  trainingScrambleTextSize = val;
  applyPrevScrambleBar();
}

export function applyTimerSizeLive(val: number): void {
  const el = document.getElementById('trainingTimer');
  if (el) el.style.fontSize = val + 'px';
}

export function applyHoldLive(val: number): void {
  trainingHoldToStart = val;
}

export function applyPrevBarLive(): void {
  applyPrevScrambleBar();
}

export function applyHideImgLive(val: boolean): void {
  trainingHideScrambleImage = val;
  applyHideScrambleImage();
  const imgEl = document.getElementById('trainingScrambleImage');
  if (!imgEl) return;
  if (val) imgEl.innerHTML = '';
  else resizeCurrentTrainingScramble();
}

export function setEnableInspectionLive(val: boolean): void {
  trainingEnableInspection = val;
}

export function setEnableParityQuizLive(val: boolean): void {
  trainingEnableParityQuiz = val;
}

// ── Installation ──────────────────────────────────────────────────────────────
let installed = false;
let viewportResizeTimer: ReturnType<typeof setTimeout> | null = null;

// Re-render open scramble images when the viewport changes (rotation, window resize).
function handleViewportResize(): void {
  if (viewportResizeTimer) clearTimeout(viewportResizeTimer);
  viewportResizeTimer = setTimeout(() => {
    if (document.getElementById('trainingModal')?.classList.contains('active')) {
      resizeCurrentTrainingScramble();
    }
    if (document.getElementById('evilnessQuizModal')) {
      (window as unknown as { _evilQuizUpdateImageSize?: (size: number) => void })
        ._evilQuizUpdateImageSize?.(trainingScrambleImageSize || 280);
    }
  }, 120);
}

export function installTrainingShims(): void {
  if (installed) return;
  installed = true;

  const w = window as unknown as Record<string, unknown>;

  // Global keyboard handlers. The keydown handler uses the CAPTURE phase so it
  // runs BEFORE the global modal-stack Esc handler (registered earlier in
  // main.tsx) and can claim Esc while the training modal is active — exactly
  // like the legacy load order (training-modal.js before index.js).
  document.addEventListener('keydown', handleTrainingKeyDown, true);
  document.addEventListener('keydown', handleQuizKeyDown);
  document.addEventListener('keyup', handleTrainingKeyUp);
  window.addEventListener('resize', handleViewportResize);

  // Training modal bridges.
  w.openTrainingModal = openTrainingModal;
  w.closeTrainingModal = closeTrainingModal;
  w.generateNextScrambleData = generateNextScrambleData;
  w.displayNextScramble = displayNextScramble;
  w.applyHideScrambleImage = applyHideScrambleImage;
  w.resizeCurrentTrainingScramble = resizeCurrentTrainingScramble;
  w.applyPrevScrambleBar = applyPrevScrambleBar;
  w.applyTimerSize = applyTimerSize;

  // Shape-index selector bridges (inline onclick).
  w.openShapeIndexSelector = openShapeIndexSelector;
  w.closeShapeIndexSelector = closeShapeIndexSelector;
  w.toggleShapeIndex = toggleShapeIndex;
  w.selectAllIndices = selectAllIndices;
  w.deselectAllIndices = deselectAllIndices;

  // Info / settings bridges.
  w.openTrainingInfoModal = openTrainingInfoModal;
  w.closeTrainingInfoModal = closeTrainingInfoModal;
  w.openTrainingSettingsModal = openTrainingSettingsModal;

  // Quizzes.
  w.openEvilnessQuiz = openEvilnessQuiz;
  w.openParityQuiz = openParityQuiz;
  w.openColorRecognitionPractice = openColorRecognitionPractice;

  // Trainer picker (inline onclick).
  w.openTrainerPickerModal = openTrainerPickerModal;
  w.closeTrainerPickerModal = closeTrainerPickerModal;
  w.trainerPickerLaunch = trainerPickerLaunch;

  // Multi-case selector (inline onclick/oninput/onchange).
  w.openTrainingSelector = openTrainingSelector;
  w.openSelectorModal = openSelectorModal;
  w.closeSelectorModal = closeSelectorModal;
  w.onSelectorSearch = onSelectorSearch;
  w.toggleSelectorCase = toggleSelectorCase;
  w.applySelectorBulkAction = applySelectorBulkAction;
  w._toggleGoThroughFromSelector = toggleGoThroughFromSelector;
  w._isGoThroughEnabled = isGoThroughEnabled;
  w._resetGoThroughPool = resetGoThroughPool;
  w._goThroughConsume = goThroughConsume;
  w.selectorExportHook = selectorExportHook;
  w.selectorImportHook = selectorImportHook;
  w.trainingSelections = trainingSelections;

  // Live-setting get/set bridges so the React Trainer settings tab can drive
  // the open training modal (legacy exposed these as globals via settings.js).
  Object.defineProperty(w, 'trainingScrambleImageSize', {
    get: () => trainingScrambleImageSize,
    set: (v: number) => {
      trainingScrambleImageSize = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, 'trainingScrambleTextSize', {
    get: () => trainingScrambleTextSize,
    set: (v: number) => {
      trainingScrambleTextSize = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, 'trainingHoldToStart', {
    get: () => trainingHoldToStart,
    set: (v: number) => {
      trainingHoldToStart = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, 'trainingEnableInspection', {
    get: () => trainingEnableInspection,
    set: (v: boolean) => {
      trainingEnableInspection = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, 'trainingEnableParityQuiz', {
    get: () => trainingEnableParityQuiz,
    set: (v: boolean) => {
      trainingEnableParityQuiz = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, 'trainingHideScrambleImage', {
    get: () => trainingHideScrambleImage,
    set: (v: boolean) => {
      trainingHideScrambleImage = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, '_multiCaseMode', {
    get: () => multiCaseMode,
    set: (v: boolean) => {
      multiCaseMode = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, '_selectorStorageKey', {
    get: () => selectorStorageKey,
    set: (v: string) => {
      selectorStorageKey = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, '_evilQuizOnSelectionChange', {
    get: () => evilQuizOnSelectionChange,
    set: (v: ((ids: number[]) => void) | null) => {
      evilQuizOnSelectionChange = v;
    },
    configurable: true,
  });
  Object.defineProperty(w, '_parityQuizOnSelectionChange', {
    get: () => parityQuizOnSelectionChange,
    set: (v: ((ids: number[]) => void) | null) => {
      parityQuizOnSelectionChange = v;
    },
    configurable: true,
  });

  // Live-apply bridges (legacy settings.js `_trApplyTextSize` etc.).
  w._trApplyTextSize = applyTextSizeLive;
  w._trApplyTimerSize = applyTimerSizeLive;
  w._trApplyHold = applyHoldLive;
  w._trApplyPrevBar = applyPrevBarLive;
  w._trApplyHideImg = applyHideImgLive;
  w._trToggleInspection = setEnableInspectionLive;
  w._trToggleParityQuiz = setEnableParityQuizLive;
}
