/**
 * Global app boot behaviors — ported from legacy `js/index.js`:
 *   • Alt-keyboard shortcuts (Alt+H/P/W/Q)
 *   • Drag-and-drop JSON import
 *   • URL scramble deep-links (#s=... or bare hash with parens)
 */
import {
  hideInstructions,
  hideParenthesis,
  setHideInstructions,
  setHideParenthesis,
} from './state';
import { applyInstructionVisibility } from './visibility';
import { showToast } from './toast';

function setToggleChecked(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked;
}

function installKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    const w = window as unknown as Record<string, unknown>;

    switch (e.key.toLowerCase()) {
      case 'h': // Alt+H - Hide instructions
        e.preventDefault();
        setHideInstructions(!hideInstructions);
        applyInstructionVisibility();
        setToggleChecked('hs_hideInstructionsToggle', !hideInstructions);
        showToast(`Instruction buttons ${!hideInstructions ? 'hidden' : 'shown'}`, 2000, 'info');
        break;
      case 'p': // Alt+P - Hide parenthesis
        e.preventDefault();
        setHideParenthesis(!hideParenthesis);
        setToggleChecked('hs_hideParenthesisToggle', !hideParenthesis);
        showToast(`Parenthesis ${!hideParenthesis ? 'hidden' : 'shown'}`, 2000, 'info');
        break;
      case 'w': // Alt+W - Parity tracing personalization
        e.preventDefault();
        if (typeof w.openParityTracingPersonalization === 'function') {
          (w.openParityTracingPersonalization as () => void)();
        }
        break;
      case 'q': // Alt+Q - Quick edit
        e.preventDefault();
        if (typeof w.openQuickEditModal === 'function') {
          (w.openQuickEditModal as () => void)();
        }
        break;
    }
  });
}

function installDragDropImport(): void {
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    const w = window as unknown as Record<string, unknown>;
    if (files && files.length > 0 && files[0].name.endsWith('.json')) {
      if (typeof w.handleFileImport === 'function') {
        (w.handleFileImport as (file: File) => void)(files[0]);
      }
    }
  });
}

function checkURLScramble(): void {
  const hash = decodeURIComponent(window.location.hash);
  if (!hash || hash.length <= 1) return;

  let scramble: string | null = null;

  // Format: #s=scramble
  if (hash.startsWith('#s=')) {
    scramble = hash.slice(3).trim();
  }
  // Fallback: bare hash with parens (old format)
  else if (hash.slice(1).includes('(')) {
    scramble = hash.slice(1).trim();
  }

  if (scramble && (scramble.includes('(') || scramble.includes('/'))) {
    const w = window as unknown as Record<string, unknown>;
    const tryOpen = (attempts: number): void => {
      if (typeof w.openNewParityAnalysis === 'function') {
        (w.openNewParityAnalysis as (s: string | null) => void)(scramble);
      } else if (attempts > 0) {
        setTimeout(() => tryOpen(attempts - 1), 300);
      }
    };
    tryOpen(20);
  }
}

function installDeepLinks(): void {
  const hasDeepLink = (): boolean => {
    const hash = decodeURIComponent(window.location.hash);
    return hash.startsWith('#s=') || (hash.length > 1 && hash.slice(1).includes('('));
  };

  if (!hasDeepLink()) {
    setTimeout(checkURLScramble, 3000);
  } else {
    checkURLScramble();
  }
}

export function installAppBoot(): void {
  installKeyboardShortcuts();
  installDragDropImport();
  installDeepLinks();
}
