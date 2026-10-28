/**
 * Edit Case modal — ported 1:1 from legacy `js/modals.js` (openEditCaseModal,
 * rename/info sub-modals, live parity color-coding, save/discard confirmation).
 */
import type { AlgCase } from '../data/types';
import { getCaseId } from '../data/cases';
import {
  calculateAndCacheAllParity,
  colorScheme,
  cornerStickerMode,
  customAlgorithms,
  data,
  displayNames,
  evilnessFactor,
  evilnessMap,
  getDefaultDisplayName,
  getDisplayName,
  perCaseSubtitles,
  saveState,
} from './state';
import { algToShapeIndex, invertScramble } from '../lib/cube';
import { CSPData } from '../lib/dataStore';
import { normalizeScramble } from '../lib/normalizer';
import { getParityText } from '../lib/parityAnalyzer';
import { expandAndNormalize, expandForColorCheck } from './quickEdit';
import { notify } from './store';
import { closeModalWithHistory, pushModalState } from './modal';
import { showSaveDiscardConfirmation } from './confirm';
import { showToast } from './toast';

// ── Shape / parity helpers ────────────────────────────────────────────────────
function getModalCaseShapeData(caseName: string) {
  return CSPData.getShapeEntry(caseName);
}

function getParityForInput(alg: string): 'odd' | 'even' | null {
  const modal = document.getElementById('editCaseModal');
  if (!modal) return null;
  const caseName = getEditModalCaseName(modal);
  const canonicalIdx = caseName ? CSPData.getCanonicalShapeIndex(caseName) : null;
  const caseShapeData = caseName ? getModalCaseShapeData(caseName) : null;
  const expanded = expandForColorCheck(alg);
  const normalized = normalizeScramble(expanded);
  const result = algToShapeIndex(normalized);
  const idx = result.shapeIndex;
  const isDirectMatch = canonicalIdx !== null && idx === canonicalIdx;
  const isInOrg = caseShapeData && caseShapeData.org && caseShapeData.org.includes(idx);
  const isInMir = caseShapeData && caseShapeData.mir && caseShapeData.mir.includes(idx);
  if (isDirectMatch || isInOrg) {
    const setup = invertScramble(normalized);
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
    return parityText === 'Odd' ? 'odd' : 'even';
  } else if (isInMir) {
    const setup = invertScramble(normalized);
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
    return parityText === 'Odd' ? 'odd' : 'even';
  } else {
    return null;
  }
}

function getParityColorsForInput(alg: string): { color: string } | null {
  const parity = getParityForInput(alg);
  if (!parity) return { color: 'var(--parity-invalid)' };
  return { color: parity === 'odd' ? 'var(--parity-odd)' : 'var(--parity-even)' };
}

/** True when the alg solves only the mirrored (z2) version of the case. */
function isMirroredInput(alg: string): boolean {
  const modal = document.getElementById('editCaseModal');
  const caseName = modal ? getEditModalCaseName(modal) : null;
  if (!caseName) return false;
  const canonicalIdx = CSPData.getCanonicalShapeIndex(caseName);
  const entry = getModalCaseShapeData(caseName);
  const idx = algToShapeIndex(normalizeScramble(expandForColorCheck(alg))).shapeIndex;
  return idx !== canonicalIdx && !entry?.org?.includes(idx) && !!entry?.mir?.includes(idx);
}

function setMirrorBadge(input: HTMLInputElement, mirrored: boolean): void {
  let badge = input.previousElementSibling as HTMLElement | null;
  if (!badge?.classList.contains('z2-prefix')) {
    if (!mirrored) return;
    badge = document.createElement('span');
    badge.className = 'z2-prefix';
    badge.textContent = 'z2';
    input.before(badge);
  }
  badge.style.display = mirrored ? '' : 'none';
}

function updateInputColorLive(input: HTMLInputElement): void {
  const alg = input.value.trim();
  if (!alg || alg === 'Done!') {
    input.style.color = '';
    input.style.fontWeight = '';
    setMirrorBadge(input, false);
    return;
  }
  try {
    setMirrorBadge(input, isMirroredInput(alg));
    const info = getParityColorsForInput(alg);
    if (!info) {
      input.style.color = '';
      return;
    }
    input.style.color = info.color;
    input.style.fontWeight = '600';
  } catch {
    setMirrorBadge(input, false);
    input.style.color = 'var(--parity-invalid)';
    input.style.fontWeight = '600';
  }
}

