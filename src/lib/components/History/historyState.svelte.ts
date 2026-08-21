import type { HistoryEntry, HistoryType, Optional, State } from '$lib/types';
import { persisted, readJSON, type Persisted } from '$lib/util/persist.svelte';
import { inputState } from '$lib/util/state.svelte';
import { generateSlug } from 'random-word-slugs';
import { v4 as uuidV4 } from 'uuid';

const MAX_AUTO_HISTORY_LENGTH = 30;
// Manual saves are explicit but must not grow without bound either: each
// entry carries the full state, and an unbounded store eventually exhausts
// the localStorage quota (and with it silent persistence of the editor
// itself). Oldest entries are dropped first, same policy as the timeline.
const MAX_MANUAL_HISTORY_LENGTH = 200;
const AUTO_SAVE_INTERVAL = 60_000;

const AUTO_STORE_KEY = 'autoHistoryStore';
const MANUAL_STORE_KEY = 'manualHistoryStore';

const auto = persisted<HistoryEntry[]>(AUTO_STORE_KEY, []);
const manual = persisted<HistoryEntry[]>(MANUAL_STORE_KEY, []);
const mode = persisted<HistoryType>('autoHistoryMode', 'manual');
let loader = $state<HistoryEntry[]>([]);

// Loader entries are in-memory, so a persisted 'loader' mode is empty after reload.
if (mode.value === 'loader') {
  mode.value = 'manual';
}

// The persisted slot backing a mode; loader is in-memory and has no slot.
const slotFor = (m: HistoryType): Persisted<HistoryEntry[]> | null => {
  switch (m) {
    case 'auto': {
      return auto;
    }
    case 'manual': {
      return manual;
    }
    default: {
      return null;
    }
  }
};

export const historyState = {
  get entries(): HistoryEntry[] {
    return slotFor(mode.value)?.value ?? loader;
  },
  get loaderEntries(): HistoryEntry[] {
    return loader;
  },
  get mode(): HistoryType {
    return mode.value;
  }
};

export const setMode = (next: HistoryType): void => {
  mode.value = next;
};

// Dedup key: only the fields that define the diagram, so volatile/view-only
// fields (renderCount, pan/zoom, …) don't count as a change.
export const stateKey = (state: State): string =>
  JSON.stringify({ code: state.code, mermaid: state.mermaid });

const createEntry = (state: State, type: 'auto' | 'manual'): HistoryEntry => ({
  id: uuidV4(),
  name: generateSlug(2),
  state,
  time: Date.now(),
  type
});

// Returns true if added, false if it duplicated the most recent entry.
//
// Multi-tab lost-update guard: this tab's in-memory copy can be stale when
// another tab wrote to the same store since our last read, and a blind
// wholesale set would silently drop those saves. Writes therefore re-read
// the latest persisted value and merge (new entry prepended, then the cap).
// The window between re-read and write still exists, but it shrinks from
// "since page load" to milliseconds.
const addEntry = (
  slot: Persisted<HistoryEntry[]>,
  storeKey: string,
  state: State,
  type: 'auto' | 'manual',
  maxLength?: number
): boolean => {
  const latest = readJSON<HistoryEntry[]>(storeKey, slot.value);
  if (latest.length > 0 && stateKey(latest[0].state) === stateKey(state)) {
    slot.value = latest;
    return false;
  }
  const trimmed = maxLength && latest.length >= maxLength ? latest.slice(0, maxLength - 1) : latest;
  slot.value = [createEntry(state, type), ...trimmed];
  return true;
};

export const addManualEntry = (state: State): boolean =>
  addEntry(manual, MANUAL_STORE_KEY, state, 'manual', MAX_MANUAL_HISTORY_LENGTH);

export const addAutoEntry = (state: State): boolean =>
  addEntry(auto, AUTO_STORE_KEY, state, 'auto', MAX_AUTO_HISTORY_LENGTH);

// Read-only accessors for tests and future UI (e.g. quota-aware indicators).
export const manualEntryCount = (): number => manual.value.length;
export const MAX_MANUAL_HISTORY = MAX_MANUAL_HISTORY_LENGTH;

// Replaces the in-memory revisions (e.g. when a gist is loaded), assigning ids.
export const setLoaderEntries = (entries: Optional<HistoryEntry, 'id'>[]): void => {
  loader = entries.map((entry) =>
    entry.id ? (entry as HistoryEntry) : { ...entry, id: uuidV4() }
  );
};

