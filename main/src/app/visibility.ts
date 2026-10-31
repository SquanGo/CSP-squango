import { hideInstructions, setHideInstructions, setHideParenthesis } from './state';

/** Port of legacy `applyInstructionVisibility` (modals.js). */
export function applyInstructionVisibility(): void {
  const instructionBtns = document.querySelectorAll(
    '.settings-info-btn, .homepage-info-btn, .training-info-btn, .case-detail-info-btn, .instruction-btn',
  );
  instructionBtns.forEach((btn) => {
    (btn as HTMLElement).style.display = hideInstructions ? 'none' : 'flex';
  });
}

/** Port of legacy `toggleHideInstructions` (modals.js). */
export function toggleHideInstructions(isChecked: boolean): void {
  setHideInstructions(isChecked);
  applyInstructionVisibility();
}

/** Port of legacy `toggleHideParenthesis` (modals.js). */
export function toggleHideParenthesis(isChecked: boolean): void {
  setHideParenthesis(isChecked);
}

/** Port of legacy `applyAlgorithmFontSize` (modals.js). */
export function applyAlgorithmFontSize(size: number): void {
  const style = document.getElementById('algorithm-font-size-style') || document.createElement('style');
  style.id = 'algorithm-font-size-style';
  style.textContent = `
        .algo-line, .algo-interactive {
            font-size: ${size}px !important;
        }
    `;
  if (!style.parentNode) {
    document.head.appendChild(style);
  }
}
