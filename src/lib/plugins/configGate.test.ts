import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BRIDGE_TEXT_LENGTH, handleBridgeRequest } from './bridge';

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

// These tests import the real mermaid config (the sanitizer's diff-from-default
// depends on it) — a heavy module that runs ~6s, close to the default timeout
// under parallel load.
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
  }, 20_000);

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
  }, 20_000);

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
  }, 20_000);

  // postMessage is untrusted with no URL-length ceiling: an oversized code
  // must be rejected at the bridge instead of flowing into the gateway's
  // synchronous stringify + localStorage write.
  it('rejects oversized bridge payloads before any store write', async () => {
    const callsBefore = codeStoreMock.mock.calls.length;
    const oversized = 'x'.repeat(MAX_BRIDGE_TEXT_LENGTH + 1);
    for (const name of ['set_code', 'set_state']) {
      const res = (await handleBridgeRequest({
        id: 4,
        method: 'tools/call',
        params: { arguments: { code: oversized, mermaid: oversized }, name }
      })) as { error?: { code: number; message: string } };
      expect(res.error?.code).toBe(-32602);
      expect(res.error?.message).toMatch(/too large/);
    }
    expect(codeStoreMock.mock.calls.length).toBe(callsBefore);
  }, 20_000);

  it('rejects non-string mermaid instead of silently dropping it', async () => {
    const res = (await handleBridgeRequest({
      id: 5,
      method: 'tools/call',
      params: { arguments: { code: 'flowchart TD', mermaid: 42 }, name: 'set_state' }
    })) as { error?: { code: number } };
    expect(res.error?.code).toBe(-32602);
  }, 20_000);
});
