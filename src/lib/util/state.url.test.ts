import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initURLSubscription, updateCode, validatedState } from './state.svelte';

// Extremely large diagrams can exceed the browser's URL-length limit; the
// hash sync must swallow the replaceState failure instead of re-raising an
// uncaught error from the debounce timer on every keystroke.
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('./mermaid', () => ({ parse: parseMock }));

describe('URL hash sync failure containment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    parseMock.mockReset();
    parseMock.mockImplementation(() => Promise.resolve({ diagramType: 'flowchart-v2' }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the editor publishing when replaceState rejects a too-long hash', () => {
    const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {
      throw new DOMException('long URL', 'SecurityError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    initURLSubscription();

    updateCode('flowchart TD\n  A-->B');
    return vi
      .advanceTimersByTimeAsync(0) // flush the async publish chain
      .then(() => {
        expect(validatedState.current.code).toContain('A-->B');

        expect(() => vi.advanceTimersByTime(300)).not.toThrow(); // debounce fires
        expect(replaceState).toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();

        // The failure must not break later cycles: another edit syncs again.
        replaceState.mockClear();
        updateCode('flowchart TD\n  A-->C');
        return vi.advanceTimersByTimeAsync(0);
      })
      .then(() => {
        expect(validatedState.current.code).toContain('A-->C');
        expect(() => vi.advanceTimersByTime(300)).not.toThrow();
        expect(replaceState).toHaveBeenCalled();
      });
  });
});
