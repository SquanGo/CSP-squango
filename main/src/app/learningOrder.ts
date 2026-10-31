import { getCaseId } from '../data/cases';
import {
  data,
  getDisplayName,
  getLearningOrder,
  isUniformProbabilityGroup,
  setLearningOrder,
  type SortMode,
} from './state';
import { showSaveDiscardConfirmation } from './confirm';
import {
  attachOverlayClose,
  closeModalWithHistory,
  getTopModalId,
  lockScroll,
  pushModalState,
  removeCloseModalFromStack,
  unlockScroll,
} from './modal';

type EditorEntry = number | number[];
type DragState = { caseId?: number; entryIndex?: number };

let editorEntries: EditorEntry[] = [];
let initialEntries: EditorEntry[] = [];
let undoStack: EditorEntry[][] = [];
let redoStack: EditorEntry[][] = [];
let selectedCase: number | null = null;
let selectedEntry = -1;
let modal: HTMLElement | null = null;

function cloneEntries(entries: EditorEntry[]): EditorEntry[] {
  return entries.map((entry) => (Array.isArray(entry) ? [...entry] : entry));
}

function getDefaultEntries(): EditorEntry[] {
  return [...data]
    .sort((a, b) => b.probability - a.probability)
    .map((item) => item.id);
}

function getInitialEntries(): EditorEntry[] {
  const configured = getLearningOrder();
  if (!configured) return getDefaultEntries();

  const used = new Set<number>();
  const entries: EditorEntry[] = [];
  for (const entry of configured) {
    const ids = (Array.isArray(entry) ? entry : [entry]).filter((id) => !used.has(id));
    ids.forEach((id) => used.add(id));
    if (ids.length === 1 && !Array.isArray(entry)) entries.push(ids[0]);
    else if (ids.length > 0) entries.push(ids);
  }
  for (const item of data) {
    if (!used.has(item.id)) entries.push(item.id);
  }
  return entries;
}

function caseName(id: number): string {
  return getDisplayName(id);
}

/** Runs a mutation; records undo and re-renders only if the order changed. */
function applyChange(mutate: () => void): boolean {
  const before = cloneEntries(editorEntries);
  mutate();
  if (JSON.stringify(before) === JSON.stringify(editorEntries)) return false;
  undoStack.push(before);
  redoStack = [];
  render();
  return true;
}

function findEntryIndex(id: number): number {
  return editorEntries.findIndex((entry) =>
    Array.isArray(entry) ? entry.includes(id) : entry === id,
  );
}

function removeCase(id: number): void {
  const index = findEntryIndex(id);
  if (index < 0) return;
  const entry = editorEntries[index];
  if (!Array.isArray(entry)) {
    editorEntries.splice(index, 1);
    return;
  }
  const remaining = entry.filter((caseId) => caseId !== id);
  editorEntries.splice(index, 1, ...(remaining.length > 1 ? [remaining] : remaining));
}

function moveEntryToIndex(from: number, target: number): void {
  if (from < 0 || from >= editorEntries.length) return;
  const [entry] = editorEntries.splice(from, 1);
  const adjustedTarget = target > from ? target - 1 : target;
  editorEntries.splice(Math.max(0, Math.min(adjustedTarget, editorEntries.length)), 0, entry);
}

/** Moves a case to a top-level insertion index (pre-removal coordinates). */
function dropCaseAtIndex(id: number, index: number): void {
  applyChange(() => {
    const from = findEntryIndex(id);
    const standalone = from >= 0 && !Array.isArray(editorEntries[from]);
    removeCase(id);
    editorEntries.splice(standalone && from < index ? index - 1 : index, 0, id);
  });
}

function addCaseToGroup(
  id: number,
  groupIndex: number,
  memberIndex?: number,
  targetCaseId?: number,
): void {
  const target = editorEntries[groupIndex];
  if (target === undefined || target === id) return;
  applyChange(() => {
    const members = Array.isArray(target) ? [...target] : [target];
    let at = targetCaseId !== undefined
      ? Math.max(0, members.indexOf(targetCaseId))
      : memberIndex ?? members.length;
    const own = members.indexOf(id);
    if (own >= 0) {
      members.splice(own, 1);
      if (own < at) at--;
    } else {
      removeCase(id);
    }
    members.splice(Math.max(0, Math.min(at, members.length)), 0, id);
    const pos = editorEntries.indexOf(target);
    if (pos >= 0) editorEntries[pos] = members;
  });
}

