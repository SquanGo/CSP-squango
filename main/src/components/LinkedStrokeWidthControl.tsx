import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { HomepageImageSettings } from '../lib/homepageShapes';

const PARTS = {
  top: { key: 'strokeWidthOuter', label: 'Outer stroke width', max: 0.02 },
  middle: { key: 'sliceStrokeWidth', label: 'Slice line width', max: 0.03 },
  bottom: { key: 'strokeWidthInner', label: 'Inner seam width', max: 0.02 },
} as const;
type Part = keyof typeof PARTS;
type Positions = Record<Part, number>;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** draw-a-squan's three handles, snapping and linked/Shift dragging on one track. */
export default function LinkedStrokeWidthControl({ settings, onChange }: {
  settings: HomepageImageSettings;
  onChange: (patch: Partial<HomepageImageSettings>) => void;
}): React.ReactNode {
  const track = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Part | null>(null);
  const positions: Positions = {
    top: settings.strokeWidthOuter / PARTS.top.max * 100,
    middle: settings.sliceStrokeWidth / PARTS.middle.max * 100,
    bottom: settings.strokeWidthInner / PARTS.bottom.max * 100,
  };
  const linked = positions.top === positions.bottom;
  useEffect(() => {
    const onOutsidePointer = (event: globalThis.PointerEvent) => {
      if (!track.current?.contains(event.target as Node)) setSelected(null);
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    return () => document.removeEventListener('pointerdown', onOutsidePointer);
  }, []);
  const drag = useRef<{
    part: Part; mode: 'single' | 'linked' | 'group'; x: number;
    start: Positions; width: number; time: number; moved: boolean;
  } | null>(null);

  const update = (next: Positions) => {
    const patch: Partial<HomepageImageSettings> = {};
    for (const part of Object.keys(PARTS) as Part[]) {
      const config = PARTS[part];
      patch[config.key] = Math.round(clamp(next[part]) / 100 * config.max / 0.0005) * 0.0005;
    }
    onChange(patch);
  };
  const start = (event: PointerEvent<HTMLButtonElement>, part: Part) => {
    event.preventDefault();
    event.stopPropagation();
    drag.current = {
      part, mode: part === 'middle' ? 'single' : linked ? selected ? 'single' : 'linked' : event.shiftKey ? 'group' : 'single',
      x: event.clientX, start: positions, width: track.current?.clientWidth || 1,
      time: performance.now(), moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    const delta = (event.clientX - current.x) / current.width * 100;
    if (Math.abs(delta) > 0.7) current.moved = true;
    const next = { ...current.start };
    if (current.mode === 'linked' || current.mode === 'group') {
      next.top = clamp(current.start.top + delta);
      next.bottom = clamp(current.start.bottom + delta);
    } else {
      next[current.part] = clamp(current.start[current.part] + delta);
      if (current.part !== 'middle') {
        const other = current.part === 'top' ? 'bottom' : 'top';
        if (Math.abs(next[current.part] - next[other]) <= 3.5) {
          next[current.part] = next[other];
          setSelected(null);
        }
      }
    }
    update(next);
  };
  const end = () => {
    const current = drag.current;
    if (current && !current.moved && performance.now() - current.time < 250 && linked && current.part !== 'middle') {
      setSelected(selected === current.part ? null : current.part);
    }
    drag.current = null;
  };

  return (
    <div className="homepage-stroke-control">
      <div className="linked-width-slider" ref={track}>
        <div className="linked-width-track" />
        {(Object.keys(PARTS) as Part[]).map((part) => (
          <button
            key={part}
            type="button"
            role="slider"
            aria-label={PARTS[part].label}
            aria-valuemin={0}
            aria-valuemax={PARTS[part].max}
            aria-valuenow={settings[PARTS[part].key]}
            className={`linked-width-handle linked-width-handle-${part}${linked && !selected ? ' linked' : ''}${selected === part ? ' selected' : ''}`}
            style={{ left: `${positions[part]}%` }}
            onPointerDown={(event) => start(event, part)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => { drag.current = null; }}
            onBlur={() => setSelected(null)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = { ...positions };
              const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 0.0005 : -0.0005;
              const value = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : clamp(next[part] + delta / PARTS[part].max * 100);
              next[part] = value;
              if (linked && !selected && part !== 'middle') next[part === 'top' ? 'bottom' : 'top'] = value;
              update(next);
            }}
          >
            <span className={part === 'middle' ? 'linked-width-middle-shape' : 'linked-width-shape'} />
          </button>
        ))}
      </div>
      <div className="stroke-width-values">
        <span>Outer: {settings.strokeWidthOuter.toFixed(4)}</span>
        <span>Slice: {settings.sliceStrokeWidth.toFixed(4)}</span>
        <span>Inner: {settings.strokeWidthInner.toFixed(4)}</span>
      </div>
    </div>
  );
}
