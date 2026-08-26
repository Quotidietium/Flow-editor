import { expect, test } from './test';

// 移动端字号可达：偏好单例化后主菜单字号行与桌面 FontSizeMenu 共享同值
// （移动端 390px 头部菜单被空间妥协隐藏后的唯一调节入口）。
test.describe('主菜单编辑器字号', () => {
  test('390px 主菜单字号行可调且即时生效、跨刷新保持', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/edit');

    await page.locator('nav button').first().click();
    const readout = page.getByTestId('menu-font-size');
    await expect(readout).toBeVisible();
    const before = Number.parseInt((await readout.textContent()) ?? '14', 10);

    // 增大字号：读数 +2、编辑器即时生效（CodeMirror 字号样式随行）
    await page.getByTestId('menu-font-inc').click();
    await expect(readout).toHaveText(String(before + 2));
    await page.keyboard.press('Escape');

    // 跨刷新保持（偏好持久化）
    await page.reload();
    await page.locator('nav button').first().click();
    await expect(page.getByTestId('menu-font-size')).toHaveText(String(before + 2));

    // 减小还原
    await page.getByTestId('menu-font-dec').click();
    await page.getByTestId('menu-font-dec').click();
    await expect(page.getByTestId('menu-font-size')).toHaveText(String(before - 2));
  });

  test('桌面 FontSizeMenu 与主菜单行共享同一值', async ({ page }) => {
    await page.goto('/edit');
    // 桌面头部菜单选 20px
    await page.getByTestId('editor-font-size-menu').click();
    await page.getByTestId('editor-font-size-20').click();
    // 主菜单行读到同一值
    await page.locator('nav button').first().click();
    await expect(page.getByTestId('menu-font-size')).toHaveText('20');
  });
});
