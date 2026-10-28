/**
 * Sidebar, profile popup, color-scheme modal, about & homepage-info modals —
 * ported 1:1 from legacy `js/modals.js` (generateModalHTML, sidebar, profile,
 * color scheme, homepage info, about). Imperative DOM: static modal HTML is
 * injected once, open/close functions manage `.active` + scroll lock, and the
 * inline `onclick` handlers in that HTML are backed by `window.*` bridges
 * installed in `installSidebarShims()`.
 */
import {
  applyPreset,
  calculateAndCacheAllParity,
  colorScheme,
  currentPreset,
  data,
  exportData,
  handleFileImport,
  learningCases,
  learnedCases,
  needsParityRecalculation,
  PRESET_CONFIG,
  profileAvatar,
  profileName,
  setColorScheme,
  setProfile,
} from './state';
import { closeModalWithHistory, pushModalState } from './modal';
import { openGeneralNotesModal } from './notes';
import { applyInstructionVisibility } from './visibility';

let sidebarToggleListenerInstalled = false;
import { showToast } from './toast';
import { temporarilyDisablePointerEvents } from './interactionLock';

const AVATARS = [
  'res/avatar.svg',
  'res/avatar/1.svg',
  'res/avatar/2.svg',
  'res/avatar/3.svg',
  'res/avatar/4.svg',
  'res/avatar/5.svg',
  'res/avatar/6.svg',
  'res/avatar/7.svg',
  'res/avatar/8.svg',
];

let tempSelectedAvatar: string | null = null;
let activeProfilePopup: HTMLElement | null = null;
let activeProfilePopupElement: HTMLElement | null = null;

