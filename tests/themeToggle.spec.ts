import { expect, test } from './test';

// 导航栏明暗一键切换：主菜单里深埋一层的高频操作给直达钮。
test.describe('明暗主题快捷切换', () => {
  test('点击即切、双向图标与持久化', async ({ page }) => {
    await page.goto('/edit');
    const html = page.locator('html');
    const toggle = page.getByRole('button', { name: '切换明暗主题' });
    await expect(toggle).toBeVisible();

    const initiallyDark = await html.evaluate((el) => el.classList.contains('dark'));
    // 一切换即反转（图标与 title 跟随目标模式）
    await toggle.click();
    await expect
      .poll(async () => html.evaluate((el) => el.classList.contains('dark')))
      .toBe(!initiallyDark);
    await expect(toggle).toHaveAttribute('aria-pressed', String(!initiallyDark));

    // 持久化：刷新后保持
    await page.reload();
    await expect
      .poll(async () => page.locator('html').evaluate((el) => el.classList.contains('dark')))
      .toBe(!initiallyDark);

    // 再切回
    await page.getByRole('button', { name: '切换明暗主题' }).click();
    await expect
      .poll(async () => page.locator('html').evaluate((el) => el.classList.contains('dark')))
      .toBe(initiallyDark);
  });
});
