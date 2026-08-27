import { expect, test } from './test';

// Ctrl+F 聚焦画布搜索（可视化模式下拦截浏览器原生查找——意图几乎总是
// 找节点；输入控件聚焦时按 isTypingTarget 早退不劫持）。
test.describe('Ctrl+F 聚焦画布搜索', () => {
  test('可视化模式聚焦搜索并选中既有词，Esc 清空链路照常', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    // Ctrl+F：焦点落搜索框（全选既有内容）
    await page.keyboard.press('Control+f');
    const search = page.getByTestId('visual-canvas-search');
    await expect(search).toBeFocused();

    // 直接输入即过滤（聚焦后键入替换全选内容）
    await page.keyboard.type('圣诞');
    await expect(page.getByTestId('visual-canvas-search-count')).toHaveText('1 匹配');

    // Esc 清空链路照常
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('visual-canvas-search-count')).toHaveCount(0);
  });
});
