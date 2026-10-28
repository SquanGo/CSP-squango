import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETTINGS_TABS,
  closeUnifiedSettings,
  getSettingsActiveTab,
  isSettingsOpen,
} from '../app/settingsUI';
import { useAppStore } from '../app/store';
import {
  closeModalWithHistory,
  hasOpenModal,
  lockScroll,
  pushModalState,
  removeCloseModalFromStack,
  unlockScroll,
} from '../app/modal';
import { confirmExpensiveOp } from '../app/confirm';
import {
  algorithmFontSize,
  cornerStickerMode,
  enhancedAccess,
  evilnessFactor,
  evilnessAffectsParity,
  hideInstructions,
  hideParenthesis,
  recalculateAllParity,
  setAlgorithmFontSize,
  setCornerStickerMode,
  setEnhancedAccess,
  setEvilnessFactor,
  setEvilnessAffectsParity,
  setHideInstructions,
  setHideParenthesis,
  toggleTheme,
} from '../app/state';
import { CSP_PREFERENCES_KEY, CSP_TRAINING_KEY, readCspObject, updateCspObject } from '../lib/storage';
import { applyAlgorithmFontSize, applyInstructionVisibility } from '../app/visibility';
import { showToast } from '../app/toast';
import InfoTip from './InfoTip';
import Dropdown from './Dropdown';
import { settingsRow as _row, sectionTitle as _sectionTitle } from './SettingsControls';
import {
  applyHideImgLive,
  applyHoldLive,
  applyImageSizeLive,
  applyPrevBarLive,
  applyTextSizeLive,
  applyTimerSizeLive,
  setEnableInspectionLive,
  setEnableParityQuizLive,
} from '../app/training';

function _toggle(id: string, checked: boolean, onchange: (val: boolean) => void): React.ReactNode {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onchange(e.target.checked)}
      style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
    />
  );
}

function _actionBtn(label: string, onAction: () => void, tipHtml?: string): React.ReactNode {
  return (
    <div
      className="settings-action-btn"
      onClick={onAction}
      style={{
        padding: '11px 16px',
        borderRadius: 10,
        cursor: 'pointer',
        width: '100%',
        marginBottom: 8,
        fontWeight: 600,
        fontSize: '0.92rem',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface2)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-ui)',
      }}
    >
      <span>{label}</span>
      {tipHtml ? <InfoTip tipHtml={tipHtml} /> : null}
    </div>
  );
}