// ── Static modal HTML ─────────────────────────────────────────────────────────
function ensureStaticModals(): void {
  if (document.getElementById('colorSchemeModal')) return;

  const container = document.createElement('div');
  container.id = 'dynamicModals';
  container.innerHTML = `
        <div id="colorSchemeModal" class="modal">
            <div class="modal-content" style="max-width: 500px; max-height: 80vh; min-height: 20vh;">
                <div class="modal-header">
                    <span class="modal-title">Color Scheme Settings</span>
                    <button class="close-btn" onclick="closeColorSchemeModal()">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Top Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="top" data-color="#FFFF00" style="background: #FFFF00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Yellow</button>
                            <button class="color-btn" data-face="top" data-color="#474747" style="background: #474747; color: var(--text-on-color); width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Black</button>
                            <button class="color-btn" data-face="top" data-color="#FFFFFF" style="background: #FFFFFF; color: #000000; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">White</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Bottom Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="bottom" data-color="#FFFF00" style="background: #FFFF00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Yellow</button>
                            <button class="color-btn" data-face="bottom" data-color="#474747" style="background: #474747; color: var(--text-on-color); width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Black</button>
                            <button class="color-btn" data-face="bottom" data-color="#FFFFFF" style="background: #FFFFFF; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">White</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Front Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="front" data-color="#CC0000" style="background: #CC0000; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Red</button>
                            <button class="color-btn" data-face="front" data-color="#00AA00" style="background: #00AA00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Green</button>
                            <button class="color-btn" data-face="front" data-color="#FF8C00" style="background: #FF8C00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Orange</button>
                            <button class="color-btn" data-face="front" data-color="#0066CC" style="background: #0066CC; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Blue</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Right Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="right" data-color="#CC0000" style="background: #CC0000; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Red</button>
                            <button class="color-btn" data-face="right" data-color="#00AA00" style="background: #00AA00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Green</button>
                            <button class="color-btn" data-face="right" data-color="#FF8C00" style="background: #FF8C00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Orange</button>
                            <button class="color-btn" data-face="right" data-color="#0066CC" style="background: #0066CC; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Blue</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Back Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="back" data-color="#CC0000" style="background: #CC0000; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Red</button>
                            <button class="color-btn" data-face="back" data-color="#00AA00" style="background: #00AA00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Green</button>
                            <button class="color-btn" data-face="back" data-color="#FF8C00" style="background: #FF8C00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Orange</button>
                            <button class="color-btn" data-face="back" data-color="#0066CC" style="background: #0066CC; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Blue</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px; color: var(--text-ui);">Left Color:</label>
                        <div style="display: flex; gap: 10px;">
                            <button class="color-btn" data-face="left" data-color="#CC0000" style="background: #CC0000; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Red</button>
                            <button class="color-btn" data-face="left" data-color="#00AA00" style="background: #00AA00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Green</button>
                            <button class="color-btn" data-face="left" data-color="#FF8C00" style="background: #FF8C00; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Orange</button>
                            <button class="color-btn" data-face="left" data-color="#0066CC" style="background: #0066CC; width: 60px; height: 40px; border-radius: 4px; cursor: pointer;">Blue</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Desktop Profile Modal (Popup style) -->
        <div id="profileModalDesktop" class="profile-popup-desktop">
            <div class="profile-popup-content">
                <!-- View Mode -->
                <div id="profileViewDesktop">
                    <div style="text-align: center; padding: 20px 20px 15px; border-bottom: 1px solid var(--surface-border);">
                        <img id="profileAvatarDesktop" src="res/avatar.svg" style="width: 56px; height: 56px; margin-bottom: 10px; border-radius: 50%; border: 3px solid var(--avatar-border-idle);">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <h3 id="profileNameDesktop" style="margin: 0; font-size: 1.2rem; color: var(--text-ui); font-weight: 600;">Profile</h3>
                            <button onclick="switchToEditProfile('Desktop')" style="background: none; border: none; cursor: pointer; padding: 2px; display: flex; align-items: center; color: var(--sidebar-close-color);" title="Edit Profile">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div style="padding: 15px;">
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileLearningProgressDesktop" style="background: var(--bar-learning); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px; position: absolute; left: 0; top: 0;"></div>
                                <div id="profileLearnedProgressDesktop" style="background: var(--bar-learned); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px; position: absolute; left: 0; top: 0; z-index: 1;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between; z-index: 2;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Learned</span>
                                    <span id="profileLearnedTextDesktop" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0/90</span>
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileCoverageProgressDesktop" style="background: var(--bar-coverage); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Coverage</span>
                                    <span id="profileCoverageTextDesktop" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0.0%</span>
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileSafetyProgressDesktop" style="background: var(--bar-safety); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Safety</span>
                                    <span id="profileSafetyTextDesktop" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0.0%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Edit Mode -->
                <div id="profileEditDesktop" style="display: none;">
                    <div style="padding: 15px 20px; border-bottom: 1px solid var(--surface-border); display: flex; align-items: center; gap: 10px;">
                        <button onclick="switchToViewProfile('Desktop')" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: var(--sidebar-close-color);" title="Back">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <span style="font-size: 1rem; font-weight: 600; color: var(--text-ui);">Edit Profile</span>
                    </div>
                    <div style="padding: 15px;">
                        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Name</label>
                        <input id="profileNameInputDesktop" type="text" maxlength="24" style="width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.95rem; margin-bottom: 14px;" placeholder="Your name">
                        <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Choose Avatar</label>
                        <div id="avatarGridDesktop" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;"></div>
                        <button onclick="saveProfileEdit('Desktop')" style="width: 100%; padding: 9px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem;">Save</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mobile Profile Modal (Full modal style) -->
        <div id="profileModalMobile" class="modal">
            <div class="modal-content" style="max-width: 400px;">
                <!-- View Mode -->
                <div id="profileViewMobile">
                    <div class="modal-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span id="profileNameMobileTitle" class="modal-title">Profile</span>
                            <button onclick="switchToEditProfile('Mobile')" style="background: none; border: none; cursor: pointer; padding: 2px; display: flex; align-items: center; color: var(--sidebar-close-color);" title="Edit Profile">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                        </div>
                        <button class="close-btn" onclick="closeProfileModalMobile()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <img id="profileAvatarMobile" src="res/avatar.svg" style="width: 64px; height: 64px; border-radius: 50%; border: 3px solid var(--avatar-border-idle);">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileLearningProgressMobile" style="background: var(--bar-learning); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px; position: absolute; left: 0; top: 0;"></div>
                                <div id="profileLearnedProgressMobile" style="background: var(--bar-learned); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px; position: absolute; left: 0; top: 0; z-index: 1;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between; z-index: 2;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Learned</span>
                                    <span id="profileLearnedTextMobile" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0/90</span>
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileCoverageProgressMobile" style="background: var(--bar-coverage); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Coverage</span>
                                    <span id="profileCoverageTextMobile" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0.0%</span>
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <div class="progress-track" style="border-radius: 8px; height: 24px; position: relative; overflow: hidden;">
                                <div id="profileSafetyProgressMobile" style="background: var(--bar-safety); height: 100%; width: 0%; transition: width 0.5s ease; border-radius: 8px;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between;">
                                    <span style="font-size: 0.75rem; color: var(--text-ui); font-weight: 600;">Safety</span>
                                    <span id="profileSafetyTextMobile" style="font-weight: 700; color: var(--text-ui); font-size: 0.8rem;">0.0%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Edit Mode -->
                <div id="profileEditMobile" style="display: none;">
                    <div class="modal-header">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <button onclick="switchToViewProfile('Mobile')" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; color: var(--sidebar-close-color);" title="Back">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <span class="modal-title">Edit Profile</span>
                        </div>
                        <button class="close-btn" onclick="closeProfileModalMobile()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Name</label>
                        <input id="profileNameInputMobile" type="text" maxlength="24" style="width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 1rem; margin-bottom: 16px;" placeholder="Your name">
                        <label style="display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">Choose Avatar</label>
                        <div id="avatarGridMobile" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;"></div>
                        <button onclick="saveProfileEdit('Mobile')" style="width: 100%; padding: 11px; background: var(--accent); color: var(--text-on-color); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 1rem;">Save</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="aboutModal" class="modal">
            <div class="modal-content" style="
                max-width: 700px;
                border-radius: 14px;
                overflow: hidden;
                background: var(--surface);
            ">
            <!-- Header -->
            <div style="
                background: var(--about-header-bg);
                color: var(--text-on-color);
                padding: 22px 26px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span style="font-size: 1.5rem; font-weight: 600;">
                    About SquanGo CSP
                </span>
                <button class="close-btn" onclick="closeAboutModal()" style="
                    color: var(--text-on-color);
                    font-size: 1.6rem;
                    opacity: 0.9;
                ">&times;</button>
            </div>
            <!-- Body -->
            <div style="
                padding: 28px 30px;
                color: var(--text-ui);
                line-height: 1.65;
                max-height: 70vh;
                overflow-y: auto;
                background: var(--surface2);
            ">
                <section style="margin-bottom: 26px;">
                    <p style="margin: 0; font-size: 1rem; color: var(--text-secondary);">
                    With SquanGo CSP, we had one mission: to create one place that has
                    <span style="font-weight: bold; color: var(--text-ui);">everything you need</span> for CSP,
                    whether it's learning or training.
                    </p>
                </section>
                <section style="
                    background: var(--surface);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 20px;
                    margin-bottom: 22px;
                ">
                    <p style="font-weight: 600; margin-bottom: 6px;">Developers</p>
                    <p style="margin: 0 0 10px 0; color: var(--text-secondary);">
                    Created by <strong>Abid Ibn Ashraf</strong> and <strong>Matt Mao</strong>.
                    </p>
                    <p style="margin: 0 0 10px 0; font-size: 0.95rem; color: var(--text-secondary);">
                    Contact & feedback:
                    <strong>Email us</strong> at <span style="font-weight: bold; color: var(--text-ui);">squango.support@gmail.com</span>
                    </p>
                    <p style="margin: 0; font-size: 0.95rem; color: var(--text-secondary);">
                    <a href=".."
                        target="_blank"
                        style="font-size: 0.95rem; font-weight: 500; color: var(--about-link-color); text-decoration: none;"
                    >
                        Discover more SquanGo websites →
                    </a>
                    </p>
                </section>
                <section style="
                    background: var(--surface);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 20px;
                    margin-bottom: 22px;
                ">
                    <p style="font-weight: 600; margin-bottom: 10px;">Credits & Inspiration</p>
                    <p style="margin: 0 0 10px 0; font-size: 0.95rem; color: var(--text-secondary);">
                    Major credit goes to <strong>Eva Kato (Hashtag Cuber)</strong> for initial
                    design inspirations.
                    </p>
                    </p>
                </section>
                <section style="
                    background: var(--surface);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 20px;
                ">
                    <p style="font-weight: 600; margin-bottom: 8px;">Open Source</p>
                    <a href="https://github.com/Abid-speedcuber/CSP-squango"
                        target="_blank"
                        style="font-size: 0.95rem; font-weight: 500; color: var(--about-link-color); text-decoration: none;"
                    >
                        View repository on GitHub →
                    </a>
                </section>
            </div>
        </div>
        </div>
    `;

  document.body.appendChild(container);

  // Setup color button handlers after modals are created
  document.querySelectorAll('.color-btn').forEach((btn) => {
    const bg = btn.getAttribute('data-color');
    if (bg) {
      const r = parseInt(bg.substr(1, 2), 16);
      const g = parseInt(bg.substr(3, 2), 16);
      const b = parseInt(bg.substr(5, 2), 16);
      (btn as HTMLElement).style.color =
        0.299 * r + 0.587 * g + 0.114 * b > 128
          ? '#000000'
          : getComputedStyle(document.documentElement).getPropertyValue('--text-on-color').trim() || '#ffffff';
    }
    btn.addEventListener('click', () => {
      const face = btn.getAttribute('data-face');
      const color = btn.getAttribute('data-color');
      if (!face || !color) return;

      setColorScheme({ [face + 'Color']: color } as Partial<typeof colorScheme>);

      document
        .querySelectorAll(`.color-btn[data-face="${face}"]`)
        .forEach((b) => b.classList.toggle('selected', b === btn));

      if (needsParityRecalculation()) {
        calculateAndCacheAllParity();
      }
    });
  });
}

