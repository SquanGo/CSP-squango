import { attachOverlayClose, unlockScroll } from './modal';

/** Port of legacy `showConfirmation`. */
export function showConfirmation(
  message: string,
  onConfirm: (() => void) | null,
  onCancel: (() => void) | null,
): void {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.cssText = 'z-index: 20001; display: flex; align-items: center; justify-content: center;';
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; margin: 0;">
            <div class="modal-header">
                <span class="modal-title">Confirm Action</span>
            </div>
            <div class="modal-body">
                <p style="margin: 0; font-size: 1rem; line-height: 1.6;">${message}</p>
                <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                    <button id="confirmCancel" class="confirm-btn confirm-btn--neutral">Cancel</button>
                    <button id="confirmOk" class="confirm-btn confirm-btn--primary">OK</button>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  document.documentElement.classList.add('scroll-locked');

  document.getElementById('confirmOk')!.onclick = () => {
    modal.remove();
    unlockScroll();
    if (onConfirm) onConfirm();
  };

  const cancel = () => {
    modal.remove();
    unlockScroll();
    if (onCancel) onCancel();
  };
  document.getElementById('confirmCancel')!.onclick = cancel;
  attachOverlayClose(modal, cancel);
}

/** Port of legacy `showSaveDiscardConfirmation`. */
export function showSaveDiscardConfirmation(
  message: string,
  onSave: (() => void) | null,
  onDiscard: (() => void) | null,
  onCancel: (() => void) | null,
): void {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.cssText = 'z-index: 20001; display: flex; align-items: center; justify-content: center;';
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; margin: 0;">
            <div class="modal-header">
                <span class="modal-title">Unsaved Changes</span>
            </div>
            <div class="modal-body">
                <p style="margin: 0; font-size: 1rem; line-height: 1.6;">${message}</p>
                <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                    <button id="confirmCancel"  class="confirm-btn confirm-btn--neutral">Cancel</button>
                    <button id="confirmDiscard" class="confirm-btn confirm-btn--danger">Discard</button>
                    <button id="confirmSave"    class="confirm-btn confirm-btn--primary">Save</button>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  document.documentElement.classList.add('scroll-locked');

  document.getElementById('confirmSave')!.onclick = () => {
    modal.remove();
    unlockScroll();
    if (onSave) onSave();
  };

  document.getElementById('confirmDiscard')!.onclick = () => {
    modal.remove();
    unlockScroll();
    if (onDiscard) onDiscard();
  };

  const cancel = () => {
    modal.remove();
    unlockScroll();
    if (onCancel) onCancel();
  };
  document.getElementById('confirmCancel')!.onclick = cancel;
  attachOverlayClose(modal, cancel);
}

/** Port of legacy `_confirmExpensiveOp` (settings.js): fixed overlay + Apply/Cancel. */
export function confirmExpensiveOp(title: string, message: string, onConfirm: () => void): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
        <div style="background:var(--surface);padding:24px;border-radius:12px;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 10px;color:var(--text-ui);font-size:1.05rem;">${title}</h3>
            <p style="margin:0 0 18px;color:var(--text-secondary);font-size:0.9rem;line-height:1.5;">${message}</p>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="_ceo_cancel" style="padding:7px 16px;background:var(--surface2);color:var(--text-ui);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
                <button id="_ceo_confirm" style="padding:7px 16px;background:var(--bar-learned);color:var(--text-on-color);border:none;border-radius:6px;cursor:pointer;font-weight:600;">Apply</button>
            </div>
        </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_ceo_cancel')!.onclick = () => overlay.remove();
  document.getElementById('_ceo_confirm')!.onclick = () => {
    overlay.remove();
    onConfirm();
  };
}
