import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type InfoTipProps = {
  tipHtml: string;
  label?: string;
};

/** Legacy info buttons toggle on click, with only one popup open at a time. */
export default function InfoTip({ tipHtml, label = 'More info' }: InfoTipProps): ReactNode {
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const tipId = useId();

  const position = useCallback(() => {
    const btn = btnRef.current;
    const box = boxRef.current;
    if (!btn || !box) return;
    const rect = btn.getBoundingClientRect();
    const bounds = box.getBoundingClientRect();
    let top = rect.top - bounds.height - 5;
    if (top < 10) top = rect.bottom + 5;
    box.style.top = `${Math.max(10, Math.min(top, window.innerHeight - bounds.height - 10))}px`;
    box.style.left = `${Math.max(10, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 10))}px`;
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position]);

  useEffect(() => {
    const onOtherTip = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== tipId) setOpen(false);
    };
    const onModalClosing = () => setOpen(false);
    window.addEventListener('sqg:info-open', onOtherTip);
    window.addEventListener('sqg:modal-closing', onModalClosing);
    return () => {
      window.removeEventListener('sqg:info-open', onOtherTip);
      window.removeEventListener('sqg:modal-closing', onModalClosing);
    };
  }, [tipId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || boxRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onEscape, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('resize', position);
    };
  }, [open, position]);

  return (
    <span className="info-wrapper">
      <button
        ref={btnRef}
        type="button"
        className="settings-info-btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) window.dispatchEvent(new CustomEvent('sqg:info-open', { detail: tipId }));
          setOpen(!open);
        }}
      >
        <span className="themed-icon themed-icon--info" aria-hidden="true" />
      </button>
      {open ? createPortal(
        <span
          ref={boxRef}
          id={tipId}
          role="tooltip"
          className="info-box show"
          style={{ pointerEvents: 'auto' }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          dangerouslySetInnerHTML={{ __html: tipHtml }}
        />,
        document.body,
      ) : null}
    </span>
  );
}