// ── Color Scheme Modal ────────────────────────────────────────────────────────
export function openColorSchemeModal(): void {
  const modal = document.getElementById('colorSchemeModal');
  if (!modal) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const themeTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
  document.documentElement.classList.add('scroll-locked');
  modal.style.zIndex = '10015';
  modal.classList.add('active');

  pushModalState('colorSchemeModal', closeColorSchemeModal);

  // Highlight currently selected colors
  document.querySelectorAll('.color-btn').forEach((btn) => {
    const face = btn.getAttribute('data-face');
    const color = btn.getAttribute('data-color');
    if (!face || !color) return;
    const currentColor = (colorScheme as unknown as Record<string, string>)[face + 'Color'];
    btn.classList.toggle('selected', color === currentColor);
    if (color.toLowerCase() === '#ffffff') {
      (btn as HTMLElement).style.backgroundColor = isDark ? themeTextColor : color;
    }
  });
}

export function closeColorSchemeModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('colorSchemeModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.documentElement.classList.remove('scroll-locked');
  });
}

// ── Profile ───────────────────────────────────────────────────────────────────
export function applyProfileUI(): void {
  const btnAvatar = document.getElementById('profileBtnAvatar') as HTMLImageElement | null;
  if (btnAvatar) btnAvatar.src = profileAvatar;
  const deskAvatar = document.getElementById('profileAvatarDesktop') as HTMLImageElement | null;
  if (deskAvatar) deskAvatar.src = profileAvatar;
  const deskName = document.getElementById('profileNameDesktop');
  if (deskName) deskName.textContent = profileName;
  const mobAvatar = document.getElementById('profileAvatarMobile') as HTMLImageElement | null;
  if (mobAvatar) mobAvatar.src = profileAvatar;
  const mobTitle = document.getElementById('profileNameMobileTitle');
  if (mobTitle) mobTitle.textContent = profileName;
}

