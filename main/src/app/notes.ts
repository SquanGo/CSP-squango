import { closeModalWithHistory, lockScroll, pushModalState } from './modal';
import { getDisplayName, comments, generalNotes, setComment, setGeneralNotes } from './state';
import { getCaseId } from '../data/cases';
import { showToast } from './toast';
import { showSaveDiscardConfirmation } from './confirm';
import { sanitizeNoteHTML } from './algDisplay';

// ── Case Notes ───────────────────────────────────────────────────────────────
let originalNoteContent = '';
let notesModalCaseName = '';
let notesModalViewMode = false;

export function openNotesModal(
  caseName: string,
  startInViewMode = false,
  openedFromTrainingCaseInfo = false,
): void {
  const caseId = getCaseId(caseName);
  if (caseId === undefined) return;
  const comment = comments.get(caseId) || '';
  originalNoteContent = comment;
  notesModalCaseName = caseName;
  notesModalViewMode = startInViewMode;

  const existingMenu = document.getElementById('caseContextMenu');
  if (existingMenu) existingMenu.remove();

  pushModalState('notesModal', closeNotesModal);

  const modal = document.createElement('div');
  modal.className = `modal active${startInViewMode ? ' training-overlay-modal' : ''}${openedFromTrainingCaseInfo ? ' training-followup-modal' : ''}`;
  modal.id = 'notesModal';
  const escaped = caseName.replace(/'/g, "\\'");
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; min-height: 20vh;">
            <div class="modal-header">
                <span class="modal-title">Notes: ${getDisplayName(caseName)}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${startInViewMode ? `<button id="notesModalEditBtn" style="padding: 6px 16px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">Edit</button>` : ''}
                    <button onclick="showNotesInfoModal()" style="background: var(--surface2); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; width: 32px; height: 32px;" title="Help" onmouseover="this.style.background='var(--surface-border)'" onmouseout="this.style.background='var(--surface2)'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button class="close-btn" onclick="attemptCloseNotesModal('${escaped}')">&times;</button>
                </div>
            </div>
            <div class="modal-body">
                ${startInViewMode ? `<div id="notesView" style="min-height: 100px; overflow-wrap: anywhere;"></div>` : ''}
                <textarea id="notesTextarea" style="width: 100%; height: 200px; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; resize: vertical;${startInViewMode ? ' display: none;' : ''}"></textarea>
                ${startInViewMode ? '' : `
                <div style="text-align: center; margin-top: 15px;">
                    <button onclick="saveNotes('${escaped}')" style="padding: 10px 20px; background: var(--bar-learned); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; font-weight: 600;">Save</button>
                    <button onclick="attemptCloseNotesModal('${escaped}')" style="padding: 10px 20px; background: var(--delete-btn-bg); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                </div>`}
            </div>
        </div>
    `;

  lockScroll();
  document.body.appendChild(modal);
  const textarea = document.getElementById('notesTextarea') as HTMLTextAreaElement;
  textarea.value = comment;
  if (startInViewMode) {
    renderNotesView(comment);
    const editButton = document.getElementById('notesModalEditBtn');
    if (editButton) editButton.onclick = toggleTrainingNotesEdit;
  }
}

function renderNotesView(content: string): void {
  const view = document.getElementById('notesView');
  if (!view) return;
  view.innerHTML = content.trim()
    ? sanitizeNoteHTML(content)
    : '<span style="color: var(--text-muted); font-style: italic;">No notes for this case.</span>';
}

function toggleTrainingNotesEdit(): void {
  const view = document.getElementById('notesView');
  const textarea = document.getElementById('notesTextarea') as HTMLTextAreaElement | null;
  const button = document.getElementById('notesModalEditBtn');
  if (!view || !textarea || !button) return;

  if (notesModalViewMode) {
    notesModalViewMode = false;
    view.style.display = 'none';
    textarea.style.display = 'block';
    button.textContent = 'Save';
    button.onclick = () => saveNotes(notesModalCaseName);
  } else {
    notesModalViewMode = true;
    renderNotesView(textarea.value);
    view.style.display = 'block';
    textarea.style.display = 'none';
    button.textContent = 'Edit';
    button.onclick = toggleTrainingNotesEdit;
  }
}

export function closeNotesModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('notesModal');
    if (modal) {
      modal.remove();
      document.documentElement.classList.remove('scroll-locked');
    }
  });
}

export function attemptCloseNotesModal(caseName: string): void {
  const textarea = document.getElementById('notesTextarea') as HTMLTextAreaElement | null;
  const currentContent = textarea ? textarea.value.trim() : '';
  if (currentContent !== originalNoteContent) {
    showSaveDiscardConfirmation(
      'You have unsaved changes. Do you want to save them?',
      () => saveNotes(caseName),
      () => {
        originalNoteContent = '';
        closeNotesModal();
      },
      null,
    );
  } else {
    closeNotesModal();
  }
}

export function saveNotes(caseName: string): void {
  const textarea = document.getElementById('notesTextarea') as HTMLTextAreaElement | null;
  const noteText = textarea ? textarea.value.trim() : '';
  setComment(caseName, noteText);
  closeNotesModal();
  showToast('Notes saved!', 2000, 'success');
}

// ── Notes info modal ─────────────────────────────────────────────────────────
export function showNotesInfoModal(): void {
  let infoModal = document.getElementById('notesInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'notesInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">Notes Guide</span>
                    <button class="training-info-close" onclick="closeNotesInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text"><strong>Text Formatting:</strong> Notes support basic HTML formatting:<br>
                        &bull; <b>Bold</b>: <code>&lt;b&gt;bold&lt;/b&gt;</code> or <code>&lt;strong&gt;bold&lt;/strong&gt;</code><br>
                        &bull; <i>Italic</i>: <code>&lt;i&gt;italic&lt;/i&gt;</code> or <code>&lt;em&gt;italic&lt;/em&gt;</code><br>
                        &bull; <u>Underline</u>: <code>&lt;u&gt;underline&lt;/u&gt;</code><br>
                        &bull; <s>Strikethrough</s>: <code>&lt;s&gt;strikethrough&lt;/s&gt;</code><br>
                        &bull; <span style="color:red;">Colored Text</span>: <code>&lt;font color="red"&gt;colored text&lt;/font&gt;</code><br>
                        &bull; <code>&lt;br&gt;</code> for line breaks<br>
                        &bull; <code>&lt;a href="url"&gt;link&lt;/a&gt;</code> for <span role="button" tabindex="0" onclick="return false" onkeydown="return false" style="color:#00f;text-decoration:underline;cursor:pointer;user-select:none;">links</span><br> <br>
                    <strong>Preset makers, write notes with text formattings!! It's so much easier to read.</strong></div>

                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text">If you want to write notes that involve <b>more than one case</b>, consider using general notes (inside the menu bar) instead.</div>
                    </div>

                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text"><strong>Notes suggestions:</strong><br>
                        &bull; Something short that reminds you of either the algs or the evilness.<br>
                        &bull; Or you can write whatever floats your boat... have fun<br></div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }

  pushModalState('notesInfoModal', closeNotesInfoModal);
  infoModal.classList.add('active');
}

export function closeNotesInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('notesInfoModal');
    if (modal) {
      modal.classList.remove('active');
    }
  });
}

// ── General Notes ────────────────────────────────────────────────────────────
let originalGeneralNotes = '';

export function openGeneralNotesModal(): void {
  const existingMenu = document.getElementById('caseContextMenu');
  if (existingMenu) existingMenu.remove();

  pushModalState('generalNotesModal', closeGeneralNotesModal);

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'generalNotesModal';
  document.body.appendChild(modal);
  modal.getBoundingClientRect();
  modal.classList.add('active');
  modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 85vh; height: 85vh; display: flex; flex-direction: column;">
            <div class="modal-header" style="flex-shrink: 0;">
                <span class="modal-title">General Notes</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button id="editGeneralNotesBtn" onclick="toggleEditGeneralNotes()" style="padding: 6px 16px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">Edit</button>
                    <button id="saveGeneralNotesBtn" onclick="saveGeneralNotes()" style="padding: 6px 16px; background: var(--bar-learned); color: var(--text-on-color); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.9rem; display: none;">Save</button>
                    <button id="generalNotesInfoBtn" onclick="showGeneralNotesInfoModal()" style="background: var(--surface2); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; padding: 6px; border-radius: 8px; display: none; align-items: center; justify-content: center; transition: all 0.2s; width: 32px; height: 32px;" title="Help" onmouseover="this.style.background='var(--surface-border)'" onmouseout="this.style.background='var(--surface2)'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button class="close-btn" onclick="attemptCloseGeneralNotesModal()">&times;</button>
                </div>
            </div>
            <div class="modal-body" style="flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 0;">
                <div id="generalNotesView" style="flex: 1; padding: 20px; overflow-y: auto;"></div>
                <div id="generalNotesEdit" style="flex: 1; display: none; flex-direction: column; padding: 20px; overflow: hidden;">
                    <textarea id="generalNotesTextarea" style="flex: 1; width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9rem; resize: none; overflow-y: auto;"></textarea>
                </div>
            </div>
        </div>
    `;

  renderGeneralNotes();
}

export function closeGeneralNotesModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('generalNotesModal');
    if (modal) {
      modal.remove();
    }
  });
}

