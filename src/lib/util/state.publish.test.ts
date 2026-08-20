import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCode, validatedState } from './state.svelte';

// Publish-ordering guard: mermaid.parse latency varies with diagram size.
// If an older snapshot's parse resolves after a newer one's, the stale
// result must NOT be the last write to validatedState — otherwise fast
// typing on large diagrams would leave the editor (and the URL hash)
// showing an outdated diagram.
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('./mermaid', () => ({ parse: parseMock }));

const resolveParse = (): Promise<{ diagramType: string }> =>
  Promise.resolve({ diagramType: 'flowchart-v2' });

describe('validatedState publish ordering', () => {
  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockImplementation(resolveParse);
  });

  it('drops a slower superseded parse instead of publishing it last', async () => {
    let releaseSlow: (() => void) | undefined;
    parseMock.mockImplementation((code: string) => {
      if (code.includes('SLOWDIAGRAM')) {
        return new Promise<{ diagramType: string }>((resolve) => {
          releaseSlow = () => resolve({ diagramType: 'flowchart-v2' });
        });
      }
      return resolveParse();
    });

    // Slow request first, fast request second.
    updateCode('flowchart TD\n  SLOWDIAGRAM');
    updateCode('flowchart TD\n  FASTDIAGRAM');

    // The fast publish lands; the slow one is still pending.
    await vi.waitFor(() => {
      expect(validatedState.current.code).toContain('FASTDIAGRAM');
    });

    // The slow parse resolves last; it must not overwrite the newer state.
    releaseSlow?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(validatedState.current.code).toContain('FASTDIAGRAM');
    expect(validatedState.current.code).not.toContain('SLOWDIAGRAM');
  });

  it('still publishes the latest state when parses resolve in order', async () => {
    updateCode('flowchart TD\n  A');
    updateCode('flowchart TD\n  B');
    await vi.waitFor(() => {
      expect(validatedState.current.code).toContain('B');
    });
  });
});