function buildAvatarGrid(mode: 'Desktop' | 'Mobile'): void {
  const grid = document.getElementById(`avatarGrid${mode}`) as HTMLElement | null;
  if (!grid) return;
  grid.innerHTML = '';
  AVATARS.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'avatar-option' + ((tempSelectedAvatar || profileAvatar) === src ? ' selected' : '');
    img.onclick = () => {
      tempSelectedAvatar = src;
      grid.querySelectorAll('img').forEach((i) => i.classList.remove('selected'));
      img.classList.add('selected');
    };
    grid.appendChild(img);
  });
}

function updateProfileStats(): void {
  const totalCases = data.length;
  const learnedCount = learnedCases.size;
  const learningCount = learningCases.size;
  const learnedPercent = (learnedCount / totalCases) * 100;
  const learningPercent = (learningCount / totalCases) * 100;

  const totalProbability = data.reduce((sum, item) => sum + item.probability, 0);
  const learnedProbability = data
    .filter((item) => learnedCases.has(item.id))
    .reduce((sum, item) => sum + item.probability, 0);

  const coverage = Math.round((learnedProbability / totalProbability) * 100 * 2) / 2;
  const safety = 50 + coverage / 2;

  const modes = ['Desktop', 'Mobile'] as const;
  modes.forEach((mode) => {
    const learningBar = document.getElementById(`profileLearningProgress${mode}`);
    const learnedBar = document.getElementById(`profileLearnedProgress${mode}`);
    const learnedText = document.getElementById(`profileLearnedText${mode}`);
    const coverageProgress = document.getElementById(`profileCoverageProgress${mode}`);
    const coverageText = document.getElementById(`profileCoverageText${mode}`);
    const safetyProgress = document.getElementById(`profileSafetyProgress${mode}`);
    const safetyText = document.getElementById(`profileSafetyText${mode}`);

    if (learningBar) learningBar.style.width = learnedPercent + learningPercent + '%';
    if (learnedBar) learnedBar.style.width = learnedPercent + '%';
    if (learnedText) learnedText.textContent = learnedCount + '/90';
    if (coverageProgress) coverageProgress.style.width = coverage + '%';
    if (coverageText) coverageText.textContent = coverage.toFixed(1) + '%';
    if (safetyProgress) safetyProgress.style.width = safety + '%';
    if (safetyText) safetyText.textContent = safety.toFixed(1) + '%';
  });
}

function showProfilePopup(isPermanent: boolean): void {
  const profileBtn = document.getElementById('profileBtn');
  const popup = document.getElementById('profileModalDesktop');
  if (!profileBtn || !popup) return;

  if (isPermanent && activeProfilePopupElement === profileBtn) {
    hideProfilePopup(true);
    return;
  }

  if (isPermanent && activeProfilePopup) {
    activeProfilePopup.classList.remove('active');
    activeProfilePopup = null;
    activeProfilePopupElement = null;
  }

  if (!isPermanent && activeProfilePopup && activeProfilePopupElement !== profileBtn) {
    return;
  }

  popup.classList.remove('active');
  popup.className = 'profile-popup-desktop' + (isPermanent ? ' permanent' : '');
  popup.classList.add('active');

  const rect = profileBtn.getBoundingClientRect();
  const popupContent = popup.querySelector('.profile-popup-content') as HTMLElement | null;

  setTimeout(() => {
    if (!popupContent) return;
    const popupRect = popupContent.getBoundingClientRect();

    let top = rect.bottom + 15;
    let left = window.innerWidth - popupRect.width - 20;

    if (top + popupRect.height > window.innerHeight - 10) {
      top = rect.top - popupRect.height - 15;
    }
    if (top < 10) top = 10;
    if (left < 10) left = 10;

    popupContent.style.top = top + 'px';
    popupContent.style.left = left + 'px';
  }, 0);

  updateProfileStats();
  applyProfileUI();

  const scrollHandler = () => {
    hideProfilePopup(isPermanent);
    window.removeEventListener('scroll', scrollHandler, true);
  };
  window.addEventListener('scroll', scrollHandler, true);

  if (isPermanent) {
    activeProfilePopup = popup;
    activeProfilePopupElement = profileBtn;

    setTimeout(() => {
      const clickHandler = (e: MouseEvent) => {
        const content = popup.querySelector('.profile-popup-content');
        if (!content!.contains(e.target as Node) && e.target !== profileBtn) {
          hideProfilePopup(true);
          document.removeEventListener('mousedown', clickHandler);
        }
      };
      document.addEventListener('mousedown', clickHandler);
    }, 100);
  }
}