function updateInputColor(input: HTMLInputElement): void {
  updateInputColorLive(input);
}

// Helper to get case name from the edit case modal title
function getEditModalCaseName(modal: HTMLElement): string | null {
  const titleElement = modal.querySelector('.modal-title');
  if (!titleElement) return null;
  for (const dataItem of data) {
    if (
      getDisplayName(dataItem.id) === titleElement.textContent ||
      dataItem.key === titleElement.textContent
    ) {
      return String(dataItem.id);
    }
  }
  return null;
}

function findCaseByModalTitle(modal: HTMLElement): AlgCase | null {
  const titleElement = modal.querySelector('.modal-title');
  if (!titleElement) return null;
  for (const dataItem of data) {
    if (
      getDisplayName(dataItem.id) === titleElement.textContent ||
      dataItem.key === titleElement.textContent
    ) {
      return dataItem;
    }
  }
  return null;
}

// ── Alg input wiring ──────────────────────────────────────────────────────────
function wireAlgInput(input: HTMLInputElement): void {
  input.addEventListener('blur', () => {
    const rawText = input.value.trim();
    if (rawText && rawText !== 'Done!') {
      input.value = expandAndNormalize(rawText);
    }
    updateInputColor(input);
  });

  input.addEventListener('input', () => {
    updateInputColorLive(input);
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const rawClipboard = e.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData;
    const text = rawClipboard ? rawClipboard.getData('text/plain') : '';
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentValue = input.value;
    input.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    input.selectionStart = input.selectionEnd = start + text.length;
  });
}

export function addNewAlgorithmField(): void {
  const algsList = document.getElementById('editAlgsList');
  if (!algsList) return;

  const newField = document.createElement('div');
  newField.style.cssText = 'display: flex; gap: 8px; align-items: center;';
  newField.innerHTML = `
        <input type="text" class="alg-input" value="" placeholder="Enter algorithm" data-original="" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; font-family: monospace; font-size: 0.9rem; font-weight: 600; transition: color 0.15s;">
        <button onclick="this.parentElement.remove()" style="padding: 6px; background: var(--delete-btn-bg); color: var(--text-ui); border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
            <span class="themed-icon themed-icon--delete" aria-hidden="true" style="width:16px;height:16px;"></span>
        </button>
    `;

  algsList.appendChild(newField);

  const input = newField.querySelector('.alg-input') as HTMLInputElement;
  wireAlgInput(input);
  input.focus();
}

