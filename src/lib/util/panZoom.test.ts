import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanZoomState } from './panZoom';

// jsdom ships no ResizeObserver; stub it so the wrapper class can be
// constructed and its cleanup observed.
class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
  constructor(callback: () => void) {
    ResizeObserverStub.instances.push(this);
    void callback;
  }
}

describe('PanZoomState lifecycle', () => {
  afterEach(() => {
    ResizeObserverStub.instances = [];
    vi.unstubAllGlobals();
  });

  it('destroy releases the observer and the change callback, idempotently', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const state = new PanZoomState();
    const observer = ResizeObserverStub.instances[0];
    state.onPanZoomChange = vi.fn();

    state.destroy();

    expect(observer?.disconnect).toHaveBeenCalledOnce();
    expect(state.onPanZoomChange).toBeUndefined();
    // Destroying again must not throw.
    expect(() => state.destroy()).not.toThrow();
  });
});
