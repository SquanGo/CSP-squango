import { useSyncExternalStore } from 'react';

/**
 * Tiny external-store bridge so the imperative ported state layer can drive
 * React re-renders. Any mutation in `state.ts` calls `notify()`, and React
 * components subscribe via `useAppStore()`.
 */

const listeners = new Set<() => void>();
let version = 0;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVersion(): number {
  return version;
}

export function notify(): void {
  version += 1;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

export function useAppStore(): number {
  return useSyncExternalStore(subscribe, getVersion);
}
