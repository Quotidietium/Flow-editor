import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The render throttle state machine: fast renders stream synchronously, a
// render slower than 150ms degrades the view into 1s debounced batches until
// a fast render recovers it. Module state is per-import, so each test gets a
// fresh module registry.
const load = async () => {
  vi.resetModules();
  return import('./autoSync');
};

describe('autoSync render throttle state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays synchronous while renders are fast', async () => {
    const { recordRenderTime, shouldRefreshView } = await load();
    const updater = vi.fn();
    recordRenderTime(10, updater);
    expect(shouldRefreshView()).toBe(true);
    recordRenderTime(150, updater); // threshold itself is still fast
    expect(shouldRefreshView()).toBe(true);
    expect(updater).not.toHaveBeenCalled();
  });

  it('degrades after a slow render and batches through one debounced update', async () => {
    const { recordRenderTime, shouldRefreshView } = await load();
    const updater = vi.fn();
    recordRenderTime(151, updater);
    expect(shouldRefreshView()).toBe(false);
    // A burst of state changes while degraded: each asks again, the debounce
    // coalesces them into a single updater call after the delay.
    shouldRefreshView();
    shouldRefreshView();
    expect(updater).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(updater).toHaveBeenCalledTimes(1);
  });

  it('recovers synchronous mode after a fast batched render', async () => {
    const { recordRenderTime, shouldRefreshView: ask } = await load();
    const updater = vi.fn();
    recordRenderTime(500, updater);
    expect(ask()).toBe(false);
    vi.advanceTimersByTime(1000);
    // The batched render (triggered by the updater above) is fast:
    recordRenderTime(20, updater);
    expect(ask()).toBe(true);
  });

  it('resolves waitForRender when the next render completes', async () => {
    const { recordRenderTime, waitForRender } = await load();
    const updater = vi.fn();
    recordRenderTime(300, updater);
    const pending = waitForRender();
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    recordRenderTime(10, updater); // next render lands
    await vi.waitFor(() => {
      expect(resolved).toBe(true);
    });
    // waitForRender with nothing pending resolves immediately.
    await expect(waitForRender()).resolves.toBeUndefined();
  });
});
