import { expect, test } from './test';

// 主菜单应用级快捷键帮助：可视化编辑器有 24 项帮助，主应用此前没有
// 任何快捷键速查（Ctrl+S 收藏、拖拽打开等功能不可发现）。
test.describe('应用级快捷键帮助', () => {
  test('主菜单打开帮助，覆盖高频项与可视化指引', async ({ page }) => {
    await page.goto('/edit');

    await page.locator('nav button').first().click();
    await page.getByTestId('menu-shortcuts').click();
    const dialog = page.getByTestId('app-shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('收藏当前图到历史');
    await expect(dialog).toContainText('拖到窗口直接打开');
    await expect(dialog).toContainText('双指捏合');
    // 指引可视化编辑器的完整帮助入口
    await expect(dialog).toContainText('24 项');

    // Esc 关闭
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
