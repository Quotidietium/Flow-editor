import { afterEach, describe, expect, it, vi } from 'vitest';

// The persisted migration version is untrusted: corrupt/hand-edited values
// previously crashed startup (negative -> migrations[-4] iteration TypeError)
// or silently disabled all future migrations (beyond latest).
//
// Each scenario re-imports the module graph (persisted reads localStorage at
// module scope), which re-initializes mermaid's layout loaders — heavy, so
// the scenarios share one test with a generous timeout.
describe('applyMigrations version defense', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

  const loadWithStoredVersion = async (raw: string): Promise<void> => {
    const store = new Map<string, string>([['migrations', raw]]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });
    vi.resetModules();
    const { applyMigrations } = await import('./migrations.svelte');
    applyMigrations();
    expect(store.get('migrations')).toBe('{"version":0}');
  };

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
    vi.resetModules();
  });

  it(
    'recovers from negative, fractional, beyond-latest and non-numeric versions',
    { timeout: 60_000 },
    async () => {
      await loadWithStoredVersion('{"version":-5}');
      await loadWithStoredVersion('{"version":1.5}');
      await loadWithStoredVersion('{"version":99}');
      await loadWithStoredVersion('{"version":"0"}');
    }
  );

  it('leaves a valid current version untouched', { timeout: 60_000 }, async () => {
    const store = new Map<string, string>([['migrations', '{"version":0}']]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });
    vi.resetModules();
    const { applyMigrations } = await import('./migrations.svelte');
    expect(() => applyMigrations()).not.toThrow();
    expect(store.get('migrations')).toBe('{"version":0}');
  });
});
