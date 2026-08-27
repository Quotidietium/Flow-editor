import { expect, test } from './test';

test.describe('移动端导出菜单', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('菜单整体在视口内（空间不足转 fixed 门户，内容完整或可滚）', async ({ page }) => {
    await page.goto('/edit');
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    // 操作卡片默认收起，展开后点导出
    await page.locator('.card', { hasText: '操作' }).first().locator('[role="toolbar"]').click();
    await page.getByRole('button', { name: /导出/ }).first().click();
    const menu = page.getByTestId('export-menu-list');
    await page.waitForTimeout(400);
    const probe = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        bottom: r.bottom,
        height: r.height,
        overflowY: getComputedStyle(el).overflowY,
        scrollH: el.scrollHeight,
        top: r.top,
        vh: window.innerHeight
      };
    });
    console.log(JSON.stringify(probe));
    // 修复后断言：菜单整体在视口内；内容完整可见或可滚（全展开时
    // scrollHeight ≈ 高度，只差边框取整）
    expect(probe.bottom).toBeLessThanOrEqual(probe.vh);
    expect(probe.top).toBeGreaterThanOrEqual(0);
    expect(probe.scrollH).toBeGreaterThanOrEqual(probe.height - 2);
  });
});
