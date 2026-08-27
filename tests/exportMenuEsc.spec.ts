import { expect, test } from './test';

// 导出菜单 Esc 关闭：bits-ui 弹层原生有 Esc，此自制菜单此前只支持点外关闭。
test.describe('导出菜单 Esc 关闭', () => {
  test('打开后 Esc 即关、菜单项点击路径不受影响', async ({ page, editPage }) => {
    await editPage.openExportMenu();
    const menu = page.getByTestId('export-menu-list');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // 再开一次走菜单项路径（Esc 改造不破常规交互）
    await editPage.openExportMenu();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: /Markdown/ }).click();
    await expect(menu).toHaveCount(0);
  });
});
