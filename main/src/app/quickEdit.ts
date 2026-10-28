/**
 * Quick Edit system — ported 1:1 from legacy `js/quick-edit.js` (lazy-loaded
 * batch editor for case names, subtitles, notes, algorithms, find/replace,
 * and the algorithm-variables table).
 */
import type { ShapeIndexEntry } from '../data/types';
import { CASE_NAMES } from '../data/cases';
import {
  algVariables,
  calculateAndCacheAllParity,
  colorScheme,
  comments,
  cornerStickerMode,
  customAlgorithms,
  data,
  displayNames,
  enhancedAccess,
  evilnessFactor,
  evilnessMap,
  getDisplayName,
  perCaseSubtitles,
  saveState,
} from './state';
import { algToShapeIndex, invertScramble } from '../lib/cube';
import { CSPData } from '../lib/dataStore';
import { normalizeScramble } from '../lib/normalizer';
import { getParityText } from '../lib/parityAnalyzer';
import { sanitizeNoteHTML } from './algDisplay';
import { attachOverlayClose, closeAllModalStates, closeModalWithHistory, pushModalState } from './modal';
import { showConfirmation, showSaveDiscardConfirmation } from './confirm';
import { showToast } from './toast';
import { notify } from './store';

interface QuickEditState {
  currentTab: 'general' | 'algorithms';
  findReplaceOpen: boolean;
  findReplaceScope: string | null;
  currentFindIndex: number;
  findMatches: HTMLElement[];
  lastFocusedCell: HTMLElement | null;
  allMatchRanges: { cell: HTMLElement; start: number; end: number }[];
  visibleAlgColumns: number;
}

interface AlgVarsSnapshot {
  displayNames: Record<string, string>;
  perCaseSubtitles: Map<number, string>;
  comments: Map<number, string>;
  customAlgorithms: Map<number, { odd?: string[]; even?: string[] }>;
}

let quickEditState: QuickEditState = {
  currentTab: 'general',
  findReplaceOpen: false,
  findReplaceScope: null,
  currentFindIndex: -1,
  findMatches: [],
  lastFocusedCell: null,
  allMatchRanges: [],
  visibleAlgColumns: 6,
};

// Load auto-select setting from localStorage
let autoSelectTextOnFocus = localStorage.getItem('autoSelectTextOnFocus') !== 'false';

let quickEditInitialState: AlgVarsSnapshot | null = null;

// ── Variable expansion ────────────────────────────────────────────────────────
export function expandAlgVariables(alg: string): string {
  if (!alg || alg === 'Done!') return alg;
  if (algVariables.size === 0) return alg;
  return alg.replace(/:([a-zA-Z_][a-zA-Z0-9_]*):/g, (match, name) => {
    return algVariables.has(name) ? (algVariables.get(name) as string) : match;
  });
}

export function expandAndNormalize(alg: string): string {
  if (!alg || alg === 'Done!') return alg;
  return normalizeScramble(expandAlgVariables(alg));
}

export function expandForColorCheck(alg: string): string {
  if (!alg || alg === 'Done!') return alg;
  return expandAlgVariables(alg);
}

// ── Row shells + lazy hydration ───────────────────────────────────────────────
function generateGeneralTableRowsShell(): string {
  const sortedData = [...data].sort((a, b) => getDisplayName(a.id).localeCompare(getDisplayName(b.id)));
  return sortedData
    .map(
      (item) =>
        `<tr data-case="${item.id}" class="qe-lazy-row" data-tab="general"><td colspan="${
          evilnessFactor ? 5 : 4
        }" style="height:41px;"></td></tr>`,
    )
    .join('');
}

function generateAlgorithmsTableRowsShell(): string {
  const sortedData = [...data].sort((a, b) => getDisplayName(a.id).localeCompare(getDisplayName(b.id)));
  return sortedData
    .map((item) => `<tr data-case="${item.id}" class="qe-lazy-row" data-tab="algorithms"><td colspan="7" style="height:41px;"></td></tr>`)
    .join('');
}