export function attemptCloseGeneralNotesModal(): void {
  const viewDiv = document.getElementById('generalNotesView') as HTMLElement | null;
  if (viewDiv && viewDiv.style.display === 'none') {
    const textarea = document.getElementById('generalNotesTextarea') as HTMLTextAreaElement | null;
    const currentContent = textarea ? textarea.value : '';
    if (currentContent !== originalGeneralNotes) {
      showSaveDiscardConfirmation(
        'You have unsaved changes. Do you want to save them?',
        () => {
          saveGeneralNotes();
          closeGeneralNotesModal();
        },
        () => {
          originalGeneralNotes = '';
          closeGeneralNotesModal();
        },
        null,
      );
    } else {
      closeGeneralNotesModal();
    }
  } else {
    closeGeneralNotesModal();
  }
}

function renderGeneralNotes(): void {
  const viewDiv = document.getElementById('generalNotesView');
  if (!viewDiv) return;

  if (generalNotes.trim()) {
    const isFullHTML = /<!DOCTYPE|<html/i.test(generalNotes);
    if (isFullHTML) {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width: 100%; height: 100%; border: none; min-height: 400px;';
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      viewDiv.innerHTML = '';
      viewDiv.style.padding = '0';
      viewDiv.appendChild(iframe);
      iframe.contentDocument?.open();
      iframe.contentDocument?.write(generalNotes);
      iframe.contentDocument?.close();

      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      iframe.contentDocument?.documentElement.setAttribute('data-theme', theme);

      const themeStyle = iframe.contentDocument?.createElement('style');
      if (themeStyle && iframe.contentDocument) {
        themeStyle.id = 'sqg-theme-vars';
        const readVar = (name: string) =>
          getComputedStyle(document.documentElement).getPropertyValue(name);
        themeStyle.textContent = `
                :root {
                    --background: ${readVar('--background')};
                    --surface:    ${readVar('--surface')};
                    --text-ui:        ${readVar('--text-ui')};
                    --text-secondary: ${readVar('--text-secondary')};
                    --accent:     ${readVar('--accent')};
                    --border-color: ${readVar('--border-color')};
                    --surface-border: ${readVar('--surface-border')};
                }
                body {
                    background: var(--background);
                    color: var(--text-ui);
                }
                a { color: var(--accent); }
            `;
        iframe.contentDocument.head.appendChild(themeStyle);
      }
    } else {
      viewDiv.innerHTML = generalNotes;
    }
  } else {
    viewDiv.innerHTML =
      '<p style="color: var(--text-muted); font-style: italic; text-align: center;">No notes yet. Click Edit to add your first note!</p>';
  }
}