function hideProfilePopup(isPermanent: boolean): void {
  const popup = document.getElementById('profileModalDesktop');
  if (!popup) return;

  if (isPermanent) {
    if (activeProfilePopup) {
      popup.classList.remove('active');
      activeProfilePopup = null;
      activeProfilePopupElement = null;
    }
  } else {
    if (!popup.classList.contains('permanent')) {
      popup.classList.remove('active');
    }
  }
}

export function openProfileModalDesktop(isPermanent = false): void {
  showProfilePopup(isPermanent);
}

export function closeProfileModalDesktop(isPermanent = false): void {
  hideProfilePopup(isPermanent);
}

export function openProfileModalMobile(): void {
  const modal = document.getElementById('profileModalMobile');
  if (!modal) return;

  pushModalState('profileModalMobile', closeProfileModalMobile);

  document.documentElement.classList.add('scroll-locked');
  modal.classList.add('active');

  updateProfileStats();
  applyProfileUI();
}

export function closeProfileModalMobile(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('profileModalMobile');
    if (!modal) return;
    modal.classList.remove('active');
    document.documentElement.classList.remove('scroll-locked');
  });
}

export function openProfileModal(): void {
  const isMobile = window.innerWidth <= 620;
  if (isMobile) {
    openProfileModalMobile();
  } else {
    openProfileModalDesktop(true);
  }
}

export function switchToEditProfile(mode: 'Desktop' | 'Mobile'): void {
  tempSelectedAvatar = profileAvatar;
  const view = document.getElementById(`profileView${mode}`);
  const edit = document.getElementById(`profileEdit${mode}`);
  if (view) view.style.display = 'none';
  if (edit) edit.style.display = 'block';
  const nameInput = document.getElementById(`profileNameInput${mode}`) as HTMLInputElement | null;
  if (nameInput) nameInput.value = profileName === 'Profile' ? '' : profileName;
  buildAvatarGrid(mode);
}

export function switchToViewProfile(mode: 'Desktop' | 'Mobile'): void {
  tempSelectedAvatar = null;
  const edit = document.getElementById(`profileEdit${mode}`);
  const view = document.getElementById(`profileView${mode}`);
  if (edit) edit.style.display = 'none';
  if (view) view.style.display = 'block';
}

export function saveProfileEdit(mode: 'Desktop' | 'Mobile'): void {
  const nameInput = document.getElementById(`profileNameInput${mode}`) as HTMLInputElement | null;
  const newName = nameInput ? nameInput.value.trim() : '';
  const finalName = newName || 'Profile';
  const finalAvatar = tempSelectedAvatar || profileAvatar;
  tempSelectedAvatar = null;
  setProfile(finalName, finalAvatar);
  applyProfileUI();
  switchToViewProfile(mode);
  showToast('Profile saved!', 2000, 'success');
}

// ── About Modal ───────────────────────────────────────────────────────────────
export function openAboutModal(): void {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;

  document.documentElement.classList.add('scroll-locked');
  modal.classList.add('active');

  pushModalState('aboutModal', closeAboutModal);
}

export function closeAboutModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('aboutModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.documentElement.classList.remove('scroll-locked');
  });
}

