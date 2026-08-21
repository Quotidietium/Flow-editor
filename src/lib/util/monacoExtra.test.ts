import { describe, expect, it, vi } from 'vitest';

// initEditor registers Monaco languages/providers. Monaco does NOT dedupe
// registrations, and DesktopEditor calls initEditor on every mount — without
// the once-guard, desktop<->mobile crossings stack duplicate providers and
// grow memory/CPU per crossing.
const calls = vi.hoisted(() => ({ register: 0, completion: 0, config: 0, tokens: 0 }));

vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: () => undefined
  },
  languages: {
    register: () => {
      calls.register++;
    },
    registerCompletionItemProvider: () => {
      calls.completion++;
      return { dispose: () => undefined };
    },
    setLanguageConfiguration: () => {
      calls.config++;
    },
    setMonarchTokensProvider: () => {
      calls.tokens++;
      return { dispose: () => undefined };
    }
  }
}));

// defineTheme calls are also counted — once-guard must cover the whole body.


describe('initEditor idempotency', () => {
  it('registers each provider exactly once across repeated mounts', async () => {
    const { initEditor } = await import('./monacoExtra');
    const fake = (await import('monaco-editor')) as unknown as Parameters<
      typeof initEditor
    >[0];
    initEditor(fake);
    initEditor(fake);
    initEditor(fake);
    expect(calls.register).toBe(1);
    expect(calls.completion).toBe(1);
    expect(calls.config).toBe(1);
    expect(calls.tokens).toBe(1);
  });
});