/** Moves one case a single step; returns false if it cannot move. */
function stepCase(id: number, dir: -1 | 1, combine: boolean): boolean {
  const idx = findEntryIndex(id);
  const entry = editorEntries[idx];
  if (entry === undefined) return false;

  if (Array.isArray(entry)) {
    const pos = entry.indexOf(id);
    const next = pos + dir;
    if (next >= 0 && next < entry.length) {
      entry.splice(pos, 1);
      entry.splice(next, 0, id);
      return true;
    }
    // Leave the group, landing adjacent to it.
    removeCase(id);
    editorEntries.splice(dir < 0 ? idx : idx + 1, 0, id);
    return true;
  }

  const neighbor = editorEntries[idx + dir];
  if (neighbor === undefined) return false;
  if (Array.isArray(neighbor)) {
    // Enter at the near edge: start when coming from the left, end from the right.
    editorEntries.splice(idx, 1);
    if (dir > 0) neighbor.unshift(id);
    else neighbor.push(id);
    return true;
  }
  if (combine) {
    editorEntries.splice(Math.min(idx, idx + dir), 2, dir < 0 ? [neighbor, id] : [id, neighbor]);
    return true;
  }
  editorEntries.splice(idx, 1);
  editorEntries.splice(idx + dir, 0, id);
  return true;
}

function moveSelected(delta: number, combine = false): void {
  const dir = delta < 0 ? -1 : 1;
  const steps = Math.abs(delta);
  if (selectedCase !== null) {
    const id = selectedCase;
    applyChange(() => {
      for (let i = 0; i < steps; i++) {
        if (!stepCase(id, dir, combine && i === 0)) break;
      }
    });
    return;
  }
  if (selectedEntry >= 0) {
    applyChange(() => {
      for (let i = 0; i < steps; i++) {
        const next = selectedEntry + dir;
        if (next < 0 || next >= editorEntries.length) break;
        const [entry] = editorEntries.splice(selectedEntry, 1);
        editorEntries.splice(next, 0, entry);
        selectedEntry = next;
      }
    });
  }
}