// ── Homepage Info Modal ───────────────────────────────────────────────────────
export function showHomepageInfoModal(): void {
  pushModalState('homepageInfoModal', closeHomepageInfoModal);

  let infoModal = document.getElementById('homepageInfoModal');
  if (!infoModal) {
    infoModal = document.createElement('div');
    infoModal.id = 'homepageInfoModal';
    infoModal.className = 'training-info-modal';
    infoModal.innerHTML = `
            <div class="training-info-content">
                <div class="training-info-header">
                    <span class="training-info-title">App Guide</span>
                    <button class="training-info-close" onclick="closeHomepageInfoModal()">&times;</button>
                </div>
                <div class="training-info-body">
                    <div class="training-info-item">
                        <div class="training-info-number">1</div>
                        <div class="training-info-text">Click on <strong>Profile</strong> in the top right corner to see your progress stats. The <strong style="color: var(--bar-learned);">green bar (Learned)</strong> shows how many cases out of 90 you have learned. The <strong style="color: var(--accent);">blue bar (Coverage)</strong> tells you how often you will get a CSP you know. The <strong style="color: var(--bar-learning);">orange bar (Safety)</strong> tells you how often you won't get parity (this is equal to Safety + 0.5 * (1 - Safety)).</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">2</div>
                        <div class="training-info-text">Click the <b>checkmark</b> on a case to mark it as <b>learning</b>; click again to mark it as <b>learned</b>. Right click to mark the case as learned; right click again to mark as learning.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">3</div>
                        <div class="training-info-text">The three dots menu of a case lets you<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;1. change the <b>priority state</b> of a case<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;2. <b>add notes</b> for the case<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;3. <b>train the case</b> (you can choose specific angles of the case to train if you want)<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;4. <b>edit case</b> (change case title, subtitles, and the algs if you have Enhanced Access on).</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">4</div>
                        <div class="training-info-text">Sort <strong>By Priority</strong> instead of by Highest Probability to organize cases by learning priority (1-7). However the <b>Learning Cases</b> are the highest priority. Adjust priorities via the three dots menu.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">5</div>
                        <div class="training-info-text"><strong>Hover</strong> over any alg to see its setup and shape path. <strong>Click on the alg</strong> to keep the popup open. Then, you can click the setup to <b>see the parity analysis</b> of the alg, or click on the shape path to <b>watch animation</b> of the alg.</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">5</div>
                        <div class="training-info-text">Use <strong>Color Scheme Settings</strong> to change the color scheme of your squan. Impacts parity tracing and "draw scramble".</div>
                    </div>
                    <div class="training-info-item">
                        <div class="training-info-number">6</div>
                        <div class="training-info-text"><strong>Export/Import Data</strong> in Menu to backup your progress or transfer between devices. Exporting will download a JSON file to your device. To import, simply select that file in the file selector.</div>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(infoModal);
  }

  document.documentElement.classList.add('scroll-locked');
  infoModal.classList.add('active');
}

export function closeHomepageInfoModal(): void {
  closeModalWithHistory(() => {
    const modal = document.getElementById('homepageInfoModal');
    if (modal) {
      modal.classList.remove('active');
      document.documentElement.classList.remove('scroll-locked');
    }
  });
}

// ── Preset handling ───────────────────────────────────────────────────────────
export function handlePresetChange(presetName: string): void {
  const isSamePreset = presetName === currentPreset;

  if (isSamePreset) {
    const reloadModal = document.createElement('div');
    reloadModal.id = 'reloadPresetModal';
    reloadModal.className = 'modal active';
    reloadModal.style.zIndex = '10002';
    reloadModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header" style="background: var(--surface); border-bottom: 2px solid var(--border-color);">
                    <span class="modal-title">Reload ${presetName.replace(/_/g, ' ')}?</span>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin: 0 0 10px 0; font-size: 1rem; line-height: 1.6; color: var(--text-ui);">
                        Reloading will <strong>keep</strong> your learning progress (learned/learning/planned states) and personal preferences (font size, hints, etc.).<br><br>
                        It will <strong>replace</strong> your algs, color scheme, tracing guides, case display names, subtitles, and notes with what's in the newest version of this preset.
                    </p>
                    <p style="font-weight: 500;">
                        We recommend exporting your data before reloading.
                    </p> <br>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button data-action="export" style="padding: 10px 20px; background: transparent; color: var(--nice-case); border: 2px solid var(--nice-case); border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Export First</button>
                        <button data-action="reload" style="padding: 10px 20px; background: transparent; color: var(--evil-case); border: 2px solid var(--evil-case); border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Reload Anyway</button>
                        <button data-action="cancel" style="padding: 10px 20px; background: transparent; color: var(--text-secondary); border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        const close = () => {
          reloadModal.remove();
        };
        (reloadModal.querySelector('.close-btn') as HTMLElement).onclick = () => closeModalWithHistory(close);
    (reloadModal.querySelector('[data-action="export"]') as HTMLElement).onclick = () => {
      exportData();
      showToast('Data exported! You can now safely reload.', 3000, 'success');
    };
    (reloadModal.querySelector('[data-action="reload"]') as HTMLElement).onclick = () => {
      closeModalWithHistory(close);
      document.documentElement.classList.remove('scroll-locked');
      closeSidebar();
      temporarilyDisablePointerEvents();
      void applyPreset(presetName, false, false).then(() => {
        initializePresetSelector();
      });
    };
    (reloadModal.querySelector('[data-action="cancel"]') as HTMLElement).onclick = () => {
      closeModalWithHistory(close);
    };
    pushModalState('reloadPresetModal', close);
    document.body.appendChild(reloadModal);
    return;
  }

  // Validate preset exists in config
  if (!PRESET_CONFIG[presetName]) {
    showToast('Invalid preset selected', 2000, 'error');
    return;
  }

  // Create a custom warning modal with export option
  const warningModal = document.createElement('div');
  warningModal.id = 'presetWarningModal';
  warningModal.className = 'modal active';
  warningModal.style.zIndex = '10002';
  warningModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background: var(--surface); border-bottom: 2px solid var(--border-color);">
                <span class="modal-title" style="color: var(--text-ui);">Warning: Data Loss</span>
                <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <p style="margin: 0 0 15px 0; font-size: 1rem; line-height: 1.6; color: var(--text-ui);">
                    Switching to "<strong>${presetName.replace(/_/g, ' ')}</strong>" will <strong>keep</strong> your learning progress (learned/learning/planned states) and personal preferences (font size, hints, etc.).<br><br>
                    It will <strong>replace</strong> your algs, color scheme, tracing guides, case display names, subtitles, and notes with what's in the preset.
                </p>
                <p style="font-weight: 500;">
                    We recommend exporting your data before reloading.
                </p> <br>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button data-action="export" style="padding: 10px 20px; background: transparent; color: var(--bar-learned); border: 2px solid var(--bar-learned); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.2s;">
                        Export Data First
                    </button>
                    <button data-action="switch" style="padding: 10px 20px; background: transparent; color: var(--parity-invalid); border: 2px solid var(--parity-invalid); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.2s;">
                        Switch Anyway
                    </button>
                    <button data-action="cancel" style="padding: 10px 20px; background: transparent; color: var(--text-secondary); border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.2s;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;

  const close = () => {
    warningModal.remove();
  };
  (warningModal.querySelector('.close-btn') as HTMLElement).onclick = () => closeModalWithHistory(close);
  (warningModal.querySelector('[data-action="export"]') as HTMLElement).onclick = () => {
    exportData();
    showToast('Data exported! You can now safely switch presets.', 3000, 'success');
  };
  (warningModal.querySelector('[data-action="switch"]') as HTMLElement).onclick = () => {
    closeModalWithHistory(close);
    document.documentElement.classList.remove('scroll-locked');
    closeSidebar();
    temporarilyDisablePointerEvents();
    void applyPreset(presetName, false, false).then(() => {
      initializePresetSelector();
      setTimeout(() => openGeneralNotesModal(), 800);
    });
  };
  (warningModal.querySelector('[data-action="cancel"]') as HTMLElement).onclick = () => {
    closeModalWithHistory(close);
    document.documentElement.classList.remove('scroll-locked');
  };
  pushModalState('presetWarningModal', close);
  document.body.appendChild(warningModal);
  document.documentElement.classList.add('scroll-locked');
}

export function populatePresetDropdown(selectorId = 'presetSelector'): void {
  const presetSelector = document.getElementById(selectorId) as HTMLSelectElement | null;
  if (!presetSelector) return;

  presetSelector.innerHTML = '';

  for (const presetName in PRESET_CONFIG) {
    const option = document.createElement('option');
    option.value = presetName;
    option.textContent = presetName.replace(/_/g, ' ').replace(/'/g, "'");
    presetSelector.appendChild(option);
  }

  presetSelector.value = currentPreset;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function initializePresetSelector(): void {
  const currentPresetName = document.getElementById('currentPresetName');
  const presetOptions = document.getElementById('presetOptions');

  if (!currentPresetName || !presetOptions) return;

  currentPresetName.textContent = currentPreset.replace(/_/g, ' ').replace(/'/g, "'");

  presetOptions.innerHTML = '';
  for (const presetName in PRESET_CONFIG) {
    const displayName = presetName.replace(/_/g, ' ').replace(/'/g, "'");
    const isActive = presetName === currentPreset;

    const optionDiv = document.createElement('div');
    optionDiv.className = 'preset-option' + (isActive ? ' active' : '');
    optionDiv.textContent = displayName;

    optionDiv.addEventListener('click', () => handlePresetChange(presetName));
    optionDiv.addEventListener('mouseover', () => {
      if (!isActive) optionDiv.classList.add('preset-option--hover');
    });
    optionDiv.addEventListener('mouseout', () => {
      optionDiv.classList.remove('preset-option--hover');
    });

    presetOptions.appendChild(optionDiv);
  }
}

export function togglePresetExpand(): void {
  const presetOptions = document.getElementById('presetOptions') as HTMLElement | null;
  const expandIcon = document.getElementById('presetExpandIcon') as HTMLElement | null;

  if (!presetOptions || !expandIcon) return;

  if (presetOptions.style.maxHeight === '0px' || presetOptions.style.maxHeight === '') {
    const numPresets = Object.keys(PRESET_CONFIG).length;
    const height = numPresets * 48;
    presetOptions.style.maxHeight = height + 'px';
    expandIcon.style.transform = 'rotate(180deg)';
  } else {
    presetOptions.style.maxHeight = '0px';
    expandIcon.style.transform = 'rotate(0deg)';
  }
}

export function generateSidebarHTML(): void {
  let sidebar = document.getElementById('appSidebar');
  if (sidebar) return;

  sidebar = document.createElement('div');
  sidebar.id = 'appSidebar';
  sidebar.className = 'app-sidebar';
  sidebar.innerHTML = `
        <div class="sidebar-overlay" onclick="closeSidebar()"></div>
        <div class="sidebar-content">
            <div class="sidebar-header">
                <h2 style="margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--text-ui);">Menu</h2>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="sidebar-close-btn instruction-btn" onclick="event.stopPropagation(); showHomepageInfoModal();" aria-label="Instructions" style="color: var(--text-secondary);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button class="sidebar-close-btn" onclick="closeSidebar()" aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="sidebar-body">
                <button class="sidebar-item sidebar-mobile-only" onclick="openProfileModal(); closeSidebar();">
                    <img src="res/avatar.svg" alt="Profile">
                    <span>Profile</span>
                </button>
                <button class="sidebar-item" onclick="closeSidebar(); setTimeout(() => openGeneralNotesModal(), 350);">
                    <span class="themed-icon themed-icon--notes" aria-hidden="true"></span>
                    <span>General Notes</span>
                </button>
                <button class="sidebar-item" onclick="closeSidebar(); setTimeout(() => openTrainerPickerModal(), 350);">
                    <span class="themed-icon themed-icon--training" aria-hidden="true"></span>
                    <span>Trainer</span>
                </button>
                <button class="sidebar-item" onclick="openNewParityAnalysis(null); closeSidebar();">
                    <span class="themed-icon themed-icon--tracing" aria-hidden="true"></span>
                    <span>Parity Tracer</span>
                </button>
                <button class="sidebar-item" onclick="closeSidebar(); setTimeout(()=>window.openUnifiedSettings('homescreen'),350);">
                    <span class="themed-icon themed-icon--training-settings" aria-hidden="true"></span>
                    <span>Settings</span>
                </button>
                <div class="sidebar-divider"></div>
                <div style="padding: 0;">
                    <div id="presetExpandBtn" onclick="togglePresetExpand()" style="padding: 14px 20px; background: transparent; border: none; width: 100%; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: background 0.2s; font-size: 0.95rem; color: var(--text-ui); font-weight: 500;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px; flex-shrink: 0;">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        </svg>
                        <span style="flex: 1; text-align: left;" id="currentPresetName"></span>
                        <svg id="presetExpandIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; transition: transform 0.3s; flex-shrink: 0;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div id="presetOptions" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease;"></div>
                </div>
                <div class="sidebar-divider"></div>
                <button class="sidebar-item" onclick="exportData(); closeSidebar();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Export Data</span>
                </button>
                <label class="sidebar-item" style="cursor: pointer;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span>Import Data</span>
                    <input type="file" id="sidebarImportFile" accept=".json" style="display: none;" onchange="handleFileImport(this.files[0]); closeSidebar();">
                </label>
                <button class="sidebar-item" onclick="openAboutModal(); closeSidebar();">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <span>About</span>
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(sidebar);

  applyInstructionVisibility();

  initializePresetSelector();
}

export function toggleSidebar(): void {
  generateSidebarHTML();
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) {
    const isOpening = !sidebar.classList.contains('active');

    if (isOpening) {
      document.documentElement.classList.add('scroll-locked');
      sidebar.classList.add('active');
    } else {
      sidebar.classList.remove('active');
    }
  }
}

