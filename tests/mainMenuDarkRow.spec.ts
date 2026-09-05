import { type Page } from '@playwright/test';
import { expect, test } from './test';

// 主菜单外观行（循环 129 三态化）：浅色 / 跟随系统 / 深色 三段选择。
// 旧「整行点击切换 + Switch」的两态交互已由三段钮取代——原 a11y 问题
// （整行可点假象）随原生 button 结构性消除。高亮 = 原始偏好
// （userPrefersMode），持久化键 mode-watcher-mode。

const openAppearance = async (page: Page) => {
  await page.locator('nav button').first().click();
  await expect(page.getByRole('group', { name: '外观模式' })).toBeVisible();
};

const isDark = (page: Page) => page.locator('html').evaluate((el) => el.classList.contains('dark'));

test.describe('主菜单外观三段选择', () => {
  test('点击分段即切换模式并高亮，偏好持久化', async ({ page }) => {
    await page.goto('/edit');
    await openAppearance(page);

    await page.getByTestId('appearance-dark').click();
    await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('appearance-light')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => isDark(page)).toBe(true);

    // 持久化：刷新后保持显式深色
    await page.reload();
    await openAppearance(page);
    await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => isDark(page)).toBe(true);
  });

  test('回切「跟随系统」：显式深色回到系统偏好（模拟浅色系统）', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/edit');
    await openAppearance(page);

    await page.getByTestId('appearance-dark').click();
    await expect.poll(() => isDark(page)).toBe(true);

    // 切回跟随系统：系统偏好是 light → 回到浅色
    await page.getByTestId('appearance-system').click();
    await expect(page.getByTestId('appearance-system')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => isDark(page)).toBe(false);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('mode-watcher-mode')))
      .toBe('system');
  });
});