function hydrateGeneralRow(row: HTMLTableRowElement): void {
  const item = CSPData.getCase(row.dataset.case || '');
  if (!item) return;
  const displayName = getDisplayName(item.id);
  const subtitle = perCaseSubtitles.get(item.id) || '';
  const note = comments.get(item.id) || '';
  const formattedNote = sanitizeNoteHTML(note);
  const isEvil = evilnessMap[item.id] === true;
  row.classList.remove('qe-lazy-row');
  row.innerHTML = `
        <td class="uneditable">${CASE_NAMES[item.id - 1]}</td>
        <td class="editable" contenteditable="true" data-field="displayName" data-original="${displayName}">${displayName}</td>
        <td class="editable" contenteditable="true" data-field="subtitle" data-original="${subtitle}">${subtitle}</td>
        <td class="editable notes-cell" contenteditable="true" data-field="notes" data-original="${note.replace(/"/g, '&quot;')}" data-raw-html="${note.replace(/"/g, '&quot;')}">${formattedNote}</td>
        ${
          evilnessFactor
            ? `<td style="text-align:center;vertical-align:middle;"><label style="position:relative;display:inline-block;width:36px;height:20px;"><input type="checkbox" class="evil-qe-toggle" data-case="${item.id}" ${
                isEvil ? 'checked' : ''
              } style="opacity:0;width:0;height:0;" onchange="evilnessMap[this.dataset.case]=this.checked;saveState();const k=this.nextElementSibling;k.style.background=this.checked?'var(--evil-case,#c00)':'var(--surface-border)';k.querySelector('span').style.left=this.checked?'18px':'2px';"><span style="position:absolute;top:0;left:0;right:0;bottom:0;background:${
                isEvil ? 'var(--evil-case,#c00)' : 'var(--surface-border)'
              };border-radius:20px;cursor:pointer;transition:.3s;"><span style="position:absolute;height:16px;width:16px;left:${
                isEvil ? '18px' : '2px'
              };bottom:2px;background:var(--surface-raised);border-radius:50%;transition:.3s;display:block;"></span></span></label></td>`
            : ''
        }
    `;
  setupRowHandlers(row, 'general');
}

function hydrateAlgorithmsRow(row: HTMLTableRowElement): void {
  const item = CSPData.getCase(row.dataset.case || '');
  if (!item) return;
  const visibleCols = quickEditState.visibleAlgColumns || 6;
  const customAlgs = customAlgorithms.get(item.id);
  const allAlgs: string[] = customAlgs ? [...(customAlgs.odd || []), ...(customAlgs.even || [])] : [...(item.odd || []), ...(item.even || [])];
  const totalCols = Math.max(visibleCols, 6);
  while (allAlgs.length < totalCols) allAlgs.push('');
  row.classList.remove('qe-lazy-row');
  row.innerHTML = `
        <td class="uneditable display-name-col">${CASE_NAMES[item.id - 1]}</td>
        ${allAlgs
          .slice(0, totalCols)
          .map(
            (alg, idx) =>
              `<td class="editable alg-cell" contenteditable="true" data-field="alg${idx}" data-original="${alg}" style="${
                idx >= visibleCols ? 'display:none;' : ''
              }">${alg}</td>`,
          )
          .join('')}
    `;
  setupRowHandlers(row, 'algorithms');
  row.querySelectorAll('.alg-cell').forEach((cell) => {
    if (cell.textContent?.trim()) updateAlgorithmCellParity(cell as HTMLElement);
  });
}

function setupRowHandlers(row: HTMLTableRowElement, tab: 'general' | 'algorithms'): void {
  row.querySelectorAll('.editable').forEach((cellEl) => {
    const cell = cellEl as HTMLElement;
    cell.addEventListener('focus', () => {
      if (cell.classList.contains('notes-cell')) {
        const r = cell.dataset.rawHtml || '';
        cell.textContent = r;
      }
      if (autoSelectTextOnFocus) {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      quickEditState.lastFocusedCell = cell;
      if (tab === 'general') {
        const f = cell.dataset.field;
        quickEditState.findReplaceScope = f === 'displayName' ? 'name' : f === 'subtitle' ? 'subtitle' : f === 'notes' ? 'notes' : null;
      }
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey && cell.dataset.field === 'notes') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const nr = cell.closest('tr')?.nextElementSibling;
        if (nr) {
          if (nr.classList.contains('qe-lazy-row')) {
            if (tab === 'general') hydrateGeneralRow(nr as HTMLTableRowElement);
            else hydrateAlgorithmsRow(nr as HTMLTableRowElement);
          }
          const sc = nr.querySelector(`[data-field="${cell.dataset.field}"]`);
          if (sc) (sc as HTMLElement).focus();
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const rowCells = Array.from(cell.closest('tr')?.querySelectorAll('.editable') || []) as HTMLElement[];
        const ci = rowCells.indexOf(cell);
        if (e.shiftKey) {
          if (ci > 0) rowCells[ci - 1].focus();
        } else {
          if (ci < rowCells.length - 1) rowCells[ci + 1].focus();
        }
        return;
      }
    });
    cell.addEventListener('blur', () => {
      if (cell.classList.contains('notes-cell')) {
        const r = (cell.textContent || '').trim();
        cell.dataset.rawHtml = r;
        cell.innerHTML = sanitizeNoteHTML(r);
      }
    });
    if (cell.classList.contains('alg-cell')) {
      cell.addEventListener('input', () => updateAlgorithmCellParityLive(cell));
      cell.addEventListener('blur', () => {
        const t = (cell.textContent || '').trim();
        if (t && t !== 'Done!') cell.textContent = expandAndNormalize(t);
        updateAlgorithmCellParity(cell);
      });
      cell.addEventListener('paste', (e) => {
        e.preventDefault();
        const t = (e.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData)?.getData('text/plain') || '';
        document.execCommand('insertText', false, t);
      });
    }
  });
}

function initQuickEditLazyLoad(): void {
  const modal = document.getElementById('quickEditModal');
  if (!modal) return;

  // Hydrate first ~8 visible rows immediately
  const generalRows = Array.from(document.querySelectorAll('#quickEditGeneralBody .qe-lazy-row')) as HTMLTableRowElement[];
  const algRows = Array.from(document.querySelectorAll('#quickEditAlgorithmsBody .qe-lazy-row')) as HTMLTableRowElement[];
  generalRows.slice(0, 8).forEach(hydrateGeneralRow);
  algRows.slice(0, 8).forEach(hydrateAlgorithmsRow);

  // Render all remaining rows in small batches so the UI stays responsive
  const remainingGeneral = generalRows.slice(8);
  const remainingAlg = algRows.slice(8);
  const allRemaining = [...remainingGeneral, ...remainingAlg];
  let idx = 0;
  function renderNextBatch(): void {
    const batchSize = 10;
    const end = Math.min(idx + batchSize, allRemaining.length);
    for (; idx < end; idx++) {
      const row = allRemaining[idx];
      if (row.classList.contains('qe-lazy-row')) {
        if (row.dataset.tab === 'general') hydrateGeneralRow(row);
        else hydrateAlgorithmsRow(row);
      }
    }
    if (idx < allRemaining.length) {
      requestAnimationFrame(renderNextBatch);
    }
  }
  if (allRemaining.length > 0) requestAnimationFrame(renderNextBatch);
}

// ── Shape / parity helpers ────────────────────────────────────────────────────
function getCaseShapeData(caseName: string): ShapeIndexEntry | null {
  return CSPData.getShapeEntry(caseName);
}

function getCanonicalCaseNameForCell(cell: HTMLElement): string | null {
  const row = cell.closest('tr');
  if (!row) return null;
  return row.dataset.case || null;
}

const ALL_LEGAL_TOPS = [0, 1, 2, 3, 4, 5, -1, -2, -3, -4, -5, -6];
const ALL_LEGAL_BOTTOMS = [0, 1, 2, 3, 4, 5, -1, -2, -3, -4, -5, -6];

function tryFixAngle(algBody: string, canonicalShapeIdx: number): string | null {
  for (const t of ALL_LEGAL_TOPS) {
    for (const b of ALL_LEGAL_BOTTOMS) {
      const candidate = `(${t},${b})` + algBody;
      try {
        const result = algToShapeIndex(candidate);
        if (result.shapeIndex === canonicalShapeIdx) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function tryFixMirroredAngle(algBody: string, canonicalShapeIdx: number): string | null {
  for (const t of ALL_LEGAL_TOPS) {
    for (const b of ALL_LEGAL_BOTTOMS) {
      const candidate = `/(6,6)/(${t},${b})` + algBody;
      try {
        const result = algToShapeIndex(candidate);
        if (result.shapeIndex === canonicalShapeIdx) {
          return `(${t},${b})` + algBody;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function stripBeforeFirstSlash(alg: string): string {
  const firstSlash = alg.indexOf('/');
  if (firstSlash <= 0) return alg;
  return alg.slice(firstSlash);
}

function updateAlgorithmCellParity(cell: HTMLElement): void {
  const alg = (cell.textContent || '').trim();
  delete cell.dataset.parity;
  delete cell.dataset.mirrored;
  if (!alg || alg === 'Done!') {
    cell.style.color = '';
    cell.style.fontWeight = '';
    return;
  }

  const caseName = getCanonicalCaseNameForCell(cell);
  const canonicalIdx = caseName ? CSPData.getCanonicalShapeIndex(caseName) : null;
  const caseShapeData = caseName ? getCaseShapeData(caseName) : null;

  try {
    const result = algToShapeIndex(alg);
    const resultShapeIndex = result.shapeIndex;

    const isDirectMatch = canonicalIdx !== null && resultShapeIndex === canonicalIdx;
    const isInOrg = caseShapeData && caseShapeData.org && caseShapeData.org.includes(resultShapeIndex);
    const isInMir = caseShapeData && caseShapeData.mir && caseShapeData.mir.includes(resultShapeIndex);

    if (!isDirectMatch && !isInOrg && isInMir) cell.dataset.mirrored = '1';

    if (isDirectMatch || isInOrg) {
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

      if (isDirectMatch) {
        cell.dataset.parity = parityText === 'Odd' ? 'odd' : 'even';
        cell.style.color = parityText === 'Odd' ? 'var(--parity-odd)' : 'var(--parity-even)';
      } else {
        if (canonicalIdx !== null) {
          const algBody = stripBeforeFirstSlash(alg);
          const fixed = tryFixAngle(algBody, canonicalIdx);
          if (fixed) {
            cell.textContent = normalizeScramble(fixed);
          }
        }
        cell.dataset.parity = parityText === 'Odd' ? 'odd' : 'even';
        cell.style.color = parityText === 'Odd' ? 'var(--parity-odd)' : 'var(--parity-even)';
      }
      cell.style.fontWeight = '600';
    } else if (isInMir) {
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

      if (canonicalIdx !== null) {
        const algBody = stripBeforeFirstSlash(alg);
        const fixed = tryFixMirroredAngle(algBody, canonicalIdx);
        if (fixed) {
          cell.textContent = normalizeScramble(fixed);
        }
      }
      cell.dataset.parity = parityText === 'Odd' ? 'odd' : 'even';
      cell.style.color = parityText === 'Odd' ? 'var(--parity-odd-mirror)' : 'var(--parity-even-mirror)';
      cell.style.fontWeight = '600';
    } else {
      cell.style.color = 'var(--parity-invalid)';
      cell.style.fontWeight = '600';
    }
  } catch {
    cell.style.color = 'var(--parity-invalid)';
    cell.style.fontWeight = '600';
  }
}

function updateAlgorithmCellParityLive(cell: HTMLElement): void {
  const alg = (cell.textContent || '').trim();
  delete cell.dataset.mirrored;
  if (!alg || alg === 'Done!') {
    cell.style.color = '';
    cell.style.fontWeight = '';
    return;
  }

  const caseName = getCanonicalCaseNameForCell(cell);
  const canonicalIdx = caseName ? CSPData.getCanonicalShapeIndex(caseName) : null;
  const caseShapeData = caseName ? getCaseShapeData(caseName) : null;

  try {
    const normalized = normalizeScramble(expandForColorCheck(alg));
    const result = algToShapeIndex(normalized);
    const resultShapeIndex = result.shapeIndex;

    const isDirectMatch = canonicalIdx !== null && resultShapeIndex === canonicalIdx;
    const isInOrg = caseShapeData && caseShapeData.org && caseShapeData.org.includes(resultShapeIndex);
    const isInMir = caseShapeData && caseShapeData.mir && caseShapeData.mir.includes(resultShapeIndex);

    if (!isDirectMatch && !isInOrg && isInMir) cell.dataset.mirrored = '1';

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
      cell.style.color = parityText === 'Odd' ? 'var(--parity-odd)' : 'var(--parity-even)';
      cell.style.fontWeight = '600';
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
      cell.style.color = parityText === 'Odd' ? 'var(--parity-odd-mirror)' : 'var(--parity-even-mirror)';
      cell.style.fontWeight = '600';
    } else {
      cell.style.color = 'var(--parity-invalid)';
      cell.style.fontWeight = '600';
    }
  } catch {
    cell.style.color = 'var(--parity-invalid)';
    cell.style.fontWeight = '600';
  }
}

// ── Modal open / tabs / find & replace ────────────────────────────────────────
function setupQuickEditKeyboardShortcuts(): void {
  const modal = document.getElementById('quickEditModal');
  if (!modal) return;

  modal.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openQuickEditFindReplace();
    }
    if (e.key === 'Escape' && quickEditState.findReplaceOpen) {
      closeQuickEditFindReplace();
    }
  });
}

function switchQuickEditTab(tab: 'general' | 'algorithms'): void {
  if (tab === 'algorithms' && !enhancedAccess) {
    showToast('Enable Enhanced Access in Settings to edit algorithms', 2000, 'error');
    return;
  }

  quickEditState.currentTab = tab;

  document.querySelectorAll('.quick-edit-tab').forEach((t) => {
    if (t.classList.contains('active')) t.classList.remove('active');
  });
  document.querySelectorAll(`.quick-edit-tab[data-tab="${tab}"]`).forEach((t) => {
    t.classList.add('active');
  });

  const subtitle = document.getElementById('quickEditSubtitle');
  if (subtitle) {
    subtitle.textContent = tab === 'general' ? 'General Info' : 'Algorithms';
  }

  const generalTab = document.getElementById('quickEditGeneralTab');
  const algorithmsTab = document.getElementById('quickEditAlgorithmsTab');
  const addColumnsBtn = document.querySelector('.add-columns-btn-header');
  const varBtn = document.querySelector('.alg-variables-btn-header');

  if (generalTab && algorithmsTab) {
    if (tab === 'general') {
      generalTab.style.display = 'block';
      algorithmsTab.style.display = 'none';
      if (addColumnsBtn) (addColumnsBtn as HTMLElement).style.display = 'none';
      if (varBtn) (varBtn as HTMLElement).style.display = 'none';
    } else {
      generalTab.style.display = 'none';
      algorithmsTab.style.display = 'block';
      if (addColumnsBtn) (addColumnsBtn as HTMLElement).style.display = '';
      if (varBtn) (varBtn as HTMLElement).style.display = '';
      updateAlgorithmTableHeaders();
    }
  }

  if (quickEditState.findReplaceOpen) {
    closeQuickEditFindReplace();
  }
}

function toggleQuickEditTab(): void {
  if (window.innerWidth > 630) return;
  const newTab = quickEditState.currentTab === 'general' ? 'algorithms' : 'general';
  switchQuickEditTab(newTab);
}

function addAlgorithmColumns(): void {
  const tbody = document.getElementById('quickEditAlgorithmsBody');
  if (!tbody) return;

  quickEditState.visibleAlgColumns += 2;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach((row) => {
    const existingCells = row.querySelectorAll('.alg-cell');
    const currentCellCount = existingCells.length;

    if (currentCellCount < quickEditState.visibleAlgColumns) {
      for (let idx = currentCellCount; idx < quickEditState.visibleAlgColumns; idx++) {
        const td = document.createElement('td');
        td.className = 'editable alg-cell';
        td.contentEditable = 'true';
        td.dataset.field = `alg${idx}`;
        td.dataset.original = '';
        td.dataset.colIndex = String(idx);
        td.textContent = '';

        td.addEventListener('focus', () => {
          if (autoSelectTextOnFocus) {
            const range = document.createRange();
            range.selectNodeContents(td);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
          quickEditState.lastFocusedCell = td;
        });

        td.addEventListener('input', () => updateAlgorithmCellParityLive(td));

        td.addEventListener('blur', () => {
          const rawText = (td.textContent || '').trim();
          if (rawText && rawText !== 'Done!') {
            td.textContent = expandAndNormalize(rawText);
          }
          updateAlgorithmCellParity(td);
        });

        td.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData)?.getData('text/plain') || '';
          document.execCommand('insertText', false, text);
        });

        td.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const currentRow = td.closest('tr');
            const nextRow = currentRow?.nextElementSibling;
            if (nextRow) {
              const sameFieldCell = nextRow.querySelector(`[data-field="${td.dataset.field}"]`);
              if (sameFieldCell) (sameFieldCell as HTMLElement).focus();
            }
            return;
          }

          if (e.key === 'Tab') {
            e.preventDefault();
            const currentRow = td.closest('tr');
            const cells = Array.from(currentRow?.querySelectorAll('.editable') || []) as HTMLElement[];
            const currentIndex = cells.indexOf(td);

            if (e.shiftKey) {
              if (currentIndex > 0) cells[currentIndex - 1].focus();
            } else {
              if (currentIndex < cells.length - 1) cells[currentIndex + 1].focus();
            }
            return;
          }
        });

        row.appendChild(td);
      }
    }
  });

  updateAlgorithmTableHeaders();
  updateAlgorithmTableCells();
  const visibleCount = document.getElementById('visibleColumnCount');
  if (visibleCount) visibleCount.textContent = String(quickEditState.visibleAlgColumns);
}

function updateAlgorithmTableHeaders(): void {
  const headerRow = document.getElementById('algorithmTableHeader');
  if (!headerRow) return;

  while (headerRow.children.length > 1) {
    headerRow.removeChild(headerRow.lastChild as Node);
  }

  for (let i = 0; i < quickEditState.visibleAlgColumns; i++) {
    const th = document.createElement('th');
    th.className = 'alg-header';
    th.textContent = `Alg ${i + 1}`;
    headerRow.appendChild(th);
  }
}

function updateAlgorithmTableCells(): void {
  const tbody = document.getElementById('quickEditAlgorithmsBody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('.alg-cell');
    cells.forEach((cell, idx) => {
      const el = cell as HTMLElement;
      if (idx < quickEditState.visibleAlgColumns) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  });
}

// ── Find and replace ──────────────────────────────────────────────────────────
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openQuickEditFindReplace(): void {
  const findReplace = document.getElementById('quickEditFindReplace') as HTMLElement;
  const findInput = document.getElementById('quickEditFindInput') as HTMLInputElement;
  const scopeSelector = document.getElementById('quickEditScopeSelector') as HTMLSelectElement;

  findReplace.style.display = 'block';
  quickEditState.findReplaceOpen = true;

  if (!findReplace.dataset.dragInitialized) {
    initializeFindReplaceDrag(findReplace);
    findReplace.dataset.dragInitialized = 'true';
  }

  const draggable = findReplace as unknown as { resetPosition?: () => void };
  if (draggable.resetPosition) {
    draggable.resetPosition();
  }

  const notesCells = document.querySelectorAll('.notes-cell');
  notesCells.forEach((cell) => {
    const rawHTML = (cell as HTMLElement).dataset.rawHtml || '';
    cell.textContent = rawHTML;
  });

  if (quickEditState.currentTab === 'general') {
    scopeSelector.disabled = false;
    if (quickEditState.lastFocusedCell) {
      const field = quickEditState.lastFocusedCell.dataset.field;
      const scopeMap: Record<string, string> = {
        displayName: 'name',
        subtitle: 'subtitle',
        notes: 'notes',
      };
      scopeSelector.value = (field && scopeMap[field]) || 'global';
    } else {
      scopeSelector.value = 'global';
    }
  } else {
    scopeSelector.disabled = false;
    scopeSelector.value = 'all';
  }

  findInput.focus();
  findInput.select();
}

function closeQuickEditFindReplace(): void {
  const findReplace = document.getElementById('quickEditFindReplace');
  if (findReplace) findReplace.style.display = 'none';
  quickEditState.findReplaceOpen = false;
  quickEditState.currentFindIndex = -1;
  quickEditState.findMatches = [];

  clearFindHighlights();

  const notesCells = document.querySelectorAll('.notes-cell');
  notesCells.forEach((cell) => {
    const el = cell as HTMLElement;
    const rawHTML = el.dataset.rawHtml || (el.textContent || '').trim();
    el.dataset.rawHtml = rawHTML;
    el.innerHTML = sanitizeNoteHTML(rawHTML);
  });
}

function liveSearchQuickEdit(): void {
  const findInput = document.getElementById('quickEditFindInput') as HTMLInputElement;
  const searchTerm = findInput.value;

  clearFindHighlights();
  quickEditState.findMatches = [];
  quickEditState.allMatchRanges = [];
  quickEditState.currentFindIndex = -1;

  const notesCells = document.querySelectorAll('.notes-cell');
  notesCells.forEach((cell) => {
    const rawHTML = (cell as HTMLElement).dataset.rawHtml || '';
    cell.textContent = rawHTML;
  });

  if (!searchTerm) {
    const count = document.getElementById('quickEditMatchCount');
    if (count) count.textContent = 'No matches';
    return;
  }

  const modal = document.getElementById('quickEditModal');
  if (!modal) return;
  let cells: HTMLElement[];

  if (quickEditState.currentTab === 'general') {
    const scopeSelector = document.getElementById('quickEditScopeSelector') as HTMLSelectElement;
    const scope = scopeSelector ? scopeSelector.value : 'global';

    if (scope === 'global') {
      cells = Array.from(modal.querySelectorAll('#quickEditGeneralTab .editable')) as HTMLElement[];
    } else {
      const fieldMap: Record<string, string> = {
        name: 'displayName',
        subtitle: 'subtitle',
        notes: 'notes',
      };
      const field = fieldMap[scope];
      cells = Array.from(modal.querySelectorAll(`.editable[data-field="${field}"]`)) as HTMLElement[];
    }
  } else {
    cells = Array.from(modal.querySelectorAll('.alg-cell')) as HTMLElement[];
  }

  const searchLower = searchTerm.toLowerCase();
  cells.forEach((cell) => {
    const text = cell.textContent || '';
    const textLower = text.toLowerCase();
    let pos = 0;

    while ((pos = textLower.indexOf(searchLower, pos)) !== -1) {
      quickEditState.findMatches.push(cell);
      quickEditState.allMatchRanges.push({ cell, start: pos, end: pos + searchTerm.length });
      pos += searchTerm.length;
    }
  });

  const countEl = document.getElementById('quickEditMatchCount');
  if (!countEl) return;
  if (quickEditState.findMatches.length === 0) {
    countEl.textContent = 'No matches';
    return;
  }

  highlightAllMatches();

  quickEditState.currentFindIndex = 0;
  highlightCurrentMatch();

  countEl.textContent = `${quickEditState.currentFindIndex + 1} of ${quickEditState.findMatches.length}`;
}

function highlightAllMatches(): void {
  quickEditState.allMatchRanges.forEach((range) => {
    if (range.cell.classList.contains('notes-cell')) {
      const rawText = range.cell.textContent || '';
      const before = rawText.substring(0, range.start);
      const match = rawText.substring(range.start, range.end);
      const after = rawText.substring(range.end);
      range.cell.textContent = before + match + after;

      range.cell.innerHTML =
        escapeHtml(before) + `<mark class="find-match-highlight">${escapeHtml(match)}</mark>` + escapeHtml(after);
    } else {
      const text = range.cell.textContent || '';
      range.cell.innerHTML =
        text.substring(0, range.start) +
        `<span class="find-match-highlight">${text.substring(range.start, range.end)}</span>` +
        text.substring(range.end);
    }
  });
}

function highlightCurrentMatch(): void {
  document.querySelectorAll('.find-match-current').forEach((el) => {
    el.classList.remove('find-match-current');
  });

  if (quickEditState.currentFindIndex >= 0 && quickEditState.currentFindIndex < quickEditState.findMatches.length) {
    const currentCell = quickEditState.findMatches[quickEditState.currentFindIndex];
    const highlights = currentCell.querySelectorAll('.find-match-highlight');

    let cellMatchIndex = 0;
    for (let i = 0; i < quickEditState.currentFindIndex; i++) {
      if (quickEditState.findMatches[i] === currentCell) {
        cellMatchIndex++;
      }
    }

    if (highlights[cellMatchIndex]) {
      highlights[cellMatchIndex].classList.add('find-match-current');
      highlights[cellMatchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function clearFindHighlights(): void {
  const modal = document.getElementById('quickEditModal');
  if (!modal) return;

  const cells = modal.querySelectorAll('.editable');
  cells.forEach((cellEl) => {
    const cell = cellEl as HTMLElement;
    if (cell.querySelector('.find-match-highlight') || cell.querySelector('mark.find-match-highlight')) {
      if (cell.classList.contains('notes-cell')) {
        const rawHtml = cell.dataset.rawHtml || '';
        cell.textContent = rawHtml;
      } else {
        const plainText = cell.textContent || '';
        cell.textContent = plainText;
      }
    }
  });
}

function findNextQuickEdit(): void {
  if (quickEditState.findMatches.length === 0) return;

  quickEditState.currentFindIndex = (quickEditState.currentFindIndex + 1) % quickEditState.findMatches.length;
  highlightCurrentMatch();

  const countEl = document.getElementById('quickEditMatchCount');
  if (countEl) countEl.textContent = `${quickEditState.currentFindIndex + 1} of ${quickEditState.findMatches.length}`;
}

function findPreviousQuickEdit(): void {
  if (quickEditState.findMatches.length === 0) return;

  quickEditState.currentFindIndex = quickEditState.currentFindIndex - 1;
  if (quickEditState.currentFindIndex < 0) {
    quickEditState.currentFindIndex = quickEditState.findMatches.length - 1;
  }

  highlightCurrentMatch();

  const countEl = document.getElementById('quickEditMatchCount');
  if (countEl) countEl.textContent = `${quickEditState.currentFindIndex + 1} of ${quickEditState.findMatches.length}`;
}

function replaceQuickEdit(): void {
  const findInput = document.getElementById('quickEditFindInput') as HTMLInputElement;
  const replaceInput = document.getElementById('quickEditReplaceInput') as HTMLInputElement;
  const searchTerm = findInput.value;
  const replaceTerm = replaceInput.value;

  if (!searchTerm || quickEditState.findMatches.length === 0) return;

  const currentMatch = quickEditState.findMatches[quickEditState.currentFindIndex];
  const text = currentMatch.textContent || '';
  const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  currentMatch.textContent = text.replace(regex, replaceTerm);

  if (currentMatch.classList.contains('alg-cell')) {
    updateAlgorithmCellParity(currentMatch);
  }

  liveSearchQuickEdit();
}

function replaceAllQuickEdit(): void {
  const findInput = document.getElementById('quickEditFindInput') as HTMLInputElement;
  const replaceInput = document.getElementById('quickEditReplaceInput') as HTMLInputElement;
  const searchTerm = findInput.value;
  const replaceTerm = replaceInput.value;

  if (!searchTerm) return;

  const modal = document.getElementById('quickEditModal');
  if (!modal) return;
  let cells: HTMLElement[];

  if (quickEditState.currentTab === 'general') {
    const scopeSelector = document.getElementById('quickEditScopeSelector') as HTMLSelectElement;
    const scope = scopeSelector ? scopeSelector.value : 'global';
    if (scope === 'global') {
      cells = Array.from(modal.querySelectorAll('#quickEditGeneralTab .editable')) as HTMLElement[];
    } else {
      const fieldMap: Record<string, string> = {
        name: 'displayName',
        subtitle: 'subtitle',
        notes: 'notes',
      };
      const field = fieldMap[scope];
      cells = Array.from(modal.querySelectorAll(`.editable[data-field="${field}"]`)) as HTMLElement[];
    }
  } else {
    cells = Array.from(modal.querySelectorAll('.alg-cell')) as HTMLElement[];
  }

  let replaceCount = 0;
  const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  cells.forEach((cell) => {
    const text = cell.textContent || '';
    if (regex.test(text)) {
      cell.textContent = text.replace(regex, replaceTerm);
      replaceCount++;

      if (cell.classList.contains('alg-cell')) {
        updateAlgorithmCellParity(cell);
      }
    }
  });

  showToast(`Replaced ${replaceCount} occurrences`, 2000, 'success');

  liveSearchQuickEdit();
}

function handleReplaceEnter(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    replaceQuickEdit();
  }
}

function changeFindScope(): void {
  const scopeSelector = document.getElementById('quickEditScopeSelector') as HTMLSelectElement;
  if (!scopeSelector) return;

  quickEditState.findReplaceScope = scopeSelector.value;
  liveSearchQuickEdit();
}

// ── Save / close / revert ─────────────────────────────────────────────────────
function replaceDisplayNames(next: Record<string, string>): void {
  Object.keys(displayNames).forEach((k) => delete displayNames[k]);
  Object.assign(displayNames, next);
}

function replaceMap<T>(target: Map<number, T>, next: Map<number, T>): void {
  target.clear();
  next.forEach((v, k) => target.set(k, v));
}

function takeSnapshot(): AlgVarsSnapshot {
  return {
    displayNames: { ...displayNames },
    perCaseSubtitles: new Map(perCaseSubtitles),
    comments: new Map(comments),
    customAlgorithms: new Map(customAlgorithms),
  };
}

function saveQuickEditChanges(): void {
  const modal = document.getElementById('quickEditModal');
  if (!modal) return;

  const generalRows = modal.querySelectorAll('#quickEditGeneralBody tr');
  generalRows.forEach((row) => {
    const caseName = (row as HTMLElement).dataset.case;
    if (!caseName) return;
    const caseId = Number(caseName);
    const displayNameCell = row.querySelector('[data-field="displayName"]') as HTMLElement;
    const subtitleCell = row.querySelector('[data-field="subtitle"]') as HTMLElement;
    const notesCell = row.querySelector('[data-field="notes"]') as HTMLElement;

    const displayName = (displayNameCell.textContent || '').trim();
    const subtitle = (subtitleCell.textContent || '').trim();
    const notes = notesCell.dataset.rawHtml || (notesCell.textContent || '').trim();

    if (displayName) {
      displayNames[caseId] = displayName;
    }

    if (subtitle) {
      perCaseSubtitles.set(caseId, subtitle);
    } else {
      perCaseSubtitles.delete(caseId);
    }

    if (notes) {
      comments.set(caseId, notes);
    } else {
      comments.delete(caseId);
    }

    displayNameCell.dataset.original = displayName;
    subtitleCell.dataset.original = subtitle;
    notesCell.dataset.original = notes;
    notesCell.dataset.rawHtml = notes;
  });

  const algoRows = modal.querySelectorAll('#quickEditAlgorithmsBody tr');
  algoRows.forEach((row) => {
    const caseName = (row as HTMLElement).dataset.case;
    if (!caseName) return;
    const caseId = Number(caseName);
    const algCells = row.querySelectorAll('.alg-cell');

    algCells.forEach((cell) => updateAlgorithmCellParity(cell as HTMLElement));
    const algs = Array.from(algCells)
      .map((cell) => ((cell as HTMLElement).textContent || '').trim())
      .filter((alg) => alg);

    if (algs.length > 0) {
      const odd: string[] = [];
      const even: string[] = [];
      algCells.forEach((cell) => {
        const alg = ((cell as HTMLElement).textContent || '').trim();
        if (!alg) return;
        if ((cell as HTMLElement).dataset.parity === 'odd') odd.push(alg);
        else if ((cell as HTMLElement).dataset.parity === 'even') even.push(alg);
      });
      customAlgorithms.set(caseId, {
        odd,
        even,
      });
    } else {
      customAlgorithms.delete(caseId);
    }

    algCells.forEach((cell) => {
      (cell as HTMLElement).dataset.original = ((cell as HTMLElement).textContent || '').trim();
    });
  });

  quickEditInitialState = takeSnapshot();

  calculateAndCacheAllParity();

  saveState();
  notify();

  showToast('All changes saved successfully!', 2000, 'success');
}

function forceCloseQuickEditModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('quickEditModal');
    if (modal) {
      modal.remove();
      document.body.classList.remove('modal-open');
    }

    quickEditState = {
      currentTab: 'general',
      findReplaceOpen: false,
      findReplaceScope: null,
      currentFindIndex: -1,
      findMatches: [],
      lastFocusedCell: null,
      allMatchRanges: [],
      visibleAlgColumns: 6,
    };
  });
}

function closeQuickEditModal(): void {
  const modal = document.getElementById('quickEditModal');
  if (!modal) return;

  let hasChanges = false;

  const generalRows = modal.querySelectorAll('#quickEditGeneralBody tr');
  generalRows.forEach((row) => {
    const cells = row.querySelectorAll('.editable');
    cells.forEach((cellEl) => {
      const cell = cellEl as HTMLElement;
      const original = cell.dataset.original || '';
      let current: string;

      if (cell.classList.contains('notes-cell')) {
        current = cell.dataset.rawHtml || '';
      } else {
        current = (cell.textContent || '').trim();
      }

      if (original !== current) {
        hasChanges = true;
      }
    });
  });

  const algoRows = modal.querySelectorAll('#quickEditAlgorithmsBody tr');
  algoRows.forEach((row) => {
    const cells = row.querySelectorAll('.alg-cell');
    cells.forEach((cellEl) => {
      const cell = cellEl as HTMLElement;
      const original = cell.dataset.original || '';
      const current = (cell.textContent || '').trim();
      if (original !== current) {
        hasChanges = true;
      }
    });
  });

  if (hasChanges) {
    showSaveDiscardConfirmation(
      'You have unsaved changes. What would you like to do?',
      () => {
        saveQuickEditChanges();
        forceCloseQuickEditModal();
      },
      () => {
        forceCloseQuickEditModal();
      },
      () => {
        // Cancel - do nothing
      },
    );
    return;
  }

  forceCloseQuickEditModal();
}

function revertQuickEditChanges(): void {
  if (!quickEditInitialState) return;

  showConfirmation(
    'Are you sure you want to revert all changes to the last save point?',
    () => {
      replaceDisplayNames(quickEditInitialState!.displayNames);
      replaceMap(perCaseSubtitles, quickEditInitialState!.perCaseSubtitles);
      replaceMap(comments, quickEditInitialState!.comments);
      replaceMap(customAlgorithms, quickEditInitialState!.customAlgorithms);

      closeQuickEditModal();
      openQuickEditModal();

      showToast('Reverted to last save point', 2000, 'info');
    },
    null,
  );
}

// ── Open modal ────────────────────────────────────────────────────────────────
export function openQuickEditModal(): void {
  if (document.getElementById('quickEditModal')) return;
  closeAllModalStates();

  if (typeof (window as unknown as { closeTransientOverlays?: () => void }).closeTransientOverlays === 'function') {
    (window as unknown as { closeTransientOverlays: () => void }).closeTransientOverlays();
  }

  quickEditInitialState = takeSnapshot();

  const modal = document.createElement('div');
  modal.className = 'quick-edit-fullscreen';
  modal.id = 'quickEditModal';

  modal.innerHTML = `
        <div class="quick-edit-screen">
            <div class="quick-edit-header">
                <div class="quick-edit-header-left">
                    <div class="quick-edit-title-wrapper">
                        <h2 onclick="toggleQuickEditTab()">Quick Edit</h2>
                        <button class="quick-edit-icon-btn instruction-btn" onclick="showQuickEditInfoModal()" title="Help">
                            <span class="themed-icon themed-icon--info" aria-hidden="true"></span>
                        </button>
                    </div>
                    <div class="quick-edit-subtitle" id="quickEditSubtitle">General Info</div>
                    <div class="quick-edit-tabs">
                        <button class="quick-edit-tab active" data-tab="general" onclick="switchQuickEditTab('general')">General Info</button>
                        <button class="quick-edit-tab" data-tab="algorithms" onclick="switchQuickEditTab('algorithms')">Algorithms</button>
                    </div>
                </div>
                <div class="quick-edit-header-right">
                    <button class="quick-edit-icon-btn add-columns-btn-header" onclick="addAlgorithmColumns()" title="Show 2 more columns" style="display: none;">
                        +2
                    </button>
                    <button class="quick-edit-icon-btn alg-variables-btn-header" onclick="openAlgVariablesModal()" title="Algorithm Variables" style="display: none;">
                        <span class="themed-icon themed-icon--variables" aria-hidden="true"></span>
                    </button>
                    <button class="quick-edit-icon-btn" onclick="openQuickEditFindReplace()" title="Find and Replace (Ctrl+F)">
                        <span class="themed-icon themed-icon--search" aria-hidden="true"></span>
                    </button>
                    <button class="quick-edit-icon-btn" onclick="saveQuickEditChanges()" title="Save changes">
                        <span class="themed-icon themed-icon--save" aria-hidden="true"></span>
                    </button>
                    <button class="quick-edit-icon-btn" onclick="closeQuickEditModal()" title="Exit">
                        <span class="themed-icon themed-icon--exit" aria-hidden="true"></span>
                    </button>
                </div>
            </div>

            <div class="quick-edit-find-replace-popup" id="quickEditFindReplace" style="display: none;">
                <div class="find-replace-header">
                    <span>Find and Replace</span>
                    <button class="close-find-btn" onclick="closeQuickEditFindReplace()" title="Close (Esc)">&times;</button>
                </div>
                <div class="find-replace-inputs">
                    <div class="find-input-row">
                        <input type="text" id="quickEditFindInput" placeholder="Find" oninput="liveSearchQuickEdit()">
                        <div class="find-nav-buttons">
                            <button onclick="findPreviousQuickEdit()" title="Previous match">
                                <span class="themed-icon themed-icon--previous" aria-hidden="true"></span>
                            </button>
                            <button onclick="findNextQuickEdit()" title="Next match">
                                <span class="themed-icon themed-icon--next" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>
                    <div class="replace-input-row">
                        <input type="text" id="quickEditReplaceInput" placeholder="Replace" onkeypress="handleReplaceEnter(event)">
                        <div class="replace-buttons">
                            <button onclick="replaceQuickEdit()" title="Replace (Enter)">Replace</button>
                            <button onclick="replaceAllQuickEdit()" title="Replace All">Replace All</button>
                        </div>
                    </div>
                </div>
                <div class="find-replace-footer">
                    <div class="scope-selector">
                        <label>Scope:</label>
                        <select id="quickEditScopeSelector" onchange="changeFindScope()">
                            <option value="name">Display Name</option>
                            <option value="subtitle">Subtitle</option>
                            <option value="notes">Notes</option>
                            <option value="global">Global (All General)</option>
                            <option value="all">All Algorithms</option>
                        </select>
                    </div>
                    <span id="quickEditMatchCount">No matches</span>
                </div>
            </div>

            <div class="quick-edit-body">
                <div class="quick-edit-content" id="quickEditGeneralTab">
                    <table class="quick-edit-table">
                        <thead>
                            <tr>
                                <th>Case Name</th>
                                <th>Display Name</th>
                                <th>Subtitle</th>
                                <th class="notes-header">Notes</th>
                                ${evilnessFactor ? '<th style="text-align:center;">Evil</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="quickEditGeneralBody">
                            ${generateGeneralTableRowsShell()}
                        </tbody>
                    </table>
                </div>

                <div class="quick-edit-content" id="quickEditAlgorithmsTab" style="display: none;">
                    <table class="quick-edit-table algorithms-table">
                        <thead>
                            <tr id="algorithmTableHeader">
                                <th class="display-name-header" style="white-space:nowrap;">Display Name</th>
                            </tr>
                        </thead>
                        <tbody id="quickEditAlgorithmsBody">
                            ${generateAlgorithmsTableRowsShell()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  pushModalState('quickEditModal', closeQuickEditModal);

  const observer = new MutationObserver(() => {
    modal.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || '');
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  modal.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || '');

  setupQuickEditKeyboardShortcuts();

  initQuickEditLazyLoad();
}

// ── Info modal ────────────────────────────────────────────────────────────────
function showQuickEditInfoModal(): void {
  let infoModal = document.getElementById('quickEditInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'quickEditInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">Quick Edit Guide</span>
                    <button class="training-info-close" onclick="closeQuickEditInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-text"><b>Quick Edit</b> is a place for you to bulk edit cases.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text"><strong>General Info Tab:</strong> <b>Edit</b> display names, subtitles, and notes for all cases. Notes support HTML formatting, but you don't have to use it. If you do, you will be writing without syntax support, but when you click away from the cell, the HTML will render.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text"><strong>Algorithms Tab:</strong> <b>Edit</b> algorithms for all cases. Algorithms are auto-normalized when you click away from the cell <span style="font-weight:500">(so you can write 1043'2'1'-3-3 as algorithm and the cell will fix itself)</span>. They are also color-coded in real time by parity and validity: <span style="color: var(--parity-odd); font-weight: 600;">green = odd</span>, <span style="color: var(--parity-even); font-weight: 600;">blue = even</span>, <span style="color: var(--parity-odd-mirror); font-weight: 600;">dark-green = odd (mirrored)</span>, <span style="color: var(--parity-even-mirror); font-weight: 600;">dark-blue = even (mirrored)</span>, <span style="color: var(--parity-invalid); font-weight: 600;">red = invalid</span> (either doesn't solve the case or does not lead to valid squan position at all).</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text"><strong>Switch Tabs:</strong> To switch between the <b>General Info</b> tab and the <b>Algorithms</b>, directly click on their names. For smaller screens like phones, the tab switch might not be obvious. You have to click on the title "<b>Quick Edit</b>" to change tabs.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">4</div>
                        <div class="training-info-text"><strong>Reveal Columns:</strong> It is not hardcoded that you can have at most 6 algorithms for a case. Click +2 in the Algorithms tab to reveal more columns as needed.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">5</div>
                        <div class="training-info-text"><strong>Navigation:</strong> Use Tab to move one cell to the right, Shift+Tab for one cell to the left. Use Enter to move one cell down.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">6</div>
                        <div class="training-info-text"><strong>Find and Replace:</strong> Press Ctrl+F (or Cmd+F on Mac) or directly press the search button on top to open find and replace popup. You can move the popup around by clicking and dragging. Select scope to search in specific fields, e.g. only in titles. Use Previous/Next arrow keys to navigate matches.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">7</div>
                        <div class="training-info-text"><strong>Variable Table:</strong> While in the algorithm tab, press the <b>"var"</b> button on the toolbar to access variable table. There you can store commonly used algorithm parts <b>(</b>like, <span style="font-weight:500">scal-kite=/(-1,-2)/(-3,0)/</span><b>)</b> and you can reuse them anywhere. To reuse the variable, wrap it around two colons (:variableName:). (ie, the algorithm for <span style="font-weight:500">left 5-1/pair</span> can be written as <span style="font-weight:500">/(-2,3):scal-kite:</span> provided that you have scal-kite saved in the variable table.). The variable will expand when you click away. The color-coding works even with variables.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">7</div>
                        <div class="training-info-text"><strong>Save:</strong> Click Save to apply all changes. Exit without saving to <b>discard all the changes</b></div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }

  infoModal.classList.add('active');
  pushModalState('quickEditInfoModal', _hideQuickEditInfoModal);
}

function _hideQuickEditInfoModal(): void {
  const modal = document.getElementById('quickEditInfoModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function closeQuickEditInfoModal(): void {
  closeModalWithHistory(_hideQuickEditInfoModal);
}

// ── Algorithm variables modal ─────────────────────────────────────────────────
function algVarRowHTML(name: string, value: string): string {
  return `
        <tr class="alg-var-row">
            <td style="padding: 6px 6px;">
                <input class="alg-var-name" type="text" value="${name}" placeholder="name"
                    style="width:100%; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px; background:var(--surface2); color:var(--text-ui); font-size:0.9rem; font-family: monospace;">
            </td>
            <td style="padding: 6px 6px;">
                <input class="alg-var-value" type="text" value="${value}" placeholder="e.g. /(3,0)/(2,2)/"
                    style="width:100%; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px; background:var(--surface2); color:var(--text-ui); font-size:0.9rem; font-family: monospace;"
                    onblur="this.value = this.value.trim() && this.value.trim() !== 'Done!' && window.ScrambleNormalizer ? window.ScrambleNormalizer.normalizeScramble(this.value.trim()) : this.value.trim()">
            </td>
            <td style="padding: 6px 4px; text-align:center;">
                <button onclick="this.closest('tr').remove()" style="
                    background: var(--delete-btn-bg); border: none; border-radius: 5px;
                    color: var(--text-ui); cursor: pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center;
                "><span class="themed-icon themed-icon--delete" aria-hidden="true" style="width:14px;height:14px;"></span></button>
            </td>
        </tr>
    `;
}

function renderAlgVarRows(): string {
  if (!algVariables || algVariables.size === 0) return '';
  return Array.from(algVariables.entries())
    .map(([name, value]) => algVarRowHTML(name, value))
    .join('');
}

function openAlgVariablesModal(): void {
  const existing = document.getElementById('algVariablesModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'algVariablesModal';
  modal.style.cssText = `
        position: fixed; inset: 0; z-index: 10100;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.5);
    `;

  modal.innerHTML = `
        <div style="
            background: var(--surface);
            border-radius: 14px;
            width: min(560px, 95vw);
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            border: 1px solid var(--surface-border);
        ">
            <div style="
                display: flex; align-items: center; justify-content: space-between;
                padding: 18px 22px; border-bottom: 1px solid var(--surface-border);
                background: var(--modal-header-bg); flex-shrink: 0;
            ">
                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-ui);">Algorithm Variables</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button onclick="saveAlgVariables()" style="
                        padding: 7px 18px; background: var(--accent); color: var(--text-on-color);
                        border: none; border-radius: 7px; cursor: pointer; font-weight: 600; font-size: 0.9rem;
                    ">Save</button>
                    <button onclick="closeAlgVariablesModal()" style="
                        background: none; border: none; cursor: pointer; font-size: 1.5rem;
                        color: var(--sidebar-close-color); line-height: 1; padding: 2px 6px;
                    ">&times;</button>
                </div>
            </div>
            <div style="padding: 14px 22px 6px; flex-shrink: 0; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; background: var(--surface);">
                Use <code style="background:var(--surface2);border:1px solid var(--border-color);padding:1px 5px;border-radius:4px;font-size:0.82rem;color:var(--text-ui);">:varName:</code> inside any algorithm to insert the variable's value at defocus.
                Variable values are normalized when you click away.
            </div>
            <div style="overflow-y: auto; flex: 1; padding: 10px 22px 18px;">
                <table style="width:100%; border-collapse: collapse;" id="algVarTable">
                    <thead style="background: var(--surface2); position: sticky; top: 0;">
                        <tr>
                            <th style="text-align:left; padding: 8px 6px; font-size:0.85rem; color:var(--text-secondary); border-bottom:1px solid var(--surface-border); width:28%;">Name</th>
                            <th style="text-align:left; padding: 8px 6px; font-size:0.85rem; color:var(--text-secondary); border-bottom:1px solid var(--surface-border);">Value</th>
                            <th style="width:36px; border-bottom:1px solid var(--surface-border); background: var(--surface2);"></th>
                        </tr>
                    </thead>
                    <tbody id="algVarTableBody">
                        ${renderAlgVarRows()}
                    </tbody>
                </table>
                <button onclick="addAlgVarRow()" style="
                    margin-top: 12px; padding: 7px 16px; background: var(--surface2);
                    border: 1px dashed var(--border-color); border-radius: 7px;
                    cursor: pointer; font-size: 0.9rem; color: var(--text-ui);
                    width: 100%; transition: background 0.15s;
                " onmouseover="this.style.background='var(--surface-border)'" onmouseout="this.style.background='var(--surface2)'">+ Add Variable</button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  attachOverlayClose(modal, closeAlgVariablesModal);
  pushModalState('algVariablesModal', closeAlgVariablesModal);
}

function closeAlgVariablesModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('algVariablesModal');
    if (modal) modal.remove();
  });
}

function addAlgVarRow(): void {
  const tbody = document.getElementById('algVarTableBody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'alg-var-row';
  const inner = algVarRowHTML('', '').match(/<tr[^>]*>([\s\S]*)<\/tr>/)?.[1] || '';
  tr.innerHTML = inner;
  tbody.appendChild(tr);
  (tr.querySelector('.alg-var-name') as HTMLInputElement | null)?.focus();
}

function saveAlgVariables(): void {
  const rows = document.querySelectorAll('#algVarTableBody .alg-var-row');
  algVariables.clear();
  rows.forEach((row) => {
    const name = (row.querySelector('.alg-var-name') as HTMLInputElement).value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    const value = (row.querySelector('.alg-var-value') as HTMLInputElement).value.trim();
    if (name && value) algVariables.set(name, value);
  });
  saveState();
  document.getElementById('algVariablesModal')?.remove();
  showToast('Variables saved!', 2000, 'success');
}

// ── Drag functionality for find/replace popup ─────────────────────────────────
function initializeFindReplaceDrag(popup: HTMLElement): void {
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;

  const header = popup.querySelector('.find-replace-header') as HTMLElement;

  header.style.cursor = 'move';

  header.addEventListener('mousedown', dragStart);
  header.addEventListener('touchstart', dragStart);

  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag);

  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchend', dragEnd);

  const popupWithReset = popup as unknown as { resetPosition?: () => void };
  popupWithReset.resetPosition = function () {
    currentX = 0;
    currentY = 0;
    popup.style.transform = 'translate(0, 0)';
  };

  function dragStart(e: MouseEvent | TouchEvent): void {
    if (e.type === 'touchstart') {
      const touch = (e as TouchEvent).touches[0];
      initialX = touch.clientX - currentX;
      initialY = touch.clientY - currentY;
    } else {
      const mouse = e as MouseEvent;
      initialX = mouse.clientX - currentX;
      initialY = mouse.clientY - currentY;
    }

    if (e.target === header || header.contains(e.target as Node)) {
      isDragging = true;
    }
  }

  function drag(e: MouseEvent | TouchEvent): void {
    if (isDragging) {
      e.preventDefault();

      if (e.type === 'touchmove') {
        const touch = (e as TouchEvent).touches[0];
        currentX = touch.clientX - initialX;
        currentY = touch.clientY - initialY;
      } else {
        const mouse = e as MouseEvent;
        currentX = mouse.clientX - initialX;
        currentY = mouse.clientY - initialY;
      }

      popup.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
  }

  function dragEnd(): void {
    isDragging = false;
  }
}

// ── Window shims ──────────────────────────────────────────────────────────────
export function installQuickEditShims(): void {
  const w = window as unknown as Record<string, unknown>;
  w.openQuickEditModal = openQuickEditModal;
  w.closeQuickEditModal = closeQuickEditModal;
  w.revertQuickEditChanges = revertQuickEditChanges;
  w.switchQuickEditTab = switchQuickEditTab;
  w.toggleQuickEditTab = toggleQuickEditTab;
  w.findNextQuickEdit = findNextQuickEdit;
  w.findPreviousQuickEdit = findPreviousQuickEdit;
  w.replaceQuickEdit = replaceQuickEdit;
  w.replaceAllQuickEdit = replaceAllQuickEdit;
  w.saveQuickEditChanges = saveQuickEditChanges;
  w.openQuickEditFindReplace = openQuickEditFindReplace;
  w.closeQuickEditFindReplace = closeQuickEditFindReplace;
  w.liveSearchQuickEdit = liveSearchQuickEdit;
  w.handleReplaceEnter = handleReplaceEnter;
  w.changeFindScope = changeFindScope;
  w.addAlgorithmColumns = addAlgorithmColumns;
  w.openAlgVariablesModal = openAlgVariablesModal;
  w.closeAlgVariablesModal = closeAlgVariablesModal;
  w.saveAlgVariables = saveAlgVariables;
  w.addAlgVarRow = addAlgVarRow;
  w.showQuickEditInfoModal = showQuickEditInfoModal;
  w.closeQuickEditInfoModal = closeQuickEditInfoModal;
  w.setAutoSelectTextOnFocus = (enabled: boolean) => {
    autoSelectTextOnFocus = enabled;
    localStorage.setItem('autoSelectTextOnFocus', enabled.toString());
  };
}
