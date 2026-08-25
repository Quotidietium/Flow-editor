import { expect, test } from './test';

// 移动端可视化工具栏：13 个按钮换行平铺要吃 ~159px 画布高度（390px 实测），
// 改为单行横滑；桌面端保持换行平铺不变。
test.describe('移动端可视化工具栏', () => {
  test('390px 单行横滑：高度受限、全钮可滑达可点', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/edit');
    await page.getByRole('button', { name: '可视化编辑' }).click();

    const toolbar = page.getByTestId('visual-toolbar');
    await expect(toolbar).toBeVisible();
    const box = await toolbar.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    // 单行：含内边距不超过 64px（换行平铺时约 159px）
    expect(box.height).toBeLessThanOrEqual(64);

    // 内容超出可视宽 → 可横滑（13 钮远超 390px）
    const metrics = await toolbar.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

    // 最左侧主操作直接可点：添加节点使计数 +1
    const countBefore = await toolbar.locator('span.ml-auto').textContent();
    await page.getByTestId('visual-add-node').click();
    await expect(toolbar.locator('span.ml-auto')).not.toHaveText(countBefore ?? '');

    // 最右侧按钮横滑后同样可点：帮助 → 对话框打开
    await page.getByTestId('visual-help').click();
    await expect(page.getByTestId('visual-help-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('1280px 桌面端保持平铺不横滑', async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await page.goto('/edit');
    await page.getByRole('button', { name: '可视化编辑' }).click();

    const toolbar = page.getByTestId('visual-toolbar');
    await expect(toolbar).toBeVisible();
    const metrics = await toolbar.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth
    }));
    // 换行平铺：无横向滚动（允许 1px 取整误差）
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  });
});