// ── Case rename modal ─────────────────────────────────────────────────────────
export function openCaseRenameModal(caseName: string, currentName: string, currentSubtitle = ''): void {
  const escapeAttr = (s: string) => s.replace(/'/g, "\\'");

  const renameModal = document.createElement('div');
  renameModal.className = 'modal active';
  renameModal.id = 'caseRenameModal';
  renameModal.style.zIndex = '10004';
  renameModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <span class="modal-title">Edit Case Name & Subtitle</span>
                <button class="close-btn" onclick="closeCaseRenameModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Custom Name:</label>
                    <input type="text" id="caseRenameInput" value="${escapeAttr(currentName)}" placeholder="Leave empty for default name" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 1rem;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Subtitle (optional):</label>
                    <input type="text" id="caseSubtitleRenameInput" value="${escapeAttr(currentSubtitle)}" placeholder="Enter a subtitle for this case" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 1rem;">
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="applyCaseRename('${escapeAttr(caseName)}')" style="padding: 10px 20px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; font-weight: 600;">OK</button>
                    <button onclick="closeCaseRenameModal()" style="padding: 10px 20px; background: var(--delete-btn-bg); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                </div>
            </div>
        </div>
    `;

  pushModalState('caseRenameModal', closeCaseRenameModal);
  document.body.appendChild(renameModal);

  setTimeout(() => {
    const input = document.getElementById('caseRenameInput') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

export function closeCaseRenameModal(): void {
  closeModalWithHistory(() => {
    document.getElementById('caseRenameModal')?.remove();
  });
}

export function applyCaseRename(caseName: string): void {
  const nameInput = document.getElementById('caseRenameInput') as HTMLInputElement | null;
  const subtitleInput = document.getElementById('caseSubtitleRenameInput') as HTMLInputElement | null;
  if (!nameInput || !subtitleInput) return;

  const newName = nameInput.value.trim();
  const newSubtitle = subtitleInput.value.trim();

  const defaultName = getDefaultDisplayName(caseName);

  window.tempCaseRename = {
    caseName,
    newName,
    newSubtitle,
  };

  const titleElement = document.getElementById('editCaseTitle');
  const subtitleElement = document.getElementById('editCaseSubtitle');

  if (titleElement) {
    titleElement.textContent = newName || defaultName;
  }

  if (subtitleElement) {
    if (newSubtitle) {
      subtitleElement.textContent = newSubtitle;
      subtitleElement.style.display = 'block';
    } else {
      subtitleElement.textContent = '';
      subtitleElement.style.display = 'none';
    }
  }

  closeCaseRenameModal();
}

function saveCaseRename(caseName: string): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  const temp = window.tempCaseRename;
  if (temp && temp.caseName === caseName) {
    const newName = temp.newName;
    const newSubtitle = temp.newSubtitle;
    const defaultName = getDefaultDisplayName(caseName);

    if (newName) {
      displayNames[caseId] = newName;
    } else {
      displayNames[caseId] = defaultName;
    }

    if (newSubtitle) {
      perCaseSubtitles.set(caseId, newSubtitle);
    } else {
      perCaseSubtitles.delete(caseId);
    }

    window.tempCaseRename = null;
  }
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function openEditCaseModal(caseName: string, openedFromTrainingCaseInfo = false): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  const item = CSPData.getCase(caseId);
  if (!item) return;

  const customAlgs = customAlgorithms.get(caseId);
  const allAlgs: string[] = [];
  if (customAlgs) {
    allAlgs.push(...(customAlgs.odd || []), ...(customAlgs.even || []));
  } else {
    allAlgs.push(...(item.odd || []), ...(item.even || []));
  }

  const customName = displayNames[caseId] || '';
  const customSubtitle = perCaseSubtitles.get(caseId) || '';

  const existingMenu = document.getElementById('caseContextMenu');
  if (existingMenu) existingMenu.remove();

  pushModalState('editCaseModal', closeEditCaseModal);

  const modal = document.createElement('div');
  modal.className = `modal active${openedFromTrainingCaseInfo ? ' training-followup-modal' : ''}`;
  modal.id = 'editCaseModal';
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; min-height: 20vh;">
            <div class="modal-header">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="modal-title" id="editCaseTitle">${getDisplayName(caseName)}</span>
                        <button onclick="openCaseRenameModal('${caseName.replace(/'/g, "\\'")}', '${customName.replace(/'/g, "\\'")}', '${customSubtitle.replace(/'/g, "\\'")}')" style="background: none; border: none; color: var(--text-ui); cursor: pointer; padding: 4px; display: flex; align-items: center;">
                            <span class="themed-icon themed-icon--pen" aria-hidden="true" style="width:20px;height:20px;"></span>
                        </button>
                        <button onclick="showEditCaseInfoModal()" class="case-detail-info-btn" style="background: var(--surface2); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; width: 32px; height: 32px;" title="Help" onmouseover="this.style.background='var(--surface-border)'" onmouseout="this.style.background='var(--surface2)'">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </button>
                    </div>
                    ${perCaseSubtitles.has(caseId) ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;" id="editCaseSubtitle">${perCaseSubtitles.get(caseId)}</div>` : '<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; display: none;" id="editCaseSubtitle"></div>'}
                </div>
                <button class="close-btn" onclick="attemptCloseEditCaseModal()">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                <div style="margin-bottom: 15px;" id="algorithmsSection">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text-secondary);">Algs:</label>
                    <div id="editAlgsList" style="display: flex; flex-direction: column; gap: 10px;">
                        ${allAlgs
                          .map(
                            (alg) => `
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="text" class="alg-input" value="${alg.replace(/"/g, '&quot;')}" data-original="${alg.replace(/"/g, '&quot;')}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; font-family: monospace; font-size: 0.9rem; font-weight: 600; transition: color 0.15s;">
                                <button onclick="this.parentElement.remove()" style="padding: 6px; background: var(--delete-btn-bg); color: var(--text-ui); border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
                                    <span class="themed-icon themed-icon--delete" aria-hidden="true" style="width:16px;height:16px;"></span>
                                </button>
                            </div>
                        `,
                          )
                          .join('')}
                    </div>
                    <button id="addAlgorithmBtn" onclick="addNewAlgorithmField()" style="margin-top: 10px; padding: 8px 16px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">+ Add Algorithm</button>
                </div>

                ${evilnessFactor ? `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--surface-border);">
                    <label style="font-weight: 500; color: var(--text-secondary); font-size: 0.95rem;">Mark as Evil</label>
                    <label class="evil-switch" style="position:relative;display:inline-block;width:42px;height:24px;">
                        <input type="checkbox" id="evilCaseToggle" ${evilnessMap[caseId] ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${evilnessMap[caseId] ? 'var(--evil-case, #c00)' : 'var(--surface-border)'};border-radius:24px;transition:.3s;">
                            <span style="position:absolute;content:'';height:18px;width:18px;left:${evilnessMap[caseId] ? '21px' : '3px'};bottom:3px;background:var(--surface-raised);border-radius:50%;transition:.3s;display:block;" id="evilSwitchKnob"></span>
                        </span>
                    </label>
                </div>
                ` : ''}
                <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--surface-border);">
                    <button onclick="saveEditedCase('${caseName.replace(/'/g, "\\'")}')" style="padding: 10px 20px; background: var(--bar-learned); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; font-weight: 600;">Save Changes</button>
                    <button onclick="closeEditCaseModal()" style="padding: 10px 20px; background: var(--delete-btn-bg); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  document.documentElement.classList.add('scroll-locked');

  // Wire up evil switch live animation
  if (evilnessFactor) {
    const evilToggle = modal.querySelector('#evilCaseToggle') as HTMLInputElement | null;
    if (evilToggle) {
      evilToggle.addEventListener('change', () => {
        const span = evilToggle.nextElementSibling as HTMLElement | null;
        const knob = document.getElementById('evilSwitchKnob') as HTMLElement | null;
        if (span) {
          span.style.background = evilToggle.checked
            ? 'var(--evil-case, #c00)'
            : 'var(--surface-border)';
        }
        if (knob) knob.style.left = evilToggle.checked ? '21px' : '3px';
      });
    }
  }

  // Apply enhanced access restrictions
  if (!window.enhancedAccess) {
    const algorithmsSection = document.getElementById('algorithmsSection');
    if (algorithmsSection) {
      algorithmsSection.style.opacity = '0.5';
      algorithmsSection.style.pointerEvents = 'none';
    }

    const addAlgorithmBtn = document.getElementById('addAlgorithmBtn') as HTMLButtonElement | null;
    if (addAlgorithmBtn) {
      addAlgorithmBtn.disabled = true;
      addAlgorithmBtn.style.cursor = 'not-allowed';
    }

    modal.querySelectorAll('.alg-input').forEach((input) => {
      (input as HTMLInputElement).style.cursor = 'not-allowed';
    });

    modal.querySelectorAll('#editAlgsList button').forEach((btn) => {
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).style.cursor = 'not-allowed';
    });
  }

  // Setup parity detection for algorithm inputs
  setTimeout(() => {
    const inputs = modal.querySelectorAll('.alg-input');
    inputs.forEach((input) => {
      const el = input as HTMLInputElement;
      if (document.activeElement !== el) {
        updateInputColor(el);
      }
      wireAlgInput(el);
    });
  }, 200);
}

