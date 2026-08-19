import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ./mermaid so these tests observe (and count) parse calls without the
// real mermaid engine. The mock mimics mermaid's contract closely enough for
// the state pipeline: flowchart code parses, anything else throws an error
// carrying the `hash.loc` marker structure.
const { parseMock } = vi.hoisted(() => {
  const parseMock = vi.fn(async (code: string) => {
    if (!code.startsWith('flowchart')) {
      const error = new Error(
        `Error: Parse error on line 2:\n>> ${code.slice(0, 20)} broken\n\nExpecting 'NEWDLINE', 'EOF'`
      );
      (error as Error & { hash?: unknown }).hash = {
        loc: { first_column: 5, first_line: 2, last_column: 5, last_line: 2 }
      };
      throw error;
    }
    return { diagramType: 'flowchart-v2' };
  });
  return { parseMock };
});

vi.mock('./mermaid', () => ({ parse: parseMock }));

import { updateCode, updateCodeStore, validatedState } from './state.svelte';

const until = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 5000 && !condition(); i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  parseMock.mockClear();
});

describe('parse cache in processState', () => {
  it('skips mermaid.parse when the code has not changed', async () => {
    updateCode('flowchart TD\n    A --> B');
    await until(() => validatedState.current.diagramType === 'flowchart-v2');
    expect(parseMock).toHaveBeenCalledTimes(1);

    // View-option-only publishes (tab switches, pan/zoom) must not re-parse.
    updateCodeStore({ editorMode: 'config' });
    await until(() => validatedState.current.editorMode === 'config');
    updateCodeStore({ pan: { x: 10, y: 20 }, zoom: 2 });
    await until(() => validatedState.current.zoom === 2);
    expect(parseMock).toHaveBeenCalledTimes(1);

    // A code change re-parses.
    updateCode('flowchart TD\n    A --> C');
    await until(() => validatedState.current.code.endsWith('C'));
    expect(parseMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the processed error and markers for unchanged code', async () => {
    updateCode('sequenceDiagram broken');
    await until(() => validatedState.current.error !== undefined);
    const first = validatedState.current;
    expect(first.errorMarkers).toHaveLength(1);

    updateCodeStore({ grid: false });
    await until(() => validatedState.current.grid === false);
    const cached = validatedState.current;
    expect(cached.error?.message).toBe(first.error?.message);
    expect(cached.errorMarkers).toEqual(first.errorMarkers);
  });

  it('still surfaces config JSON errors on cache-hit publishes', async () => {
    updateCode('flowchart TD\n    A --> B');
    await until(() => validatedState.current.diagramType === 'flowchart-v2');

    updateCodeStore({ mermaid: '{invalid' });
    await until(() => validatedState.current.error !== undefined);
    expect(validatedState.current.error).toBeInstanceOf(Error);
    expect(validatedState.current.errorMarkers).toEqual([]);
    // The diagram type from the cached parse is retained, like before.
    expect(validatedState.current.diagramType).toBe('flowchart-v2');

    // Recovering the config clears the error without a re-parse.
    updateCodeStore({ mermaid: '{"theme":"default"}' });
    await until(() => validatedState.current.error === undefined);
    expect(parseMock).toHaveBeenCalledTimes(1);
  });
});
