import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initURLSubscription, loadState, validatedState } from './state.svelte';
import { deserializeState, serializeState } from './serde';
import { defaultState } from '../constants';

// loadState is async (plugin input pipeline via dynamic import). Regression:
// callers used to treat it as fire-and-forget, letting initURLSubscription's
// immediate flush overwrite an incoming share-link hash with the default
// state during the import window.
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('./mermaid', () => ({ defaultMermaidConfig: {}, parse: parseMock }));

describe('loadState promise contract', () => {
  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockImplementation(() => Promise.resolve({ diagramType: 'flowchart-v2' }));
    window.location.hash = '';
  });

  it('resolves only after the loaded state is published', async () => {
    const shared = serializeState({ ...defaultState, code: 'flowchart TD\n  Z --> LoadProbe' });
    window.location.hash = `#${shared}`;
    const pending = loadState(shared);
    // Not yet applied synchronously (dynamic import in flight)…
    expect(validatedState.current.code).not.toContain('LoadProbe');
    await pending;
    // The gateway applies synchronously; the validated snapshot publishes one
    // microtask later (async parse).
    await vi.waitFor(() => expect(validatedState.current.code).toContain('LoadProbe'));
  });

  it('url subscription after await keeps the shared hash (no default overwrite)', async () => {
    const shared = serializeState({ ...defaultState, code: 'flowchart TD\n  Y --> HashProbe' });
    window.location.hash = `#${shared}`;
    await loadState(shared);
    await vi.waitFor(() => expect(validatedState.current.code).toContain('HashProbe'));
    initURLSubscription();
    // The immediate flush must carry the shared state — the regression wrote
    // the default state here instead. (Compare decoded content rather than
    // raw serialized strings: the lazy serialized getter may recompute.)
    const flushed = deserializeState(window.location.hash.slice(1));
    expect(flushed.code).toContain('HashProbe');
    expect(flushed.code).not.toContain('圣诞节');
  });
});