function switchToViewMode(): void {
  const viewDiv = document.getElementById('generalNotesView');
  const editDiv = document.getElementById('generalNotesEdit');
  const editBtn = document.getElementById('editGeneralNotesBtn');
  const saveBtn = document.getElementById('saveGeneralNotesBtn');
  const infoBtn = document.getElementById('generalNotesInfoBtn');

  if (viewDiv) viewDiv.style.display = 'block';
  if (editDiv) editDiv.style.display = 'none';
  if (editBtn) editBtn.style.display = 'block';
  if (saveBtn) saveBtn.style.display = 'none';
  if (infoBtn) infoBtn.style.display = 'none';
  renderGeneralNotes();
}

export function toggleEditGeneralNotes(): void {
  const viewDiv = document.getElementById('generalNotesView');
  const editDiv = document.getElementById('generalNotesEdit');
  const textarea = document.getElementById('generalNotesTextarea') as HTMLTextAreaElement | null;
  const editBtn = document.getElementById('editGeneralNotesBtn');
  const saveBtn = document.getElementById('saveGeneralNotesBtn');
  const infoBtn = document.getElementById('generalNotesInfoBtn');

  if (viewDiv) viewDiv.style.display = 'none';
  if (editDiv) editDiv.style.display = 'flex';
  if (textarea) textarea.value = generalNotes;
  originalGeneralNotes = generalNotes;
  if (editBtn) editBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'block';
  if (infoBtn) infoBtn.style.display = 'flex';
}

export function saveGeneralNotes(): void {
  const textarea = document.getElementById('generalNotesTextarea') as HTMLTextAreaElement | null;
  setGeneralNotes(textarea ? textarea.value : '');
  originalGeneralNotes = generalNotes;
  switchToViewMode();
  showToast('Notes saved!', 2000, 'success');
}

export function showGeneralNotesInfoModal(): void {
  let infoModal = document.getElementById('generalNotesInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'generalNotesInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">General Notes Guide</span>
                    <button class="training-info-close" onclick="closeGeneralNotesInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text"><strong>General notes</strong> are shared across all cases. They support the same HTML formatting as per-case notes.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text">You can also paste a full HTML document here. It will be rendered inside an iframe.</div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }
  pushModalState('generalNotesInfoModal', closeGeneralNotesInfoModal);
  infoModal.classList.add('active');
}

export function closeGeneralNotesInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('generalNotesInfoModal');
    if (modal) {
      modal.classList.remove('active');
    }
  });
}
