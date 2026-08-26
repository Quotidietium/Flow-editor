import { expect, test } from './test';

// 插入图元面板的视口夹取：面板按按钮 rect 绝对定位，移动端横滑工具栏
// 下按钮可在任意 x——夹取后任何位置打开都不出屏。
test.describe('插入面板视口夹取', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('工具栏横滑到任意位置打开，面板不出屏', async ({ page }) => {
    await page.goto('/edit');
    await page.getByRole('button', { name: '可视化编辑' }).click();
    const insertButton = page.getByTestId('visual-insert');
    await expect(insertButton).toBeVisible();
    const menu = page.getByTestId('visual-insert-menu');

    // 按钮逼到视口右缘（x≈300）：夹取必须生效（实测面板宽 177 > 估计 152）
    await page.getByTestId('visual-toolbar').evaluate((el) => {
      const btn = el.querySelector('[data-testid="visual-insert"]') as HTMLElement;
      el.scrollLeft = btn.offsetLeft - 300;
    });
    await insertButton.click();
    await expect(menu).toBeVisible();
    let box = await menu.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);

    // 滑回最左再开：同样不出屏
    await insertButton.click(); // 关
    await page.getByTestId('visual-toolbar').evaluate((el) => {
      el.scrollLeft = 0;
    });
    await insertButton.click();
    box = await menu.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    // 面板功能不受夹取影响：搜索图元照常
    await page.getByTestId('visual-insert-search').fill('圆角');
    await expect(menu).toContainText('圆角');
  });
});