export function closeSidebar(): void {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) {
    sidebar.classList.remove('active');

    document.documentElement.classList.remove('scroll-locked');

    const presetOptions = document.getElementById('presetOptions');
    const expandIcon = document.getElementById('presetExpandIcon');
    if (presetOptions) presetOptions.style.maxHeight = '0px';
    if (expandIcon) expandIcon.style.transform = 'rotate(0deg)';
  }
}

// ── Quick info popup ──────────────────────────────────────────────────────────
export function showQuickInfo(message: string): void {
  const existing = document.getElementById('quickInfoPopup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'quickInfoPopup';
  popup.className = 'quick-info-overlay';
  popup.innerHTML = `
        <div class="quick-info-box">
            <div>${message}</div>
            <button class="quick-info-btn" onclick="document.getElementById('quickInfoPopup').remove()">Got it</button>
        </div>
    `;

  popup.onclick = (e) => {
    if (e.target === popup) popup.remove();
  };

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(popup);
}

// ── Window bridges ────────────────────────────────────────────────────────────
export function installSidebarShims(): void {
  ensureStaticModals();

  const w = window as unknown as Record<string, unknown>;

  w.openColorSchemeModal = openColorSchemeModal;
  w.closeColorSchemeModal = closeColorSchemeModal;
  w.openProfileModal = openProfileModal;
  w.openProfileModalDesktop = openProfileModalDesktop;
  w.closeProfileModalDesktop = closeProfileModalDesktop;
  w.openProfileModalMobile = openProfileModalMobile;
  w.closeProfileModalMobile = closeProfileModalMobile;
  w.switchToEditProfile = switchToEditProfile;
  w.switchToViewProfile = switchToViewProfile;
  w.saveProfileEdit = saveProfileEdit;
  w.openAboutModal = openAboutModal;
  w.closeAboutModal = closeAboutModal;
  w.showHomepageInfoModal = showHomepageInfoModal;
  w.closeHomepageInfoModal = closeHomepageInfoModal;
  w.toggleSidebar = toggleSidebar;
  w.closeSidebar = closeSidebar;
  w.togglePresetExpand = togglePresetExpand;
  w.initializePresetSelector = initializePresetSelector;
  w.populatePresetDropdown = populatePresetDropdown;
  w.showQuickInfo = showQuickInfo;
  w.exportData = exportData;
  w.handleFileImport = handleFileImport;

  // Existing window bridge references (set by other modules' shims).
  w.openGeneralNotesModal = openGeneralNotesModal;

  // The header menu button dispatches this custom event.
  if (!sidebarToggleListenerInstalled) {
    window.addEventListener('sqg:toggle-sidebar', () => toggleSidebar());
    sidebarToggleListenerInstalled = true;
  }

  // Apply the saved profile to the header button on boot.
  applyProfileUI();
}
