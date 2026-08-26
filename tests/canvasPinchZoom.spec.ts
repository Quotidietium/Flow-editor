import { expect, test } from './test';

// 触屏捏合缩放：移动端没有 ctrl+滚轮。双指距离比折算缩放因子，
// 锚点取双指中心（合成 TouchEvent 实证）。
test.describe('画布捏合缩放', () => {
  test('双指外扩放大画布（缩放读数上升），内收回落', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    const zoomLabel = page.locator('[data-testid="visual-toolbar"] span.ml-auto');
    await expect(zoomLabel).toContainText('· 100%');

    const svg = page.locator('[role="application"]');
    const pinch = (from: number, to: number) =>
      svg.evaluate(
        (el, { from: d0, to: d1 }) => {
          const box = el.getBoundingClientRect();
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const touch = (id: number, half: number) =>
            new Touch({ clientX: cx, clientY: cy + half, identifier: id, target: el });
          el.dispatchEvent(
            new TouchEvent('touchstart', {
              bubbles: true,
              cancelable: true,
              touches: [touch(1, -d0 / 2), touch(2, d0 / 2)]
            })
          );
          el.dispatchEvent(
            new TouchEvent('touchmove', {
              bubbles: true,
              cancelable: true,
              touches: [touch(1, -d1 / 2), touch(2, d1 / 2)]
            })
          );
          el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
        },
        { from, to }
      );

    // 外扩（40 → 120，3 倍距离）：放大，读数上升且受上限约束
    await pinch(40, 120);
    const zoomedText = await zoomLabel.textContent();
    const zoomed = Number.parseInt(/· (\d+)%/.exec(zoomedText ?? '')?.[1] ?? '0', 10);
    expect(zoomed).toBeGreaterThan(100);
    expect(zoomed).toBeLessThanOrEqual(250);

    // 内收（120 → 40）：回落
    await pinch(120, 40);
    const shrunkText = await zoomLabel.textContent();
    const shrunk = Number.parseInt(/· (\d+)%/.exec(shrunkText ?? '')?.[1] ?? '0', 10);
    expect(shrunk).toBeLessThan(zoomed);
  });
});
