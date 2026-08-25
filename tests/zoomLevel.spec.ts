import { expect, test } from './test';

test.describe('缩放百分比读数', () => {
  test('随缩放交互更新，重置回归 88%', async ({ page }) => {
    await page.goto('/edit');
    const readout = page.getByTestId('zoom-level');
    await expect(readout).toBeVisible();
    // 视图初始化后 reset 到 0.875
    await expect(readout).toHaveText('88%');

    // 放大：百分比上升
    await page.getByRole('button', { name: '放大' }).click();
    await expect(readout).not.toHaveText('88%');
    const zoomedText = await readout.textContent();
    const zoomed = Number.parseInt(zoomedText ?? '0', 10);
    expect(zoomed).toBeGreaterThan(88);

    // 缩小两次回到 88 以下
    await page.getByRole('button', { name: '缩小' }).click();
    await page.getByRole('button', { name: '缩小' }).click();
    const shrunk = Number.parseInt((await readout.textContent()) ?? '0', 10);
    expect(shrunk).toBeLessThan(zoomed);

    // 重置视图回归基准
    await page.getByRole('button', { name: '重置视图' }).click();
    await expect(readout).toHaveText('88%');
  });
});
