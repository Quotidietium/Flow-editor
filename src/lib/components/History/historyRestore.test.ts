import { describe, expect, it, vi } from 'vitest';
import { MAX_RESTORE_ENTRIES, restoreEntries } from './historyState.svelte';
import type { HistoryEntry } from '$lib/types';

const entry = (id: string, time: number, code = 'graph TD\n  A-->B'): HistoryEntry =>
  ({
    id,
    name: id,
    state: { code, mermaid: '{}', rough: false, updateDiagram: true },
    time,
    type: 'manual'
  }) as HistoryEntry;

// Uploaded history files are untrusted input: entries beyond the cap are
// rejected, and entries without a usable state payload count as invalid.
describe('restoreEntries hardening', () => {
  it('restores at most MAX_RESTORE_ENTRIES and reports the rest invalid', () => {
    const many = Array.from({ length: MAX_RESTORE_ENTRIES + 150 }, (_, i) => entry(`e${i}`, i + 1));
    const { restored, invalid } = restoreEntries(many);
    expect(restored).toBe(MAX_RESTORE_ENTRIES);
    expect(invalid).toBe(150);
  });

  it('rejects entries whose state has no string code', () => {
    const bad = [
      { id: 'b1', state: { code: 42 }, time: 1, type: 'manual' },
      { id: 'b2', state: 'not-an-object', time: 2, type: 'manual' },
      { id: 'b3', time: 3, type: 'manual' }
    ] as unknown as HistoryEntry[];
    const { invalid, restored } = restoreEntries([...bad, entry('ok', 4)]);
    expect(restored).toBe(1);
    expect(invalid).toBe(3);
  });
});

describe('manual history growth cap', () => {
  it('drops oldest manual entries beyond the cap instead of growing unbounded', async () => {
    const { addManualEntry, manualEntryCount, MAX_MANUAL_HISTORY } =
      await import('./historyState.svelte');
    for (let i = 0; i < MAX_MANUAL_HISTORY + 30; i++) {
      addManualEntry({
        code: `graph TD\n  N${i}-->B`,
        mermaid: '{}',
        rough: false,
        updateDiagram: true
      });
    }
    expect(manualEntryCount()).toBe(MAX_MANUAL_HISTORY);
  });
});

// Multi-tab lost-update guard: another tab may have written entries to the
// same store since this tab's in-memory copy was last refreshed; saves from
// this tab must merge with (not overwrite) those.
describe('cross-tab merge on write', () => {
  it('keeps entries written by another tab when saving and removing here', async () => {
    const otherTabsEntry = {
      id: 'other-tab-1',
      name: 'from-tab-b',
      state: { code: 'graph TD\n  Z-->Y', mermaid: '{}', rough: false, updateDiagram: true },
      time: 42,
      type: 'manual'
    };
    const store = new Map<string, string>([
      ['manualHistoryStore', JSON.stringify([otherTabsEntry])]
    ]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });
    try {
      vi.resetModules();
      const { addManualEntry, manualEntryCount } = await import('./historyState.svelte');

      // Save from this tab: the other tab's entry must survive the write.
      addManualEntry({
        code: 'graph TD\n  A-->B',
        mermaid: '{}',
        rough: false,
        updateDiagram: true
      });
      const persisted = JSON.parse(store.get('manualHistoryStore') ?? '[]') as {
        id: string;
      }[];
      expect(persisted.map((e) => e.id)).toContain('other-tab-1');
      expect(manualEntryCount()).toBe(2);

      // Remove only our own entry; the other tab's survives the deletion.
      const ours = persisted.find((e) => e.id !== 'other-tab-1');
      const { setMode, removeEntry } = await import('./historyState.svelte');
      setMode('manual');
      removeEntry(ours?.id ?? 'missing');
      const after = JSON.parse(store.get('manualHistoryStore') ?? '[]') as { id: string }[];
      expect(after.map((e) => e.id)).toEqual(['other-tab-1']);
    } finally {
      delete (window as { localStorage?: unknown }).localStorage;
      vi.resetModules();
    }
  });
});

describe('cross-tab merge on rename and restore', () => {
  const stubStorage = (initial: string): Map<string, string> => {
    const store = new Map<string, string>([['manualHistoryStore', initial]]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });
    return store;
  };
  const teardown = (): void => {
    delete (window as { localStorage?: unknown }).localStorage;
    vi.resetModules();
  };

  it('renames against the latest persisted value, keeping other tabs saves', async () => {
    const otherTabsEntry = {
      id: 'tab-b',
      name: 'from-b',
      state: { code: 'graph TD\n  Z-->Y', mermaid: '{}', rough: false, updateDiagram: true },
      time: 7,
      type: 'manual'
    };
    const store = stubStorage(JSON.stringify([otherTabsEntry]));
    try {
      vi.resetModules();
      const mod = await import('./historyState.svelte');
      mod.setMode('manual');
      mod.renameEntry('tab-b', 'renamed-here');
      const persisted = JSON.parse(store.get('manualHistoryStore') ?? '[]') as {
        id: string;
        name?: string;
      }[];
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.name).toBe('renamed-here');
    } finally {
      teardown();
    }
  });

  it('restores uploaded entries into the latest persisted value', async () => {
    const otherTabsEntry = {
      id: 'tab-b2',
      name: 'from-b',
      state: { code: 'graph TD\n  Z-->Y', mermaid: '{}', rough: false, updateDiagram: true },
      time: 7,
      type: 'manual'
    };
    const store = stubStorage(JSON.stringify([otherTabsEntry]));
    try {
      vi.resetModules();
      const mod = await import('./historyState.svelte');
      const { restored } = mod.restoreEntries([
        {
          id: 'upload-1',
          name: 'up',
          state: { code: 'graph TD\n  U-->V', mermaid: '{}', rough: false, updateDiagram: true },
          time: 9,
          type: 'manual'
        }
      ]);
      expect(restored).toBe(1);
      const persisted = JSON.parse(store.get('manualHistoryStore') ?? '[]') as { id: string }[];
      expect(persisted.map((e) => e.id).sort()).toEqual(['tab-b2', 'upload-1']);
    } finally {
      teardown();
    }
  });
});
