import { describe, expect, it, vi } from 'vitest';

// The Preset card loads the examples catalogue as a lazy chunk; a failed
// import must surface as a handled rejection (the card keeps its built-in
// extras), never as an unhandled one that would trip the stress gate's
// no-uncaught-page-errors check on flaky networks.
vi.mock('@mermaid-js/examples', () => Promise.reject(new Error('chunk unavailable')));

describe('sample catalogue chunk failure path', () => {
  it('getSampleDiagrams rejects; the Preset rejection handler contains it', async () => {
    vi.resetModules();
    const { getSampleDiagrams } = (await import('./mermaid')) as unknown as {
      getSampleDiagrams: () => Promise<Record<string, unknown>>;
    };
    await expect(getSampleDiagrams()).rejects.toBeTruthy();

    // The exact caller pattern Preset uses: a two-argument .then — the
    // rejection is consumed (warn path), so nothing escapes to the window.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let escaped = false;
    await getSampleDiagrams().then(
      () => {
        escaped = true; // unreachable by construction
      },
      (error) => {
        console.warn('示例目录加载失败，仅显示内置示例', error);
      }
    );
    expect(escaped).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
