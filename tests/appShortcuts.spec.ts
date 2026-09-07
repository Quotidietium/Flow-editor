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

  test('按 ? 直达帮助；编辑器输入态不劫持', async ({ page }) => {
    await page.goto('/edit');

    // 非输入态按 ? 直接打开帮助（GitHub/VS Code 同款自助入口）
    await page.locator('#view').waitFor({ state: 'visible' });
    await page.keyboard.press('?');
    const dialog = page.getByTestId('app-shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('打开本快捷键帮助');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Monaco 聚焦时 ? 是正常文本输入，不弹帮助——键击真实落到文档
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.keyboard.press('?');
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}').code ?? '')
      )
      .toContain('?');
  });

  test('桌面端帮助列出 Monaco 编辑器键位区块（循环 170）', async ({ page }) => {
    await page.goto('/edit');

    await page.locator('nav button').first().click();
    await page.getByTestId('menu-shortcuts').click();
    const dialog = page.getByTestId('app-shortcuts-dialog');
    // Monaco 自带键位此前不可发现：F1 命令面板是全部命令的总入口
    await expect(dialog).toContainText('代码编辑器（桌面端 Monaco）自带');
    await expect(dialog).toContainText('命令面板');
    await expect(dialog).toContainText('跳转到行');
    await expect(dialog).toContainText('Ctrl+Shift+K');
    await page.keyboard.press('Escape');
  });

  test('移动端不渲染 Monaco 区块（CodeMirror 键位不同，循环 170）', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/edit');

    await page.locator('nav button').first().click();
    await page.getByTestId('menu-shortcuts').click();
    const dialog = page.getByTestId('app-shortcuts-dialog');
    await expect(dialog).toBeVisible();
    // 应用级条目仍在，Monaco 区块不出（移动端编辑器是 CodeMirror）
    await expect(dialog).toContainText('收藏当前图到历史');
    await expect(dialog).not.toContainText('Monaco');
    await expect(dialog).not.toContainText('命令面板');
    await page.keyboard.press('Escape');
  });
});
