let unlockTimer: ReturnType<typeof setTimeout> | null = null;
let previousPointerEvents: string | null = null;

export function temporarilyDisablePointerEvents(duration = 1000): void {
  if (typeof document === 'undefined') return;

  const body = document.body;
  if (!body) return;

  if (unlockTimer === null) {
    previousPointerEvents = body.style.pointerEvents;
  } else {
    clearTimeout(unlockTimer);
  }

  body.style.pointerEvents = 'none';
  unlockTimer = setTimeout(() => {
    body.style.pointerEvents = previousPointerEvents || '';
    previousPointerEvents = null;
    unlockTimer = null;
  }, duration);
}
