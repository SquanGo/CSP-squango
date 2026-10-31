/**
 * Toast notification system — ported 1:1 from legacy modals.js `showToast`.
 * Imperative: appends `.toast-notification` nodes to document.body.
 */
export function showToast(message: string, duration = 3000, type: 'info' | 'success' | 'error' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-notification--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-notification--visible'), 10);

  setTimeout(() => {
    toast.classList.remove('toast-notification--visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
