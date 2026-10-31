import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test.each(['#474747', '#000000', '#123456'])(
  'saved color %s survives legacy migration, hydration, and reload unchanged',
  async (topColor) => {
    vi.resetModules();
    const colorScheme = { topColor, bottomColor: '#FFFFFF', frontColor: '#123456' };
    const store = new Map<string, string>([
      ['cspBoot', JSON.stringify({ colorScheme })],
      ['cspProgress', JSON.stringify({ colorScheme })],
      ['sq1-parity-progress', JSON.stringify({ colorScheme: { topColor: '#000' }, generalNotes: 'legacy note' })],
      ['sq1-parity-boot-progress-v1', JSON.stringify({ colorScheme: { topColor: '#000' } })],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    });

    const state = await import('../state');
    expect(state.colorScheme).toMatchObject(colorScheme);
    state.hydrateSavedStateDetails();
    expect(state.colorScheme).toMatchObject(colorScheme);
    expect(state.generalNotes).toBe('legacy note');
    for (const key of ['cspBoot', 'cspProgress']) {
      expect(JSON.parse(store.get(key)!).colorScheme).toMatchObject(colorScheme);
    }
    expect(store.has('sq1-parity-progress')).toBe(false);

    vi.resetModules();
    const reloaded = await import('../state');
    expect(reloaded.colorScheme).toMatchObject(colorScheme);
    reloaded.hydrateSavedStateDetails();
    expect(reloaded.colorScheme).toMatchObject(colorScheme);
  },
);
