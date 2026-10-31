/**
 * Window shims backing the inline `on*` handlers emitted by ported HTML
 * generators (cardHTML.ts, algDisplay.ts, notes.ts). The markup is produced as
 * static strings, so it cannot close over module functions — hence the
 * `window.*` bridge.
 */
import { getShapePath, stripParenthesisIfNeeded } from './algDisplay';
import { algToShapeIndex, invertScramble } from '../lib/cube';
import { normalizeScramble } from '../lib/normalizer';
import { getCaseId } from '../data/cases';
import { getParityText } from '../lib/parityAnalyzer';
import {
  visualizeFromHex,
  visualizeFromScramble,
  visualizeFromSolution,
  visualizeShapes,
} from '../lib/drawScramble';
import {
  adjustPriority,
  currentSortMode,
  data,
  enhancedAccess,
  evilnessMap,
  getDisplayName,
  hideParenthesis,
  learnedCases,
  learningCases,
  plannedLevels,
  saveState,
  setNeedsReorder,
  toggleLearned,
} from './state';
import { renderCard } from './cardHTML';
import {
  attemptCloseGeneralNotesModal,
  attemptCloseNotesModal,
  closeGeneralNotesInfoModal,
  closeNotesInfoModal,
  openNotesModal,
  saveGeneralNotes,
  saveNotes,
  showGeneralNotesInfoModal,
  showNotesInfoModal,
  toggleEditGeneralNotes,
} from './notes';
import { openHomepageImageSettings, openUnifiedSettings } from './settingsUI';
import { installSidebarShims } from './sidebar';
import { installEditCaseShims, openEditCaseModal } from './editCase';
import { installTrainingShims, trainCaseFromContextMenu } from './training';
import { installParityTracerShims } from './parityTracer';
import { scrambleFromState } from '../lib/solver';
import { installAnimateAlgShims, openAnimateAlgModal } from './animateAlg';
import { installQuickEditShims } from './quickEdit';
import { installLearningOrderShims } from './learningOrder';

// ── Algo popup (legacy rendering.js showAlgoPopup/hideAlgoPopup) ─────────────
let activePopup: HTMLElement | null = null;
let activePopupElement: HTMLElement | null = null;
let activePopupCleanup: (() => void) | null = null;
let popupHoverTimeout: ReturnType<typeof setTimeout> | null = null;
let caseUpdateListenerInstalled = false;

function rerenderCaseCard(caseName: string): void {
  const caseId = getCaseId(caseName);
  const item = caseId === undefined ? undefined : data.find((entry) => entry.id === caseId);
  if (!item) return;

  document.querySelectorAll<HTMLElement>(`[data-case-name="${CSS.escape(caseName)}"]`).forEach((cardElement) => {
    const container = document.createElement('div');
    container.innerHTML = renderCard(item);
    const replacement = container.firstElementChild as HTMLElement | null;
    if (!replacement) return;

    if (cardElement.closest('#trainingCaseInfoModal')) {
      const cardActions = replacement.querySelector('.card-header-actions');
      if (cardActions) {
        const closeButton = document.createElement('button');
        closeButton.className = 'training-case-info-close';
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Close case information');
        closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        cardActions.appendChild(closeButton);
      }
    }
    cardElement.replaceWith(replacement);
  });
}

function requestManualReorder(): void {
  if (currentSortMode !== 'priority') return;
  setNeedsReorder(true, false);
  window.dispatchEvent(new CustomEvent('sqg:show-reorder'));
}

function closeAlgoPopup(isPermanent: boolean): void {
  if (isPermanent) {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
      activePopupElement = null;
    }
    activePopupCleanup?.();
    activePopupCleanup = null;
  } else {
    const hoverPopup = document.querySelector('.algo-popup:not(.permanent)');
    if (hoverPopup) hoverPopup.remove();
    if (popupHoverTimeout) {
      clearTimeout(popupHoverTimeout);
      popupHoverTimeout = null;
    }
  }
}