function dragHandleIcon(): string {
  return `<svg class="learning-order-drag-icon" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M3 5h12M3 9h12M3 13h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}

function setDragGhost(element: HTMLElement, event: DragEvent): void {
  if (!event.dataTransfer) return;
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.style.position = 'fixed';
  ghost.style.left = '-10000px';
  ghost.style.top = '-10000px';
  ghost.style.width = `${element.getBoundingClientRect().width}px`;
  ghost.style.opacity = '0.5';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 12, 12);
  window.setTimeout(() => ghost.remove(), 0);
}

function insertion(index: number, groupIndex?: number, memberIndex?: number): string {
  const attrs = groupIndex === undefined
    ? `data-insert-index="${index}"`
    : `data-group-insert="${groupIndex}" data-member-index="${memberIndex ?? 0}"`;
  return `<div class="learning-order-insertion" ${attrs} role="separator" aria-label="Drop here"></div>`;
}

function renderEntry(entry: EditorEntry, index: number): string {
  if (!Array.isArray(entry)) {
    return `<div class="learning-order-unit">
      ${insertion(index)}
      <div class="learning-order-entry learning-order-selectable" tabindex="0" draggable="true" data-case-id="${entry}" data-entry-index="${index}">
        <span>${caseName(entry)}</span>
      </div>
    </div>`;
  }
  return `<div class="learning-order-unit">
    ${insertion(index)}
    <div class="learning-order-group" data-tone="${index % 4}" data-entry-index="${index}" draggable="true">
      <div class="learning-order-group-header learning-order-selectable" tabindex="0" data-entry-index="${index}">
        <span class="learning-order-drag-handle" draggable="true" aria-label="Drag group">${dragHandleIcon()}</span>
      </div>
      <div class="learning-order-group-items">
        ${entry.map((id, memberIndex) => `
          ${insertion(index, index, memberIndex)}
          <div class="learning-order-group-case learning-order-selectable" tabindex="0" draggable="true" data-case-id="${id}" data-group-index="${index}" data-member-index="${memberIndex}">
            <span>${caseName(id)}</span>
          </div>`).join('')}
        ${insertion(entry.length, index, entry.length)}
      </div>
    </div>
  </div>`;
}

function render(): void {
  if (!modal) return;
  const list = modal.querySelector<HTMLElement>('#learningOrderList');
  if (!list) return;
  list.innerHTML = editorEntries.map(renderEntry).join('') + insertion(editorEntries.length);
  bindEvents(list);
  // Synchronous refocus so held-down arrow keys keep targeting the selection.
  const selector = selectedCase === null
    ? `.learning-order-group-header[data-entry-index="${selectedEntry}"]`
    : `[data-case-id="${selectedCase}"]`;
  list.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  const undo = modal.querySelector<HTMLButtonElement>('#learningOrderUndo');
  const redo = modal.querySelector<HTMLButtonElement>('#learningOrderRedo');
  if (undo) undo.disabled = undoStack.length === 0;
  if (redo) redo.disabled = redoStack.length === 0;
  const count = modal.querySelector('#learningOrderCount');
  if (count) {
    const groups = editorEntries.filter((entry) => Array.isArray(entry)).length;
    count.textContent = `${groups} groups`;
  }
}

function clearSelection(): void {
  selectedCase = null;
  selectedEntry = -1;
  modal?.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
  (document.activeElement as HTMLElement | null)?.blur();
}

function bindEvents(list: HTMLElement): void {
  let drag: DragState | null = null;

  list.querySelectorAll<HTMLElement>('.learning-order-selectable').forEach((element) => {
    element.addEventListener('focus', () => {
      selectedCase = element.dataset.caseId ? Number(element.dataset.caseId) : null;
      selectedEntry = selectedCase === null ? Number(element.dataset.entryIndex) : -1;
    });
    element.addEventListener('click', () => {
      selectedCase = element.dataset.caseId ? Number(element.dataset.caseId) : null;
      selectedEntry = selectedCase === null ? Number(element.dataset.entryIndex) : -1;
      element.focus({ preventScroll: true });
    });

    element.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      selectedCase = element.dataset.caseId ? Number(element.dataset.caseId) : null;
      selectedEntry = selectedCase === null ? Number(element.dataset.entryIndex) : -1;
      moveSelected(
        (event.key === 'ArrowLeft' ? -1 : 1) * (event.ctrlKey ? 5 : 1),
        event.shiftKey,
      );
    });
  });

  list.querySelectorAll<HTMLElement>('[data-case-id].learning-order-selectable').forEach((caseElement) => {
    caseElement.addEventListener('dragstart', (event) => {
      const owner = caseElement;
      if (!owner) return;
      (document.activeElement as HTMLElement | null)?.blur();
      drag = { caseId: Number(owner.dataset.caseId) };
      event.dataTransfer?.setData('text/plain', 'learning-order');
      setDragGhost(owner, event);
      owner.classList.add('learning-order-dragging');
    });
    caseElement.addEventListener('dragend', () => {
      drag = null;
      caseElement.blur();
      list.querySelectorAll('.learning-order-dragging, .learning-order-drop-target').forEach((node) =>
        node.classList.remove('learning-order-dragging', 'learning-order-drop-target'),
      );
    });
  });

  list.querySelectorAll<HTMLElement>('.learning-order-group').forEach((group) => {
    group.addEventListener('dragstart', (event) => {
      if ((event.target as HTMLElement).closest('[data-case-id], .learning-order-insertion')) return;
      (document.activeElement as HTMLElement | null)?.blur();
      drag = { entryIndex: Number(group.dataset.entryIndex) };
      event.dataTransfer?.setData('text/plain', 'learning-order');
      setDragGhost(group, event);
      group.classList.add('learning-order-dragging');
    });
    group.addEventListener('dragend', () => {
      if (drag?.caseId !== undefined) return;
      drag = null;
      group.blur();
      list.querySelectorAll('.learning-order-dragging, .learning-order-drop-target').forEach((node) =>
        node.classList.remove('learning-order-dragging', 'learning-order-drop-target'),
      );
    });
  });

  list.querySelectorAll<HTMLElement>('.learning-order-insertion').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      if (!drag) return;
      event.preventDefault();
      zone.classList.add('learning-order-drop-target');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('learning-order-drop-target'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('learning-order-drop-target');
      if (!drag) return;
      if (zone.dataset.groupInsert !== undefined && drag.caseId !== undefined) {
        addCaseToGroup(Number(drag.caseId), Number(zone.dataset.groupInsert), Number(zone.dataset.memberIndex));
      } else if (zone.dataset.insertIndex !== undefined) {
        const insertIndex = Number(zone.dataset.insertIndex);
        if (drag.entryIndex !== undefined) {
          const from = drag.entryIndex;
          applyChange(() => moveEntryToIndex(from, insertIndex));
        } else if (drag.caseId !== undefined) {
          dropCaseAtIndex(drag.caseId, insertIndex);
        }
      }
      drag = null;
    });

  });

  list.querySelectorAll<HTMLElement>('[data-case-id].learning-order-selectable').forEach((target) => {
    target.addEventListener('dragover', (event) => {
      if (
        !drag?.caseId ||
        target.dataset.groupIndex !== undefined ||
        Number(target.dataset.caseId) === drag.caseId
      ) return;
      event.preventDefault();
      target.classList.add('learning-order-drop-target');
    });
    target.addEventListener('dragleave', () => target.classList.remove('learning-order-drop-target'));
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      target.classList.remove('learning-order-drop-target');
      if (!drag?.caseId || target.dataset.groupIndex !== undefined) return;
      const draggedCaseId = drag.caseId;
      const targetCaseId = Number(target.dataset.caseId);
      const targetGroupIndex = target.dataset.groupIndex === undefined
        ? -1
        : Number(target.dataset.groupIndex);
      if (targetGroupIndex >= 0) {
        const targetGroup = editorEntries[targetGroupIndex];
        const targetMemberIndex = Array.isArray(targetGroup)
          ? targetGroup.indexOf(targetCaseId)
          : undefined;
        addCaseToGroup(draggedCaseId, targetGroupIndex, targetMemberIndex, targetCaseId);
      } else {
        const targetIndex = findEntryIndex(targetCaseId);
        if (targetIndex >= 0) addCaseToGroup(draggedCaseId, targetIndex);
      }
      drag = null;
    });
  });

  list.querySelectorAll<HTMLElement>('.learning-order-group').forEach((group) => {
    group.addEventListener('dragover', (event) => {
      if (!drag || drag.caseId === undefined) return;
      if ((event.target as HTMLElement).closest('[data-case-id], .learning-order-insertion')) return;
      event.preventDefault();
      group.classList.add('learning-order-drop-target');
    });
    group.addEventListener('dragleave', () => group.classList.remove('learning-order-drop-target'));
    group.addEventListener('drop', (event) => {
      event.preventDefault();
      group.classList.remove('learning-order-drop-target');
      if (drag?.caseId !== undefined) addCaseToGroup(drag.caseId, Number(group.dataset.entryIndex));
      drag = null;
    });
  });
}

function hasChanges(): boolean {
  return JSON.stringify(editorEntries) !== JSON.stringify(initialEntries);
}

function finishClose(): void {
  modal?.remove();
  modal = null;
  editorEntries = [];
  initialEntries = [];
  undoStack = [];
  redoStack = [];
  selectedCase = null;
  selectedEntry = -1;
  unlockScroll();
}

function reopenHistoryEntry(): void {
  window.setTimeout(() => {
    if (modal && getTopModalId() !== 'learningOrderModal') {
      pushModalState('learningOrderModal', requestClose);
    }
  }, 0);
}

function requestClose(): void {
  const calledFromModalStack = getTopModalId() !== 'learningOrderModal';
  if (!hasChanges()) {
    if (calledFromModalStack) finishClose();
    else closeModalWithHistory(finishClose);
    return;
  }
  showSaveDiscardConfirmation(
    'You have unsaved changes to the learning order. Discard them?',
    saveAndClose,
    () => {
      removeCloseModalFromStack(requestClose);
      finishClose();
    },
    reopenHistoryEntry,
  );
}

function saveAndClose(): void {
  setLearningOrder(editorEntries);
  if (getTopModalId() === 'learningOrderModal') closeModalWithHistory(finishClose);
  else finishClose();
}

export function openLearningOrderModal(): void {
  if (modal) return;
  editorEntries = getInitialEntries();
  initialEntries = cloneEntries(editorEntries);
  undoStack = [];
  redoStack = [];
  modal = document.createElement('div');
  modal.id = 'learningOrderModal';
  modal.className = 'modal active';
  modal.style.zIndex = '10020';
  modal.innerHTML = `
    <div class="modal-content learning-order-content" role="dialog" aria-modal="true" aria-labelledby="learningOrderHeading">
      <div class="modal-header">
        <span class="modal-title" id="learningOrderHeading">Learning Order</span>
        <button class="close-btn" id="learningOrderClose" aria-label="Close">&times;</button>
      </div>
      <div class="learning-order-body">
        <p class="learning-order-help">
          Cases are learned from first to last; cases in a group are learned together.
          Drag to reorder, or drop a case onto a group to add it.
          Select an item and press <kbd>←</kbd> <kbd>→</kbd> to move it
          (<kbd>Ctrl</kbd> moves 5, <kbd>Shift</kbd> groups with its neighbor).
        </p>
        <div class="learning-order-toolbar">
          <button id="learningOrderUndo" class="confirm-btn confirm-btn--neutral" type="button">↶ Undo</button>
          <button id="learningOrderRedo" class="confirm-btn confirm-btn--neutral" type="button">Redo ↷</button>
          <span id="learningOrderCount" class="learning-order-count"></span>
        </div>
        <div id="learningOrderList" class="learning-order-list" aria-label="Learning order"></div>
      </div>
      <div class="learning-order-footer">
        <button id="learningOrderCancel" class="confirm-btn confirm-btn--neutral" type="button">Cancel</button>
        <button id="learningOrderSave" class="confirm-btn confirm-btn--primary" type="button">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  lockScroll();
  pushModalState('learningOrderModal', requestClose);
  attachOverlayClose(modal, () => requestClose());
  render();

  modal.querySelector('#learningOrderUndo')?.addEventListener('click', () => {
    const previous = undoStack.pop();
    if (!previous) return;
    redoStack.push(cloneEntries(editorEntries));
    editorEntries = previous;
    render();
  });
  modal.querySelector('#learningOrderRedo')?.addEventListener('click', () => {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(cloneEntries(editorEntries));
    editorEntries = next;
    render();
  });
  modal.querySelector('.learning-order-body')?.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement).closest('.learning-order-selectable')) clearSelection();
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (selectedCase !== null || selectedEntry >= 0)) {
      event.stopPropagation();
      event.preventDefault();
      clearSelection();
    }
  }, { capture: true });
  modal.querySelector('#learningOrderSave')?.addEventListener('click', saveAndClose);
  modal.querySelector('#learningOrderCancel')?.addEventListener('click', requestClose);
  modal.querySelector('#learningOrderClose')?.addEventListener('click', requestClose);
}

