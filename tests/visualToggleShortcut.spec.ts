import { expect, test } from './test';

// Ctrl+E 切换可视化编辑：代码 ↔ 画布高频切换免挪鼠标。
test.describe('Ctrl+E 切可视化', () => {
  test('按键开关可视化画布，输入框聚焦时不劫持', async ({ page }) => {
    await page.goto('/edit');
    // 等应用就绪（onMount 键盘监听挂载）
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // Ctrl+E 开：可视化画布出现
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('visual-canvas')).toBeVisible();
    await expect(page.getByTestId('visual-code-out')).toBeVisible();

    // Ctrl+E 关：回到预览
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
    await expect(page.locator('#container')).toContainText('圣诞节');

    // 输入框聚焦时（可视化搜索框）不劫持 Ctrl+E（浏览器默认行为不拦）
    await page.keyboard.press('Control+e');
    const search = page.getByTestId('visual-canvas-search');
    await search.focus();
    await page.keyboard.press('Control+e');
    // 仍是可视化（聚焦输入框时按键未切走）——按键落入输入框不触发全局
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    // 帮助对话框收录该快捷键
    await page.locator('nav button').first().click();
    await page.getByTestId('menu-shortcuts').click();
    const dialog = page.getByTestId('app-shortcuts-dialog');
    await expect(dialog).toContainText('Ctrl+E');
  });
});