function hideAlgoPopup(_element: HTMLElement, isPermanent: boolean): void {
  closeAlgoPopup(isPermanent);
}

function showAlgoPopup(element: HTMLElement, algo: string, isPermanent: boolean): void {
  if (popupHoverTimeout) {
    clearTimeout(popupHoverTimeout);
    popupHoverTimeout = null;
  }

  if (isPermanent && activePopupElement === element) {
    closeAlgoPopup(true);
    return;
  }

  if (isPermanent && activePopup) {
    activePopup.remove();
    activePopup = null;
    activePopupElement = null;
  }

  if (!isPermanent && activePopup && activePopupElement !== element) {
    return;
  }

  if (!isPermanent) {
    const existingHover = document.querySelector('.algo-popup:not(.permanent)');
    if (existingHover) existingHover.remove();
  }

  if (algo === 'Done!' || !algo || algo.trim() === '') return;
  const ownerModal = element.closest<HTMLElement>('#trainingCaseInfoModal');

  const setup = invertScramble(algo);
  const shapePath = getShapePath(algo);

  const popup = document.createElement('div');
  popup.className = 'algo-popup' + (isPermanent ? ' permanent' : '');
  popup.dataset.isPermanent = String(isPermanent);

  const setupId = 'popup-setup-' + Math.random().toString(36).substr(2, 9);

  const popupFontFamily = hideParenthesis ? 'Arial, sans-serif' : 'monospace';
  const displaySetup = stripParenthesisIfNeeded(setup);
  popup.innerHTML = `
        <div class="popup-label">Setup:</div>
        <div id="${setupId}" class="popup-setup" style="font-family: ${popupFontFamily}; font-size: 0.8rem; margin-bottom: 8px;" title="Click to analyze parity">${displaySetup}</div>
        ${shapePath ? `
            <div class="popup-label">Shape Path:</div>
            <div id="${setupId}_shapepath" style="font-size: 0.75rem; line-height: 1.6; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.15s;" title="Click to animate algorithm">
                ${shapePath
                  .map((step, idx) => {
                    const arrow = idx < shapePath.length - 1 ? ' → ' : '';
                    return `<span class="popup-step-span">${step.top}/${step.bottom}</span>${arrow}`;
                  })
                  .join('')}
            </div>
        ` : ''}
    `;

  document.body.appendChild(popup);

  const setupElement = document.getElementById(setupId);
  if (setupElement) {
    setupElement.onclick = (e) => {
      e.stopPropagation();
      closeAlgoPopup(isPermanent);
      const opener = (window as unknown as Record<string, unknown>).openNewParityAnalysis;
      if (typeof opener === 'function') {
        (opener as (s: string, fromTrainingCaseInfo?: boolean) => void)(setup, Boolean(ownerModal));
      }
    };
    setupElement.onmouseenter = () => {
      setupElement.style.background = 'var(--hover-bg)';
    };
    setupElement.onmouseleave = () => {
      setupElement.style.background = 'var(--surface2)';
    };
  }

  const shapePathElement = document.getElementById(setupId + '_shapepath');
  if (shapePathElement) {
    shapePathElement.onclick = (e) => {
      e.stopPropagation();
      closeAlgoPopup(isPermanent);

      const caseName = element.getAttribute('data-case') || '';
      const parityType = element.getAttribute('data-parity') || '';
      const displayName = getDisplayName(caseName);

      openAnimateAlgModal(
        algo,
        displayName,
        parityType,
        element.closest('#trainingCaseInfoModal') !== null,
      );
    };
    shapePathElement.onmouseenter = () => {
      shapePathElement.style.background = 'var(--hover-bg)';
    };
    shapePathElement.onmouseleave = () => {
      shapePathElement.style.background = 'transparent';
    };
  }

  // Position popup
  const rect = element.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();

  let top = rect.bottom + 10;
  let left = rect.left;

  if (top < rect.top + rect.height + 5 || top + popupRect.height > window.innerHeight - 10) {
    top = rect.top - popupRect.height - 10;
  }

  if (top < rect.bottom && top + popupRect.height > rect.top) {
    top = rect.top;

    if (left < window.innerWidth - rect.right) {
      left = rect.right + 10;
    } else {
      left = rect.left - popupRect.width - 10;
    }

    if (left + popupRect.width > window.innerWidth - 10) {
      left = rect.left - popupRect.width - 10;
    }
  }

  if (left + popupRect.width > window.innerWidth - 10) {
    left = window.innerWidth - popupRect.width - 10;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  if (left === rect.left || left === window.innerWidth - popupRect.width - 10) {
    if (top > rect.top && top < rect.bottom) {
      top = rect.top - popupRect.height - 10;
      if (top < 10) {
        top = rect.bottom + 10;
      }
    }
  }

  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
  if (element.closest('#trainingCaseInfoModal')) {
    popup.style.zIndex = '10002';
  }

  const scrollHandler = () => {
    closeAlgoPopup(isPermanent);
    window.removeEventListener('scroll', scrollHandler, true);
    if (clickHandler) document.removeEventListener('mousedown', clickHandler);
  };
  window.addEventListener('scroll', scrollHandler, true);

  let clickHandler: ((e: MouseEvent) => void) | null = null;
  if (isPermanent) {
    activePopup = popup;
    activePopupElement = element;

    setTimeout(() => {
      clickHandler = (e) => {
        const target = e.target as Node;
        if (!popup.contains(target) && e.target !== element && !ownerModal?.contains(target)) {
          closeAlgoPopup(true);
          document.removeEventListener('mousedown', clickHandler!);
          window.removeEventListener('scroll', scrollHandler, true);
        }
      };
      document.addEventListener('mousedown', clickHandler);
    }, 100);
    const cleanup = () => {
      if (clickHandler) document.removeEventListener('mousedown', clickHandler);
      window.removeEventListener('scroll', scrollHandler, true);
      ownerModal?.removeEventListener('sqg:training-case-info-closing', closeOwnedPopup);
    };
    const closeOwnedPopup = () => {
      if (activePopupElement === element) closeAlgoPopup(true);
    };
    ownerModal?.addEventListener('sqg:training-case-info-closing', closeOwnedPopup, { once: true });
    activePopupCleanup = cleanup;
  }
}

// ── Context menu (legacy rendering.js showContextMenu) ───────────────────────
type ContextMenuWithTrigger = HTMLElement & { _trigger?: Node | null; _close?: () => void };

function showContextMenu(caseName: string, event: MouseEvent): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  event.stopPropagation();
  const isTrainingCaseInfoCard = (event.target as HTMLElement).closest('#trainingCaseInfoModal') !== null;

  // Normalise the click target to the ⋯ button itself so repeat clicks on
  // different SVG children of the same button still match.
  const trigger: Node = (event.target as HTMLElement).closest('.icon-btn') ?? (event.target as Node);

  const existingMenu = document.getElementById('caseContextMenu') as ContextMenuWithTrigger | null;
  if (existingMenu) {
    const sameTrigger = existingMenu._trigger === trigger;
    existingMenu._close?.();
    existingMenu.remove();
    // Second click on the same ⋯ button: dismiss the menu, don't respawn it.
    if (sameTrigger) return;
  }

  const isLearned = learnedCases.has(caseId);
  const isLearning = learningCases.has(caseId);
  const priorityLevel = plannedLevels.get(caseId) || 4;
  const priorityNames = ['Highest', 'Higher', 'High', 'Normal', 'Low', 'Lower', 'Lowest'];

  const menu = document.createElement('div') as ContextMenuWithTrigger;
  menu.id = 'caseContextMenu';
  menu._trigger = trigger;
  menu.style.cssText = `
        position: fixed;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        box-shadow: 0 4px 12px var(--card-shadow);
        z-index: ${isTrainingCaseInfoCard ? '10002' : '10000'};
        padding: 4px 0;
        min-width: 180px;
        max-width: 200px;
    `;

  const statusIndicator = document.createElement('div');
  statusIndicator.style.cssText = `
        padding: 6px 16px;
        font-size: 0.75rem;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--surface-border);
        margin-bottom: 4px;
        text-align: center;
        font-weight: 600;
    `;

  if (isLearned) {
    statusIndicator.textContent = 'Learned';
  } else if (isLearning) {
    statusIndicator.textContent = 'Learning';
  } else {
    statusIndicator.textContent = `Priority: ${priorityNames[priorityLevel - 1]}`;
  }
  menu.appendChild(statusIndicator);

  type MenuItem = { divider?: boolean; label?: string; action?: () => void; disabled?: boolean };
  const menuItems: MenuItem[] = [];

  if (!isLearned && !isLearning) {
    menuItems.push(
      {
        label: 'Move Up in Priority',
        action: () => {
          adjustPriority(caseName, -1, false);
          const newPriority = plannedLevels.get(caseId) || 4;
          statusIndicator.textContent = `Priority: ${priorityNames[newPriority - 1]}`;
          rerenderCaseCard(caseName);
          requestManualReorder();
        },
        disabled: priorityLevel === 1,
      },
      {
        label: 'Move Down in Priority',
        action: () => {
          adjustPriority(caseName, 1, false);
          const newPriority = plannedLevels.get(caseId) || 4;
          statusIndicator.textContent = `Priority: ${priorityNames[newPriority - 1]}`;
          rerenderCaseCard(caseName);
          requestManualReorder();
        },
        disabled: priorityLevel === 7,
      },
      { divider: true },
    );
  }

  menuItems.push(
    {
      label: 'Add/Edit Notes',
      action: () => {
        menu.remove();
        openNotesModal(caseName, false, isTrainingCaseInfoCard);
      },
    },
    {
      label: 'Train This Case',
      action: () => {
        menu.remove();
        trainCaseFromContextMenu(caseName, isTrainingCaseInfoCard);
      },
    },
    {
      label: 'Edit Case',
      action: () => {
        menu.remove();
        openEditCaseModal(caseName, isTrainingCaseInfoCard);
      },
    },
  );

  menuItems.push(
    { divider: true },
    {
      label: 'Close',
      action: () => {
        menu.remove();
      },
    },
  );

  menuItems.forEach((item) => {
    if (item.divider) {
      const divider = document.createElement('div');
      divider.style.cssText = 'height: 1px; background: var(--surface-border); margin: 4px 0;';
      menu.appendChild(divider);
    } else {
      const option = document.createElement('div');
      option.textContent = item.label || '';
      option.style.cssText = `
                padding: 8px 16px;
                cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
                font-size: 0.9rem;
                color: ${item.disabled ? 'var(--text-muted)' : 'var(--text-ui)'};
                opacity: ${item.disabled ? '0.5' : '1'};
            `;

      if (!item.disabled) {
        option.onmouseover = () => {
          option.style.background = 'var(--sidebar-item-hover)';
        };
        option.onmouseout = () => {
          option.style.background = 'transparent';
        };
        option.onclick = item.disabled ? null : (item.action as () => void);
      }

      menu.appendChild(option);
    }
  });

  document.body.appendChild(menu);

  const rect = (event.target as HTMLElement).closest('.icon-btn')?.getBoundingClientRect();
  let top = rect ? rect.bottom + 5 : event.clientY;
  let left = rect ? rect.right - 180 : event.clientX;

  setTimeout(() => {
    const menuRect = menu.getBoundingClientRect();

    if (top + menuRect.height > window.innerHeight - 10) {
      top = (rect ? rect.top : event.clientY) - menuRect.height - 5;
    }

    if (top < 10) {
      top = 10;
    }

    left = rect ? rect.right - menuRect.width : event.clientX;

    if (left + menuRect.width > window.innerWidth - 10) {
      left = window.innerWidth - menuRect.width - 10;
    }

    if (left < 10) {
      left = 10;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
  }, 0);

  setTimeout(() => {
    // Menu may already have been dismissed (e.g. fast double-click on the trigger).
    if (!menu.isConnected) return;

    const closeMenu = (e: MouseEvent) => {
      // Leave clicks on the trigger alone — the trigger's click handler toggles the menu.
      if (!menu.contains(e.target as Node) && !trigger.contains(e.target as Node)) {
        dismiss();
      }
    };

    const scrollCloseMenu = () => {
      dismiss();
    };

    const dismiss = () => {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('scroll', scrollCloseMenu, true);
    };
    menu._close = dismiss;

    document.addEventListener('mousedown', closeMenu);
    window.addEventListener('scroll', scrollCloseMenu, true);
  }, 100);
}

// ── Install all shims ────────────────────────────────────────────────────────
export function installWindowShims(): void {
  const w = window as unknown as Record<string, unknown>;

  if (!caseUpdateListenerInstalled) {
    window.addEventListener('sqg:case-updated', ((event: CustomEvent<{ caseId: number }>) => {
      rerenderCaseCard(String(event.detail.caseId));
    }) as EventListener);
    caseUpdateListenerInstalled = true;
  }

  w.openHomepageImageSettings = openHomepageImageSettings;
  installSidebarShims();
  installEditCaseShims();
  installTrainingShims();
  installParityTracerShims();
  installAnimateAlgShims();
  installQuickEditShims();
  installLearningOrderShims();

  // Algorithm-analysis bridges used by edit-case, quick-edit, trainer, tracer.
  w.algToShapeIndex = algToShapeIndex;
  w.ScrambleNormalizer = { normalizeScramble };
  w.ParityAnalyzerLib = { getParityText };

  // Training / scramble-generation bridge (legacy sq1Tools).
  w.sq1Tools = { scrambleFromState };

  // Scramble visualizer bridges (training modal, tracer, animate-alg, settings).
  w.Square1Visualizer = { visualizeFromHex, visualizeFromScramble, visualizeFromSolution, visualizeShapes };
  w.visualizeFromHex = visualizeFromHex;
  w.visualizeFromScramble = visualizeFromScramble;
  w.visualizeFromSolution = visualizeFromSolution;
  w.visualizeShapes = visualizeShapes;

  // Edit-case modal state bridges referenced by inline HTML.
  Object.defineProperty(w, 'enhancedAccess', { get: () => enhancedAccess, configurable: true });
  w.evilnessMap = evilnessMap;
  w.saveState = saveState;

  w.toggleLearned = (name: string, event: MouseEvent) => {
    event.stopPropagation();
    toggleLearned(name, event.button === 2, false);
    rerenderCaseCard(name);
    requestManualReorder();
  };

  w.showContextMenu = showContextMenu;
  w.showAlgoPopup = showAlgoPopup;
  w.hideAlgoPopup = hideAlgoPopup;

  w.showNotesInfoModal = showNotesInfoModal;
  w.closeNotesInfoModal = closeNotesInfoModal;
  w.attemptCloseNotesModal = attemptCloseNotesModal;
  w.saveNotes = saveNotes;
  w.toggleEditGeneralNotes = toggleEditGeneralNotes;
  w.saveGeneralNotes = saveGeneralNotes;
  w.attemptCloseGeneralNotesModal = attemptCloseGeneralNotesModal;
  w.showGeneralNotesInfoModal = showGeneralNotesInfoModal;
  w.closeGeneralNotesInfoModal = closeGeneralNotesInfoModal;

  w.openUnifiedSettings = (tab: string) => {
    const valid = ['homescreen', 'parity', 'trainer'];
    openUnifiedSettings((valid.includes(tab) ? tab : 'homescreen') as 'homescreen' | 'parity' | 'trainer');
  };
}
