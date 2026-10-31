/**
 * Focus-ring input modality tracking.
 *
 * The app suppresses the browser's default focus ring and draws a designed one
 * (see `styles.css`) only while keyboard navigation is in use. This module
 * stamps `data-input-modality` on <html> so CSS can gate the ring:
 *
 *   • pointerdown  → "pointer"  (mouse/touch focus shows no ring)
 *   • Tab / Escape → "keyboard" (navigation reveals the ring)
 *
 * Escape is the exception when it closes a modal: the key is "consumed" by the
 * close and must not propagate a ring onto whatever element regains focus
 * (e.g. the button that opened the modal).
 */
import { hasOpenModal } from './modal';

export function installFocusRingTracking(): void {
  const root = document.documentElement;
  const set = (m: 'keyboard' | 'pointer'): void => {
    root.dataset.inputModality = m;
  };

  // Start in pointer mode so the UA default is dropped as soon as JS is live;
  // any programmatic focus on load stays borderless until Tab/Esc is used.
  set('pointer');

  document.addEventListener('pointerdown', () => set('pointer'), true);

  document.addEventListener(
    'keydown',
    (e) => {
      // An Escape consumed by an open modal must not propagate a ring onto the
      // element that regains focus (e.g. the button that opened the modal).
      if (e.key === 'Escape' && hasOpenModal()) return;
      // Only navigation keys enable the ring — not typing/activation keys.
      if (e.key === 'Tab' || e.key === 'Escape') set('keyboard');
    },
    true, // capture phase: runs before the modal handlers pop the close stack
  );
}