export function closeEditCaseModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('editCaseModal');
    if (modal) {
      modal.remove();
      document.documentElement.classList.remove('scroll-locked');
    }
  });
}

export function attemptCloseEditCaseModal(): void {
  const algInputs = document.querySelectorAll('#editAlgsList .alg-input');
  const originalAlgs: string[] = [];
  const modal = document.getElementById('editCaseModal');
  if (!modal) {
    closeEditCaseModal();
    return;
  }

  const item = findCaseByModalTitle(modal);
  if (!item) {
    closeEditCaseModal();
    return;
  }

  const customAlgs = customAlgorithms.get(item.id);
  if (customAlgs) {
    originalAlgs.push(...(customAlgs.odd || []), ...(customAlgs.even || []));
  } else {
    originalAlgs.push(...(item.odd || []), ...(item.even || []));
  }

  const currentAlgs = Array.from(algInputs)
    .map((input) => (input as HTMLInputElement).value.trim())
    .filter((v) => v);

  let algsChanged = false;
  if (originalAlgs.length !== currentAlgs.length) {
    algsChanged = true;
  } else {
    for (let i = 0; i < originalAlgs.length; i++) {
      if (originalAlgs[i] !== currentAlgs[i]) {
        algsChanged = true;
        break;
      }
    }
  }

  const nameChanged = !!(window.tempCaseRename && window.tempCaseRename.caseName === String(item.id));
  const evilToggle = modal.querySelector<HTMLInputElement>('#evilCaseToggle');
  const evilnessChanged = !!evilToggle && evilToggle.checked !== (evilnessMap[String(item.id)] === true);

  if (algsChanged || nameChanged || evilnessChanged) {
    showSaveDiscardConfirmation(
      'You have unsaved changes. Do you want to save them?',
      () => saveEditedCase(String(item.id)),
      () => {
        window.tempCaseRename = null;
        closeEditCaseModal();
      },
      null,
    );
  } else {
    window.tempCaseRename = null;
    closeEditCaseModal();
  }
}

