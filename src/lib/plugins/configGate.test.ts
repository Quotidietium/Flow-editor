import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBridgeRequest } from './bridge';

// All config entry points (URL hash, bridge setState, opened state files,
// plugin imports) must go through the same confirm-and-strip gate — the
// bridge and file/plugin paths were added later and initially bypassed it.
const parseMock = vi.hoisted(() => vi.fn());
vi.mock('../util/mermaid', async (importOriginal) => {
  // Keep the real defaultMermaidConfig — sanitize's diff-from-default rule
  // depends on it (an empty mock silently detects nothing).
  const actual = (await importOriginal()) as { defaultMermaidConfig: unknown };
  return { defaultMermaidConfig: actual.defaultMermaidConfig, parse: parseMock };
});
const stateMock = vi.hoisted(() => vi.fn());
const codeStoreMock = vi.hoisted(() => vi.fn());
vi.mock('../util/state.svelte', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    updateCode: (code: string) => codeStoreMock({ code }),
    updateCodeStore: (state: Record<string, unknown>) => codeStoreMock(state),
    validatedState: {
      get current() {
        return stateMock();
      }
    }
  };
});

describe('config security gate on all input paths', () => {
  beforeEach(async () => {
    parseMock.mockReset();
    parseMock.mockImplementation(() => Promise.resolve({ diagramType: 'flowchart-v2' }));
    stateMock.mockImplementation(() => ({
      code: 'flowchart TD\n  A --> B',
      mermaid: '{}',
      rough: false
    }));
    window.confirm = vi.fn(() => true); // user accepts the strip
    const { installEditorApi } = await import('./editorApi');
    installEditorApi();
  });

  it('bridge set_state routes dangerous configs through the sanitizer', async () => {
    const res = (await handleBridgeRequest({
      id: 1,
      method: 'tools/call',
      params: {
        arguments: {
          code: 'flowchart TD\n  X --> Y',
          mermaid: '{"securityLevel":"loose","theme":"default"}'
        },
        name: 'set_state'
      }
    })) as { result?: { content?: { text: string }[] } };
    expect(res.result?.content?.[0]?.text).toBe('ok');
    const written = codeStoreMock.mock.calls.at(-1)?.[0] as { mermaid?: string };
    // confirm()=true → stripped, not passed through verbatim.
    expect(written.mermaid).not.toContain('loose');
    expect(window.confirm).toHaveBeenCalled();
  });

  it('bridge set_state keeps configs the user declines to strip', async () => {
    window.confirm = vi.fn(() => false); // user trusts the source
    await handleBridgeRequest({
      id: 2,
      method: 'tools/call',
      params: {
        arguments: { code: 'flowchart TD', mermaid: '{"securityLevel":"loose"}' },
        name: 'set_state'
      }
    });
    const written = codeStoreMock.mock.calls.at(-1)?.[0] as { mermaid?: string };
    expect(written.mermaid).toContain('loose');
  });

  it('clean configs pass without any confirmation prompt', async () => {
    await handleBridgeRequest({
      id: 3,
      method: 'tools/call',
      params: {
        arguments: { code: 'flowchart TD', mermaid: '{"theme":"forest"}' },
        name: 'set_state'
      }
    });
    expect(window.confirm).not.toHaveBeenCalled();
    const written = codeStoreMock.mock.calls.at(-1)?.[0] as { mermaid?: string };
    expect(written.mermaid).toContain('forest');
  });
});
