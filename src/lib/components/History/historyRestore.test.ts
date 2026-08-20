import { describe, expect, it } from 'vitest';
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
