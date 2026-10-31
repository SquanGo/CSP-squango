import { useCallback, useEffect, useState } from 'react';
import { getHomepageImageSettings, saveHomepageImageSettingsForReload } from '../app/state';
import { useAppStore } from '../app/store';
import { applyInstructionVisibility } from '../app/visibility';
import { closeModalWithHistory, hasOpenModal, lockScroll, pushModalState, removeCloseModalFromStack, unlockScroll } from '../app/modal';
import { DEFAULT_HOMEPAGE_IMAGE_SETTINGS, renderHomepageShapePreview, type HomepageImageSettings } from '../lib/homepageShapes';
import LinkedStrokeWidthControl from './LinkedStrokeWidthControl';
import { showToast } from '../app/toast';
import InfoTip from './InfoTip';
import { settingsRow as _row } from './SettingsControls';

const FACE_COLOR_KEYS: { key: keyof HomepageImageSettings; label: string }[] = [
  { key: 'topColor', label: 'Top' },
  { key: 'bottomColor', label: 'Bottom' },
];

// ── HOMESCREEN: Homepage Images ──────────────────────────────────────────────
function HomepageImagesSection(): React.ReactNode {
  useAppStore();
  const [settings, setSettings] = useState<HomepageImageSettings>(getHomepageImageSettings());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({ top: '', bottom: '' });
  useEffect(() => {
    const timer = window.setTimeout(() => setPreview({
      top: renderHomepageShapePreview('Left_4_2', settings, 'top'),
      bottom: renderHomepageShapePreview('Paired_edges', settings, 'bottom'),
    }), 60);
    return () => window.clearTimeout(timer);
  }, [settings]);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const update = (patch: Partial<HomepageImageSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  };

  const autoColorRow = (key: 'borderColor' | 'sliceColor', label: string, tip: string) => {
    const isAuto = settings[key] === '';
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
            <label style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.92rem' }}>
              {label}
            </label>
            <InfoTip tipHtml={tip} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={isAuto ? (isDark ? '#c0c0c0' : '#000000') : settings[key]}
              disabled={isAuto}
              style={{
                width: 38,
                height: 26,
                padding: 0,
                border: 'none',
                cursor: isAuto ? 'not-allowed' : 'pointer',
                opacity: isAuto ? 0.4 : 1,
                background: 'transparent',
              }}
              onChange={(e) => update({ [key]: e.target.value })}
            />
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isAuto}
                onChange={(e) => update({ [key]: e.target.checked ? '' : (isDark ? '#c0c0c0' : '#000000') })}
                style={{ cursor: 'pointer' }}
              />
              Auto
            </label>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="homepage-image-preview" aria-label="Homepage image preview">
        <div><span>Top</span><div dangerouslySetInnerHTML={{ __html: preview.top }} /></div>
        <div><span>Bottom</span><div dangerouslySetInnerHTML={{ __html: preview.bottom }} /></div>
      </div>
      <fieldset disabled={saving} className="homepage-image-draft">
      <div className="stroke-width-label">
        <label>Stroke width</label>
        <InfoTip tipHtml="Upper handle: outer piece outlines. Middle handle: slice line. Lower handle: inner seams between pieces.<br><br>Outer and inner handles snap together and drag as a pair. Click a linked handle to select it, then drag to separate them. Hold Shift to move separated outer/inner handles together. Arrow keys adjust the focused handle." />
      </div>
      <LinkedStrokeWidthControl settings={settings} onChange={update} />
      {_row(
        'Tracing-start Highlight',
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Light
            <input
              type="color"
              aria-label="Light theme tracing-start highlight"
              value={settings.specialPieceColor}
              style={{ width: 38, height: 26, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
              onChange={(e) => update({ specialPieceColor: e.target.value })}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Dark
            <input
              type="color"
              aria-label="Dark theme tracing-start highlight"
              value={settings.specialPieceColorDark}
              style={{ width: 38, height: 26, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
              onChange={(e) => update({ specialPieceColorDark: e.target.value })}
            />
          </label>
        </div>,
        'Color of the piece where parity tracing starts on each homepage image. Set a separate color for light and dark themes.',
      )}
      {autoColorRow('borderColor', 'Outline Color', 'Color of the piece outlines. In "Auto" it follows the app theme (black in light mode, text color in dark mode).')}
      {autoColorRow('sliceColor', 'Slice Line Color', 'Color of the slice indicator line. In "Auto" it follows the app theme.')}
      <div style={{ marginTop: 6, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        Face Colors
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
        {FACE_COLOR_KEYS.map(({ key, label }) => {
          const enabled = settings[key] !== 'transparent';
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 8,
                background: 'var(--surface2)',
                border: '1px solid var(--border-color)',
              }}
            >
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => update({ [key]: e.target.checked ? '#AAAAAA' : 'transparent' })}
                  style={{ cursor: 'pointer' }}
                />
                {label}
              </label>
              <input
                type="color"
                value={enabled ? settings[key] : '#000000'}
                disabled={!enabled}
                style={{
                  width: 30,
                  height: 22,
                  padding: 0,
                  border: 'none',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.4,
                  background: 'transparent',
                }}
                onChange={(e) => update({ [key]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="settings-action-btn"
        onClick={() => setSettings({ ...DEFAULT_HOMEPAGE_IMAGE_SETTINGS })}
        style={{
          padding: '11px 16px',
          borderRadius: 10,
          cursor: 'pointer',
          width: '100%',
          fontWeight: 600,
          fontSize: '0.92rem',
          transition: '0.2s',
          textAlign: 'center',
          background: 'var(--surface2)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-ui)',
        }}
      >
        Reset to Defaults
      </button>
      </fieldset>
      <button
        type="button"
        className="homepage-images-save"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await saveHomepageImageSettingsForReload(settings);
            window.location.reload();
          } catch (error) {
            setSaving(false);
            showToast(error instanceof Error ? error.message : 'Could not save image settings. Please try again.', 5000, 'error');
          }
        }}
      >
        {saving ? 'Preparing images…' : 'Save and reload'}
      </button>
    </>
  );
}

export default function HomepageImagesModal(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    closeModalWithHistory(() => setOpen(false));
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('sqg:open-homepage-images', onOpen);
    return () => window.removeEventListener('sqg:open-homepage-images', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    pushModalState('homepageImagesModal', close);
    applyInstructionVisibility();
    return () => {
      removeCloseModalFromStack(close);
      if (!hasOpenModal()) unlockScroll();
    };
  }, [open, close]);

  if (!open) return null;
  return (
    <div id="homepageImagesModal" className="modal active" style={{ zIndex: 10015 }}>
      <div className="modal-content homepage-images-content" role="dialog" aria-modal="true" aria-labelledby="homepageImagesHeading">
        <div className="settings-header">
          <h2 id="homepageImagesHeading">Homepage Image Settings</h2>
          <button className="close-btn" aria-label="Close homepage image settings" onClick={close}>&times;</button>
        </div>
        <div className="homepage-images-body"><HomepageImagesSection /></div>
      </div>
    </div>
  );
}