export const removeEntry = (id: string): void => {
  const slot = slotFor(mode.value);
  if (!slot) {
    return;
  }
  // Same multi-tab guard as addEntry: drop the id from the latest persisted
  // value so concurrent saves from other tabs survive this deletion.
  const storeKey = mode.value === 'auto' ? AUTO_STORE_KEY : MANUAL_STORE_KEY;
  const latest = readJSON<HistoryEntry[]>(storeKey, slot.value);
  slot.value = latest.filter((entry) => entry.id !== id);
};

export const renameEntry = (id: string, name: string): void => {
  const trimmed = name.trim();
  const slot = slotFor(mode.value);
  if (!trimmed || !slot) {
    return;
  }
  // Same multi-tab guard as addEntry: rename against the latest persisted
  // value so concurrent saves from other tabs survive this write.
  const storeKey = mode.value === 'auto' ? AUTO_STORE_KEY : MANUAL_STORE_KEY;
  const latest = readJSON<HistoryEntry[]>(storeKey, slot.value);
  slot.value = latest.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry));
};

export const clearActive = (): void => {
  const slot = slotFor(mode.value);
  if (!slot) {
    return;
  }
  slot.value = [];
};

const validateEntry = (entry: HistoryEntry): boolean =>
  Boolean(entry && entry.type && entry.state) &&
  typeof entry.time === 'number' &&
  typeof entry.state === 'object' &&
  typeof entry.state.code === 'string';

// Restore cap: an uploaded file is untrusted input. Without a limit a
// hand-crafted array could stuff the unbounded manual store until the
// localStorage quota is exhausted (breaking codeStore persistence) and
// freeze the tab sorting/serializing it.
export const MAX_RESTORE_ENTRIES = 200;

export interface RestoreResult {
  restored: number;
  invalid: number;
  duplicates: number;
}

// Routes each uploaded entry to the store matching its own type, skipping ids
// that already exist. Entries beyond MAX_RESTORE_ENTRIES count as invalid.
// Like every history write this merges into the latest persisted value so
// concurrent saves from other tabs are not dropped. The merged result is
// capped at the slot's own maximum: repeated uploads must not grow the
// store past the bounds addEntry enforces (quota exhaustion is exactly the
// failure the input cap guards against).
export const restoreEntries = (data: HistoryEntry[]): RestoreResult => {
  const capped = data.slice(0, MAX_RESTORE_ENTRIES);
  const valid = capped.filter((entry) => validateEntry(entry));
  const invalid = data.length - valid.length;
  let restored = 0;

  const slots: [HistoryType, Persisted<HistoryEntry[]>, string, number][] = [
    ['auto', auto, AUTO_STORE_KEY, MAX_AUTO_HISTORY_LENGTH],
    ['manual', manual, MANUAL_STORE_KEY, MAX_MANUAL_HISTORY_LENGTH]
  ];
  for (const [type, slot, storeKey, maxLength] of slots) {
    const incoming = valid.filter((entry) => entry.type === type);
    if (incoming.length === 0) {
      continue;
    }
    const latest = readJSON<HistoryEntry[]>(storeKey, slot.value);
    const existingIDs = latest.map(({ id }) => id);
    const fresh = incoming.filter(({ id }) => !existingIDs.includes(id));
    const kept = [...latest, ...fresh].sort((a, b) => b.time - a.time).slice(0, maxLength);
    const keptIDs = kept.map(({ id }) => id);
    restored += fresh.filter(({ id }) => keptIDs.includes(id)).length;
    slot.value = kept;
  }

  const duplicates = valid.length - restored;
  return { restored, invalid, duplicates };
};

const setIDs = (entries: HistoryEntry[]): HistoryEntry[] =>
  entries.map((entry) => (entry.id ? entry : { ...entry, id: uuidV4() }));

// One-time migration: re-reads localStorage so entries written by an older
// version get ids, then persists and updates the reactive state.
export const injectHistoryIDs = (): void => {
  auto.value = setIDs(readJSON<HistoryEntry[]>('autoHistoryStore', []));
  manual.value = setIDs(readJSON<HistoryEntry[]>('manualHistoryStore', []));
};

let autoSaveTimer: ReturnType<typeof setInterval> | undefined;

// Idempotent; returns the stop function for use as a lifecycle cleanup.
export const startAutoSave = (): (() => void) => {
  if (autoSaveTimer === undefined) {
    autoSaveTimer = setInterval(
      () => addAutoEntry($state.snapshot(inputState)),
      AUTO_SAVE_INTERVAL
    );
  }
  return stopAutoSave;
};

export const stopAutoSave = (): void => {
  if (autoSaveTimer !== undefined) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = undefined;
  }
};