export function showEditCaseInfoModal(): void {
  let infoModal = document.getElementById('editCaseInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'editCaseInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">Edit Case Guide</span>
                    <button class="training-info-close" onclick="closeEditCaseInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text"><strong>Parity Labels:</strong> Each alg has a colored label to its right, indicating its parity. <span style="color: var(--parity-odd); font-weight: 600;">Green = Odd</span>, <span style="color: var(--parity-even); font-weight: 600;">Blue = Even</span>. <span style="color: var(--parity-invalid); font-weight: 600;">Red = Invalid</span>. (Your alg doesn't match this case at all. Double-check your input for typos or missing slices.) The label disappears while editing and reappears when you click away.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text"><strong>Auto-Normalization:</strong> When you finish editing an alg (click away from the input), it's automatically normalized to standard notation. Formatting will be standardized, and if your alg solves the z2 case, it will be marked with a "z2" prefix.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text"><strong>Remember to Save:</strong> All changes (including name/subtitle edits) are only saved when you click "Save Changes" at the bottom.</div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }

  pushModalState('editCaseInfoModal', closeEditCaseInfoModal);
  infoModal.classList.add('active');
}

export function closeEditCaseInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('editCaseInfoModal');
    if (modal) {
      modal.classList.remove('active');
    }
  });
}

export function saveEditedCase(caseName: string): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  saveCaseRename(caseName);

  const algInputs = document.querySelectorAll('#editAlgsList .alg-input');
  const allAlgs = Array.from(algInputs)
    .map((input) => (input as HTMLInputElement).value.trim())
    .filter((v) => v);

  const odd: string[] = [];
  const even: string[] = [];
  for (const alg of allAlgs) {
    const parity = getParityForInput(alg);
    if (parity === 'odd') odd.push(alg);
    else if (parity === 'even') even.push(alg);
  }
  customAlgorithms.set(caseId, { odd, even });
  const evilToggle = document.querySelector<HTMLInputElement>('#editCaseModal #evilCaseToggle');
  if (evilToggle) evilnessMap[String(caseId)] = evilToggle.checked;

  saveState();
  calculateAndCacheAllParity();
  notify();
  window.dispatchEvent(new CustomEvent('sqg:case-updated', { detail: { caseId } }));
  closeEditCaseModal();
  setTimeout(() => showToast('Case updated successfully!', 2000, 'success'), 0);
}

export function installEditCaseShims(): void {
  const w = window as unknown as Record<string, unknown>;
  w.openEditCaseModal = openEditCaseModal;
  w.closeEditCaseModal = closeEditCaseModal;
  w.attemptCloseEditCaseModal = attemptCloseEditCaseModal;
  w.openCaseRenameModal = openCaseRenameModal;
  w.closeCaseRenameModal = closeCaseRenameModal;
  w.applyCaseRename = applyCaseRename;
  w.saveEditedCase = saveEditedCase;
  w.addNewAlgorithmField = addNewAlgorithmField;
  w.showEditCaseInfoModal = showEditCaseInfoModal;
  w.closeEditCaseInfoModal = closeEditCaseInfoModal;
  w.updateInputColorLive = updateInputColorLive;
  w.updateInputColor = updateInputColor;
  w.saveCaseRename = saveCaseRename;
  w.expandAndNormalize = expandAndNormalize;
  w.expandForColorCheck = expandForColorCheck;
}