export function installLearningOrderShims(): void {
  (window as unknown as Record<string, unknown>).openLearningOrderModal = openLearningOrderModal;
}

const groupObservers = new WeakMap<HTMLElement, ResizeObserver>();
const groupLayers = new WeakMap<HTMLElement, HTMLElement>();
const groupArgs = new WeakMap<
  HTMLElement,
  { cardSelector: string; caseAttribute: string; sortMode: SortMode }
>();

/** Draws one continuous outline around each run of same-group cards within a grid row. */
export function decorateLearningOrderGrid(
  grid: HTMLElement,
  cardSelector = '.card',
  caseAttribute = 'data-case-name',
  sortMode: SortMode = 'priority',
): void {
  groupLayers.get(grid)?.remove();
  groupLayers.delete(grid);
  groupArgs.set(grid, { cardSelector, caseAttribute, sortMode });

  // Redraw when the grid resizes (column changes, late image loads).
  if (!groupObservers.has(grid) && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      const args = groupArgs.get(grid);
      if (args) decorateLearningOrderGrid(grid, args.cardSelector, args.caseAttribute, args.sortMode);
    });
    observer.observe(grid);
    groupObservers.set(grid, observer);
  }

  // A scrolling grid hosts the layer itself so outlines scroll with the content.
  const overflowY = getComputedStyle(grid).overflowY;
  const scrolls = overflowY === 'auto' || overflowY === 'scroll';
  const host = scrolls ? grid : grid.parentElement;
  if (!host) return;

  const groups = new Map<number, number>();
  getLearningOrder()?.forEach((entry, groupId) => {
    if (!Array.isArray(entry) || entry.length < 2) return;
    // Probability sorts only keep groups whose members share one probability.
    if (sortMode !== 'priority' && !isUniformProbabilityGroup(entry)) return;
    entry.forEach((id) => groups.set(id, groupId));
  });
  if (groups.size === 0) return;

  // Attribute may hold a case name or a numeric id.
  const idOf = (el: Element): number | undefined => {
    const raw = el.getAttribute(caseAttribute);
    if (!raw) return undefined;
    return /^\d+$/.test(raw) ? Number(raw) : getCaseId(raw);
  };

  const cards = Array.from(grid.querySelectorAll<HTMLElement>(cardSelector));
  const style = getComputedStyle(grid);
  const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
  const gap = parseFloat(style.columnGap) || 0;
  // Keep outlines of neighboring groups from touching inside the gap.
  const pad = Math.max(2, Math.min(6, gap / 2 - 1.5));
  // Outline corners stay concentric with the cards they wrap.
  const cardRadius = cards[0] ? parseFloat(getComputedStyle(cards[0]).borderTopLeftRadius) || 0 : 12;

  // Runs of adjacent same-group cards within one row (first/last = card indices).
  type Run = { cards: HTMLElement[]; groupId: number; first: number; last: number };
  const runs: Run[] = [];
  let current: Run | null = null;
  for (let index = 0; index < cards.length; index++) {
    const id = idOf(cards[index]);
    const groupId = id === undefined ? undefined : groups.get(id);
    if (current && groupId === current.groupId && index % columns !== 0) {
      current.cards.push(cards[index]);
      current.last = index;
      continue;
    }
    if (current) runs.push(current);
    current = groupId === undefined
      ? null
      : { cards: [cards[index]], groupId, first: index, last: index };
  }
  if (current) runs.push(current);
  if (runs.length === 0) return;

  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const origin = host.getBoundingClientRect();
  const offsetX = host.scrollLeft - host.clientLeft - origin.left;
  const offsetY = host.scrollTop - host.clientTop - origin.top;

  const layer = document.createElement('div');
  layer.className = 'learning-group-layer';
  layer.setAttribute('aria-hidden', 'true');
  runs.forEach((run, i) => {
    const rects = run.cards.map((card) => card.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const box = document.createElement('div');
    box.className = 'learning-group-box';
    box.dataset.tone = String(run.groupId % 4);
    box.style.setProperty('--lg-radius', `${cardRadius + pad}px`);
    const prev = runs[i - 1];
    const next = runs[i + 1];
    if (prev && prev.groupId === run.groupId && prev.last + 1 === run.first) box.classList.add('cont-start');
    if (next && next.groupId === run.groupId && run.last + 1 === next.first) box.classList.add('cont-end');
    box.style.left = `${left + offsetX - pad}px`;
    box.style.top = `${top + offsetY - pad}px`;
    box.style.width = `${right - left + pad * 2}px`;
    box.style.height = `${bottom - top + pad * 2}px`;
    layer.appendChild(box);
  });
  if (scrolls) grid.appendChild(layer);
  else grid.insertAdjacentElement('afterend', layer);
  groupLayers.set(grid, layer);
}
