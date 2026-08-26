import { expect, test } from './test';

// 主菜单深色模式行：整行 cursor-pointer 却只有 Switch 可点（点击假象）——
// 行文本自身即切换入口（role=button + 键盘全可达）。
test.describe('主菜单深色模式行', () => {
  test('点行文本即切换主题，Switch 路径不受影响', async ({ page }) => {
    await page.goto('/edit');
    const html = page.locator('html');
    const initiallyDark = await html.evaluate((el) => el.classList.contains('dark'));

    // 打开主菜单（汉堡）
    await page.locator('nav button').first().click();
    const row = page.getByRole('button', { name: '深色模式' });
    await expect(row).toBeVisible();
    await row.click();
    await expect
      .poll(async () => html.evaluate((el) => el.classList.contains('dark')))
      .toBe(!initiallyDark);

    // Switch 路径照旧：行点击不关 popover（无 Popover.Close），同会话直点
    const switchButton = page.getByRole('switch');
    await expect(switchButton).toBeVisible();
    await switchButton.click();
    await expect
      .poll(async () => html.evaluate((el) => el.classList.contains('dark')))
      .toBe(initiallyDark);
  });
});