function Slider(props: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  precision?: number;
  tipHtml?: string;
}): React.ReactNode {
  const {
    id,
    label,
    min,
    max,
    step,
    value,
    onChange,
    unit = '',
    precision,
    tipHtml,
  } = props;
  const formatValue = useCallback(
    (val: number) => (precision === undefined ? String(val) : val.toFixed(precision)),
    [precision],
  );
  const [inputValue, setInputValue] = useState(() => formatValue(value));

  useEffect(() => {
    setInputValue(formatValue(value));
  }, [value, formatValue]);

  const commitInputValue = () => {
    const input = inputValue.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(input)) return;
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, parsed));
    const stepCount = Math.round((clamped - min) / step);
    const stepped = Math.min(max, Math.max(min, min + stepCount * step));
    const decimals = Math.max(
      precision ?? 0,
      (String(step).split('.')[1] || '').length,
      (String(min).split('.')[1] || '').length,
    );
    const nextValue = Number(stepped.toFixed(decimals));
    setInputValue(formatValue(nextValue));
    onChange(nextValue);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          <label
            htmlFor={`${id}Value`}
            style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: '0.92rem' }}
          >
            {label}
          </label>
          {tipHtml ? <InfoTip tipHtml={tipHtml} /> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            id={`${id}Value`}
            type="text"
            inputMode="decimal"
            value={inputValue}
            aria-label={`${label} value`}
            style={{
              width: 48,
              minWidth: 0,
              flex: '0 0 48px',
              boxSizing: 'border-box',
              padding: '3px 5px',
              border: '1px solid var(--border-color)',
              borderRadius: 5,
              background: 'var(--surface)',
              color: 'var(--text-ui)',
              textAlign: 'left',
              font: 'inherit',
              fontSize: '0.85rem',
            }}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInputValue();
              }
            }}
          />
          {unit ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{unit}</span> : null}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ width: '100%', cursor: 'pointer' }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function _triggerParityLiveUpdate(): void {
  const backdrop = document.querySelector('.parity-tracer-backdrop');
  if (!backdrop) return;
  const input = backdrop.querySelector('input[type="text"]');
  if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── TAB: Homescreen ───────────────────────────────────────────────────────────
function HomescreenTab(): React.ReactNode {
  useAppStore();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const [fontPreview, setFontPreview] = useState<number>(algorithmFontSize);

  return (
    <>
      {_sectionTitle('Display')}
      {_row('Dark Mode', _toggle('hs_themeToggle', isDark, (v) => toggleTheme(v)), 'Switch between light and dark mode.')}
      {_row(
        'Hide Instruction Buttons',
        _toggle('hs_hideInstructionsToggle', hideInstructions, (v) => {
          setHideInstructions(v);
          applyInstructionVisibility();
        }),
        'Hide all &#9432; instruction buttons across the app.<br><br><strong>Keyboard shortcut:</strong> Alt+H',
      )}
      {_row(
        'Hide Parentheses',
        _toggle('hs_hideParenthesisToggle', hideParenthesis, (v) => setHideParenthesis(v)),
        'Removes parentheses and switches the alg font from monospace to Arial for a cleaner look.<br><br><strong>Keyboard shortcut:</strong> Alt+P',
      )}

      <Slider
        id="hs_algFontSizeSlider"
        label="Algorithm Font Size"
        min={10}
        max={20}
        step={1}
        value={fontPreview}
        unit="px"
        onChange={(size) => {
          setFontPreview(size);
          setAlgorithmFontSize(size);
          applyAlgorithmFontSize(size);
        }}
      />

      {_sectionTitle('Tools')}
      {_actionBtn(
        'Color Scheme Settings',
        () => (window as unknown as { openColorSchemeModal?: () => void }).openColorSchemeModal?.(),
        'Change your Square-1 colour scheme. This affects parity tracing and draw-scramble visualizations.',
      )}
      {_actionBtn(
        'Homepage Image Settings',
        () => (window as unknown as { openHomepageImageSettings?: () => void }).openHomepageImageSettings?.(),
        'Preview and customize homepage case images.',
      )}
      {_actionBtn(
        'Quick Edit',
        () => (window as unknown as { openQuickEditModal?: () => void }).openQuickEditModal?.(),
        'Bulk-edit case algs, names and subtitles. Intended for preset creators.<br><br><strong>Keyboard shortcut:</strong> Alt+Q',
      )}
      {_actionBtn(
        'Learning Order',
        () => (window as unknown as { openLearningOrderModal?: () => void }).openLearningOrderModal?.(),
        'Arrange cases into a learning order and group related cases together. Intended for preset creators.',
      )}

      {_sectionTitle('Access')}
      {_row(
        'Enable Enhanced Access',
        _toggle('hs_enhancedAccessToggle', enhancedAccess, (v) => setEnhancedAccess(v)),
        'Unlocks alg editing inside Edit Case and Quick Edit. Keep off unless you are building a preset.',
      )}
    </>
  );
}

// ── TAB: Parity Tracer ────────────────────────────────────────────────────────
function ParityTab(): React.ReactNode {
  useAppStore();
  const [ptSize, setPtSize] = useState<number>(Number(readCspObject(CSP_PREFERENCES_KEY).ptImageSize) || 200);
  const [z2On, setZ2On] = useState<boolean>(() => {
    return readCspObject(CSP_PREFERENCES_KEY).z2Tracing !== false;
  });
  const [showArrow, setShowArrow] = useState<boolean>(() => {
    const arrow = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
    return !arrow || typeof arrow !== 'object' || (arrow as { enabled?: boolean }).enabled !== false;
  });

  let arrowSettings = { color: 'rgba(253,34,34,0.7)', opacity: 0.7, strokeWidth: 1.6, radius: 0.3 };
  try {
    const arrow = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
    if (arrow && typeof arrow === 'object') arrowSettings = { ...arrowSettings, ...arrow as Partial<typeof arrowSettings> };
  } catch {
    // ignore
  }

  const [arrowOpacity, setArrowOpacity] = useState<number>(Math.round(arrowSettings.opacity * 100));
  const [arrowStroke, setArrowStroke] = useState<number>(arrowSettings.strokeWidth);
  const [arrowRadius, setArrowRadius] = useState<number>(arrowSettings.radius);

  const saveArrowProp = (prop: 'opacity' | 'strokeWidth' | 'radius', val: number) => {
    let settings = { color: 'rgba(253,34,34,0.7)', opacity: 0.7, strokeWidth: 1.6, radius: 0.3 };
    try {
      const arrow = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
      if (arrow && typeof arrow === 'object') settings = { ...settings, ...arrow as Partial<typeof settings> };
    } catch {
      // ignore
    }
    settings[prop] = val;
    updateCspObject(CSP_PREFERENCES_KEY, {
      ptArrow: { ...settings, enabled: showArrow },
    });
    if (prop === 'opacity') setArrowOpacity(Math.round(val * 100));
    if (prop === 'strokeWidth') setArrowStroke(val);
    if (prop === 'radius') setArrowRadius(val);
    _triggerParityLiveUpdate();
  };

  const toggleEvilness = (confirmTitle: string, confirmMsg: string, apply: () => void) => {
    confirmExpensiveOp(confirmTitle, confirmMsg, () => {
      apply();
    });
  };

  return (
    <>
      {_sectionTitle('Tracing Method')}
      {_row(
        'Corner Sticker for Tracing',
        <Dropdown
          id="pt_cornerSticker"
          className="custom-dropdown--fit-options"
          value={cornerStickerMode}
          options={[
            { value: 'counterclockwise', label: 'Counter-clockwise sticker' },
            { value: 'clockwise', label: 'Clockwise sticker' },
          ]}
          onChange={(value) => {
            setCornerStickerMode(value);
            _triggerParityLiveUpdate();
          }}
          style={{
            padding: '5px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            backgroundColor: 'var(--surface)',
            color: 'var(--text-ui)',
          }}
        />,
        'Corner sticker mode determines which sticker (left-most sticker or right-most sticker) of the corner you use for tracing. This doesn not affect parity calculations, just your personal preference.',
      )}
      {_row(
        'z2 Tracing for 6/8-Edge Cases',
        _toggle('pt_z2', z2On, (v) => {
          setZ2On(v);
          updateCspObject(CSP_PREFERENCES_KEY, { z2Tracing: v });
          _triggerParityLiveUpdate();
        }),
        'z2 tracing for 6 and 8 edge cases means you prioritize the more edge-dense face to start your tracing, regardless of which layer it is on. This is the safest tracing mode. If you do not do z2 tracing, for 2E6E cases parity gets flipped',
      )}

      {_sectionTitle('Visualization')}
      <Slider
        id="pt_imgSize"
        label="Image Size"
        min={100}
        max={400}
        step={10}
        value={ptSize}
        unit="px"
        tipHtml="Image size controls how big the square-1 visualization appears. Adjust this based on your screen size and preference."
        onChange={(val) => {
          setPtSize(val);
          updateCspObject(CSP_PREFERENCES_KEY, { ptImageSize: val });
          _triggerParityLiveUpdate();
        }}
      />
      {_row(
        'Show Tracing Arrow',
        _toggle('pt_showArrow', showArrow, (v) => {
          setShowArrow(v);
          const current = readCspObject(CSP_PREFERENCES_KEY).ptArrow;
          updateCspObject(CSP_PREFERENCES_KEY, {
            ptArrow: {
              ...(current && typeof current === 'object' ? current : {}),
              enabled: v,
            },
          });
          _triggerParityLiveUpdate();
        }),
        'The circular arrow shows where your tracing starts on each layer. You can customize its appearance or hide it completely.',
      )}

      <div id="pt_arrowSettings" style={{ opacity: showArrow ? '1' : '0.4', pointerEvents: showArrow ? 'auto' : 'none' }}>
        <Slider
          id="pt_opacity"
          label="Arrow Opacity"
          min={0}
          max={100}
          step={1}
          value={arrowOpacity}
          unit="%"
          onChange={(val) => saveArrowProp('opacity', val / 100)}
        />
        <Slider
          id="pt_stroke"
          label="Stroke Width"
          min={0.5}
          max={5}
          step={0.1}
          value={arrowStroke}
          precision={1}
          onChange={(val) => saveArrowProp('strokeWidth', val)}
        />
        <Slider
          id="pt_radius"
          label="Arrow Radius"
          min={0.1}
          max={1.1}
          step={0.01}
          value={arrowRadius}
          precision={2}
          onChange={(val) => saveArrowProp('radius', val)}
        />
      </div>

      {_sectionTitle('Tools')}
      {_actionBtn(
        'Set Tracing Positions',
        () => {
          closeUnifiedSettings();
          setTimeout(() => {
            (window as unknown as { openParityTracingPersonalization?: () => void }).openParityTracingPersonalization?.();
          }, 200);
        },
        'Set the starting piece (edge or corner) for each shape. This determines the order in which pieces are traced and therefore the odds/evens assigned to your algs.',
      )}

      {_sectionTitle('Evilness')}
      {_row(
        'Enable Evilness Factor',
        _toggle('pt_evilness', evilnessFactor, (v) =>
          toggleEvilness(
            `${v ? 'Enable' : 'Disable'} Evilness factor?`,
            'This will update the parity calculations and may freeze your page for a brief moment.',
            () => {
              setEvilnessFactor(v);
              recalculateAllParity();
              showToast(`Evilness ${v ? 'enabled' : 'disabled'}`, 3000, 'success');
            },
          ),
        ),
        'When enabled, each case can be flagged as "evil". Evil cases add +1 to the parity total, flipping the result.',
      )}
      <div id="pt_evilSubSettings" style={{ opacity: evilnessFactor ? '1' : '0.4', pointerEvents: evilnessFactor ? 'auto' : 'none' }}>
        {_row(
          'Evilness Affects Parity',
          _toggle('pt_evilStr', evilnessAffectsParity, (v) =>
            toggleEvilness(
              `${v ? 'Enable' : 'Disable'} Evilness in Parity Results?`,
              'This will update the parity calculations and may take a brief moment.',
              () => {
                setEvilnessAffectsParity(v);
                recalculateAllParity();
              },
            ),
          ),
          'When ON, parity in Parity Tracer and on the homescreen also factor in the evilness of each case.',
        )}
        {_actionBtn(
          'Per-case Evilness Settings',
          () => {
            closeUnifiedSettings();
            setTimeout(() => {
              (window as unknown as { _openEvilnessCasesFromSettings?: () => void })._openEvilnessCasesFromSettings?.();
            }, 200);
          },
          'Mark individual cases as evil or good.',
        )}
      </div>
    </>
  );
}

// ── TAB: Trainer ──────────────────────────────────────────────────────────────
function TrainerTab(): React.ReactNode {
  const training = readCspObject(CSP_TRAINING_KEY);
  const [imgSize, setImgSize] = useState<number>(Number(training.scramImageSize) || 280);
  const [txtSize, setTxtSize] = useState<number>(Number(training.scramTextSize) || 16);
  const [tmrSize, setTmrSize] = useState<number>(Number(training.timerSize) || 80);
  const [holdVal, setHoldVal] = useState<number>(Number(training.holdToStart) || 0.22);
  const [showPrev, setShowPrev] = useState<boolean>(training.showPrevScram === true);
  const [insp, setInsp] = useState<boolean>(training.inspection === true);
  const [pquiz, setPquiz] = useState<boolean>(training.parityQuiz === true);
  const [beep, setBeep] = useState<boolean>(training.inspectionBeep === true);
  const [hideImg, setHideImg] = useState<boolean>(training.hideScramImage === true);

  return (
    <>
      {_sectionTitle('Scramble Display')}
      <Slider
        id="tr_imgSize"
        label="Image Size"
        min={100}
        max={400}
        step={10}
        value={imgSize}
        unit="px"
        onChange={(val) => {
          setImgSize(val);
          updateCspObject(CSP_TRAINING_KEY, { scramImageSize: val });
          applyImageSizeLive(val);
        }}
      />
      <Slider
        id="tr_txtSize"
        label="Scramble Text Size"
        min={10}
        max={24}
        step={1}
        value={txtSize}
        unit="px"
        onChange={(val) => {
          setTxtSize(val);
          updateCspObject(CSP_TRAINING_KEY, { scramTextSize: val });
          applyTextSizeLive(val);
        }}
      />

      {_sectionTitle('Timer')}
      <Slider
        id="tr_tmrSize"
        label="Timer Text Size"
        min={30}
        max={120}
        step={2}
        value={tmrSize}
        unit="px"
        onChange={(val) => {
          setTmrSize(val);
          updateCspObject(CSP_TRAINING_KEY, { timerSize: val });
          applyTimerSizeLive(val);
        }}
      />
      <Slider
        id="tr_hold"
        label="Hold-to-Start"
        min={0.1}
        max={0.7}
        step={0.01}
        value={holdVal}
        unit="s"
        precision={2}
        tipHtml="How long you must hold the spacebar (or press the timer zone) before starting the timer."
        onChange={(val) => {
          setHoldVal(val);
          updateCspObject(CSP_TRAINING_KEY, { holdToStart: val });
          applyHoldLive(val);
        }}
      />

      {_sectionTitle('Display')}
      {_row(
        'Hide Scramble Image',
        _toggle('tr_hideImg', hideImg, (v) => {
          setHideImg(v);
          updateCspObject(CSP_TRAINING_KEY, { hideScramImage: v });
          applyHideImgLive(v);
        }),
        'Hides the scramble image and centers the timer.',
      )}

      {_row(
        'Show Previous Scramble',
        _toggle('tr_showPrev', showPrev, (v) => {
          setShowPrev(v);
          updateCspObject(CSP_TRAINING_KEY, { showPrevScram: v });
          applyPrevBarLive();
        }),
        'Shows the previous scramble at the very bottom of the screen.',
      )}

      {_sectionTitle('Inspection')}
      {_row('Enable Inspection', _toggle('tr_insp', insp, (v) => {
        setInsp(v);
        updateCspObject(CSP_TRAINING_KEY, { inspection: v });
        setEnableInspectionLive(v);
        if (!v) {
          setPquiz(false);
          updateCspObject(CSP_TRAINING_KEY, { parityQuiz: false });
          setEnableParityQuizLive(false);
        }
      }))}
      <div id="tr_pquizRow" style={{ opacity: insp ? '1' : '0.4', pointerEvents: insp ? 'auto' : 'none' }}>
        {_row(
          'Parity Quiz During Inspection',
          _toggle('tr_pquiz', pquiz, (v) => {
            const inspOn = readCspObject(CSP_TRAINING_KEY).inspection === true;
            if (!inspOn) {
              setPquiz(false);
              return;
            }
            setPquiz(v);
            updateCspObject(CSP_TRAINING_KEY, { parityQuiz: v });
            setEnableParityQuizLive(v);
          }),
          'During inspection, the trainer will quiz you about the parity state of the current scramble',
        )}
        {_row(
          'Inspection Beep (8s / 12s)',
          _toggle('tr_beep', beep, (v) => {
            setBeep(v);
            updateCspObject(CSP_TRAINING_KEY, { inspectionBeep: v });
          }),
          'Play a beep once at 8 seconds, a double beep at 12 seconds, and a triple beep at 15 seconds.',
        )}
      </div>
    </>
  );
}

const SECTION_CONTENT = {
  homescreen: HomescreenTab,
  parity: ParityTab,
  trainer: TrainerTab,
};

// All sections stay mounted in one scrollable panel.
export default function SettingsModal(): React.ReactNode {
  useAppStore();
  const tab = getSettingsActiveTab();
  const open = isSettingsOpen();
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>(tab);

  const closeSettings = useCallback(() => {
    closeModalWithHistory(closeUnifiedSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    pushModalState('unifiedSettingsModal', closeSettings);
    return () => {
      removeCloseModalFromStack(closeSettings);
      if (!hasOpenModal()) unlockScroll();
    };
  }, [open, closeSettings]);

  const jumpToSection = useCallback((id: string, smooth = true) => {
    const panel = panelRef.current;
    const section = document.getElementById(`settingsSection_${id}`);
    if (!panel || !section) return;
    const top = section.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    panel.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' });
    setActiveSection(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    jumpToSection(tab, false);
    applyInstructionVisibility();
  }, [tab, open, jumpToSection]);

  const updateActiveSection = () => {
    const panel = panelRef.current;
    if (!panel) return;
    let active: string = SETTINGS_TABS[0].id;
    const top = panel.getBoundingClientRect().top;
    for (const section of SETTINGS_TABS) {
      const heading = document.getElementById(`settingsSection_${section.id}`);
      if (heading && heading.getBoundingClientRect().top <= top + 28) active = section.id;
    }
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2) active = SETTINGS_TABS[SETTINGS_TABS.length - 1].id;
    setActiveSection(active);
  };

  if (!open) return null;

  return (
    <div id="unifiedSettingsModal" className="modal active" style={{ zIndex: 10010 }}>
      <div className="modal-content unified-settings-content" role="dialog" aria-modal="true" aria-labelledby="settingsHeading">
        <div className="settings-header">
          <h2 id="settingsHeading">Settings</h2>
          <button className="close-btn" aria-label="Close settings" onClick={closeSettings}>&times;</button>
        </div>
        <div className="settings-layout">
          <nav id="settingsSidebar" aria-label="Settings sections">
            {SETTINGS_TABS.map((section) => (
              <button
                key={section.id}
                id={`settingsTab_${section.id}`}
                data-tab={section.id}
                title={section.label}
                aria-label={section.label}
                aria-current={activeSection === section.id ? 'location' : undefined}
                onClick={() => jumpToSection(section.id)}
              >
                <span
                  className={
                    `themed-icon themed-icon--${
                      section.id === 'homescreen' ? 'settings' : section.id === 'parity' ? 'tracing' : 'training'
                    }`
                  }
                  style={{ width: 24, height: 24 }}
                  aria-hidden="true"
                />
              </button>
            ))}
          </nav>
          <div id="settingsPanel" ref={panelRef} onScroll={updateActiveSection}>
            {SETTINGS_TABS.map((section) => {
              const Content = SECTION_CONTENT[section.id];
              return (
                <section key={section.id} id={`settingsSection_${section.id}`} aria-labelledby={`settingsHeading_${section.id}`}>
                  <h3 id={`settingsHeading_${section.id}`} className="settings-section-heading">{section.label}</h3>
                  <Content />
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
