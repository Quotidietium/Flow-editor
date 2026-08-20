import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJSON, writeJSON } from './persist.svelte';

// Quota-exceeded safety: writeJSON must never throw — it sits inside the
// state gateway's update() path, where an exception would drop the in-flight
// publish and break typing entirely once localStorage fills up.
describe('writeJSON failure containment', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });

  const installStorage = (setItem: () => void): void => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { setItem }
    });
  };

  it('swallows quota-exceeded errors from setItem', () => {
    const setItem = vi.fn(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    installStorage(setItem);
    expect(() => writeJSON('codeStore', { a: 1 })).not.toThrow();
    expect(setItem).toHaveBeenCalledOnce();
  });

  it('keeps reading when storage throws on write', () => {
    installStorage(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    // Reads go through getItem; with it absent here, the fallback applies.
    expect(readJSON('missing', 'fallback')).toBe('fallback');
  });
});
