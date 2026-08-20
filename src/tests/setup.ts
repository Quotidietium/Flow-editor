import { beforeAll, vi } from 'vitest';

// Node >=25 ships an experimental global localStorage that reports itself
// unavailable without --localstorage-file; on those hosts vitest's jsdom
// window ends up without a working storage and the persistence suites fail
// locally (CI nodes are older and unaffected). Provide an in-memory
// Storage whenever the environment lacks a functional one.
const ensureStorage = (): void => {
  try {
    const probe = '__flow_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return;
  } catch {
    /* fall through and install the shim */
  }
  const shim = (() => {
    const map = new Map<string, string>();
    return {
      clear: () => map.clear(),
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      key: (index: number) => [...map.keys()][index] ?? null,
      get length() {
        return map.size;
      },
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, String(value))
    };
  })();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: shim
  });
};
ensureStorage();

// TODO: Remove once https://github.com/sveltejs/kit/issues/6259 is closed.
beforeAll(() => {
  vi.mock('$app/environment', () => ({
    browser: 'window' in globalThis,
    dev: true
  }));
});
