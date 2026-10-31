/**
 * Modal stack / history helpers — ported from legacy index.js + modals.js.
 * Modals that need Esc/back-button handling push a close function.
 */

type CloseEntry = {
  modalId: string;
  closeFn: (...args: unknown[]) => void;
  args: unknown[];
};

let closeModalStack: CloseEntry[] = [];
let sqgModalPopstateClosing = false;
let sqgModalSkipPopstateCount = 0;
let modalCloseInProgress = false;
let backdropPointerDown:
  | { entry: CloseEntry; overlay: HTMLElement; pointerId: number; released: boolean }
  | null = null;

export function pushModalState(modalId: string, closeFn: () => void, ...args: unknown[]): void {
  if (typeof closeFn !== 'function') return;
  const entry: CloseEntry = { modalId, closeFn, args };
  closeModalStack.push(entry);
  try {
    window.history.pushState({ sqgModal: true, modalId }, '');
  } catch {
    // Some browsers may reject pushState in unusual contexts; ignore silently.
  }
}

export function removeCloseModalFromStack(closeFn: () => void): void {
  if (typeof closeFn !== 'function') return;
  closeModalStack = closeModalStack.filter((entry) => entry.closeFn !== closeFn);
}

export function popCloseModalStack(): boolean {
  if (closeModalStack.length === 0) return false;
  const entry = closeModalStack.pop();
  window.dispatchEvent(new Event('sqg:modal-closing'));
  modalCloseInProgress = true;
  try {
    entry?.closeFn(...entry.args);
  } finally {
    modalCloseInProgress = false;
  }
  if (!sqgModalPopstateClosing && window.history.state?.sqgModal) {
    sqgModalSkipPopstateCount += 1;
    window.history.back();
  }
  return true;
}

/** True while at least one modal is on the Esc/back-button close stack. */
export function hasOpenModal(): boolean {
  return closeModalStack.length > 0;
}

export function getTopModalId(): string | undefined {
  return closeModalStack[closeModalStack.length - 1]?.modalId;
}

/** Close every stacked modal, typically before switching to a standalone workspace. */
export function closeAllModalStates(): void {
  if (closeModalStack.length === 0) return;
  const historyEntriesToRemove = closeModalStack.length;
  const wasPopstateClosing = sqgModalPopstateClosing;
  sqgModalPopstateClosing = true;
  try {
    while (closeModalStack.length > 0) {
      popCloseModalStack();
    }
  } finally {
    sqgModalPopstateClosing = wasPopstateClosing;
  }

  if (!hasOpenModal()) unlockScroll();

  if (!wasPopstateClosing && window.history.state?.sqgModal) {
    sqgModalSkipPopstateCount += historyEntriesToRemove;
    window.history.go(-historyEntriesToRemove);
  }
}

export function closeModalWithHistory(closeFn: (...args: unknown[]) => void, ...args: unknown[]): void {
  if (typeof closeFn !== 'function') return;
  const matchingEntryExists = closeModalStack.some((entry) => entry.closeFn === closeFn);
  if (matchingEntryExists) {
    removeCloseModalFromStack(closeFn);
  } else if (!modalCloseInProgress && closeModalStack.length > 0) {
    closeModalStack.pop();
  }

  const shouldPopHistory =
    !modalCloseInProgress
    && !sqgModalPopstateClosing
    && window.history.state
    && window.history.state.sqgModal;
  if (shouldPopHistory) {
    sqgModalSkipPopstateCount += 1;
  }

  closeFn(...args);

  if (shouldPopHistory) {
    window.history.back();
  }
}

export function installModalStackGlobalListeners(): void {
  window.addEventListener('popstate', () => {
    if (sqgModalSkipPopstateCount > 0) {
      sqgModalSkipPopstateCount -= 1;
      return;
    }
    if (closeModalStack.length > 0) {
      sqgModalPopstateClosing = true;
      popCloseModalStack();
      sqgModalPopstateClosing = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (getTopModalId() === 'evilnessQuizModal' || getTopModalId() === 'colorRecogModal') return;
    if (!popCloseModalStack()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  });

  document.addEventListener('pointerdown', (e) => {
    backdropPointerDown = null;
    if (e.button !== 0) return;

    const entry = closeModalStack[closeModalStack.length - 1];
    const overlay = entry ? document.getElementById(entry.modalId) : null;
    if (overlay && e.target === overlay) {
      backdropPointerDown = { entry, overlay, pointerId: e.pointerId, released: false };
    }
  });

  document.addEventListener('pointerup', (e) => {
    const pointerDown = backdropPointerDown;
    if (!pointerDown) return;
    if (pointerDown.pointerId === e.pointerId && e.target === pointerDown.overlay) {
      pointerDown.released = true;
    } else {
      backdropPointerDown = null;
    }
  });

  document.addEventListener('click', (e) => {
    const pointerDown = backdropPointerDown;
    backdropPointerDown = null;
    if (!pointerDown || !pointerDown.released || e.target !== pointerDown.overlay) return;
    if (closeModalStack[closeModalStack.length - 1] === pointerDown.entry) {
      e.stopPropagation();
      popCloseModalStack();
    }
  });

  document.addEventListener('pointercancel', () => {
    backdropPointerDown = null;
  });
}

/** Shared backdrop-close helper (legacy `attachOverlayClose`). */
export function attachOverlayClose(overlay: HTMLElement, closeFn: (e: Event) => void): void {
  let downOnSelf = false;
  overlay.addEventListener('mousedown', (e) => {
    downOnSelf = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    const isOutsideClick = downOnSelf && e.target === overlay;
    downOnSelf = false;
    if (!isOutsideClick) return;
    e.stopPropagation();
    closeFn(e);
  });
}

// ── Scroll lock ──────────────────────────────────────────────────────────────
export function lockScroll(): void {
  (window as unknown as { modalScrollY: number }).modalScrollY = window.scrollY;
  document.body.style.top = `-${window.scrollY}px`;
  document.documentElement.classList.add('scroll-locked');
}

export function unlockScroll(): void {
  document.documentElement.classList.remove('scroll-locked');
  const y = (window as unknown as { modalScrollY?: number }).modalScrollY || 0;
  window.scrollTo(0, y);
}
