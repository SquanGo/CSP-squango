import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type DropdownOption<T extends string = string> = {
  value: T;
  label: string;
  shortLabel?: string;
  compactLabel?: string;
  disabled?: boolean;
};

type DropdownProps<T extends string> = {
  id: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  style?: CSSProperties;
};

export default function Dropdown<T extends string>({ id, value, options, onChange, className, style }: DropdownProps<T>): ReactNode {
  const [open, setOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedOption = options.find((option) => option.value === value);
  const label = selectedOption?.label ?? '';
  const displayedLabel =
    viewportWidth <= 400
      ? selectedOption?.compactLabel || selectedOption?.shortLabel || label
      : viewportWidth <= 570
        ? selectedOption?.shortLabel || label
        : label;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onLayout = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(menu.scrollHeight, 260);
      menu.classList.toggle('custom-dropdown-menu--above', window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onLayout);
    onLayout();
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onLayout);
    };
  }, [open]);

  const moveFocus = (current: HTMLButtonElement, offset: number) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];
    const currentIndex = items.indexOf(current);
    const next = items[Math.min(items.length - 1, Math.max(0, currentIndex + offset))];
    next?.focus();
  };

  return (
    <div className={`custom-dropdown${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        style={style}
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="custom-dropdown-label">{displayedLabel}</span>
        {className?.includes('custom-dropdown--fit-options') ? (
          <span className="custom-dropdown-measure" aria-hidden="true">
            {options.reduce((longest, option) => option.label.length > longest.length ? option.label : longest, '')}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={listId} ref={menuRef} className="custom-dropdown-menu" role="listbox" aria-labelledby={id}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="custom-dropdown-option"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)');
                  (event.key === 'Home' ? items?.[0] : items?.[items.length - 1])?.focus();
                }
              }}
            >
              <span>{option.label}</span>
              <span className="custom-dropdown-check" aria-hidden="true">
                {option.value === value ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
