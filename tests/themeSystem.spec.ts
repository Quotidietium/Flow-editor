import { expect, test } from './test';

// 跟随系统明暗（循环 129）：emulateMedia 模拟系统偏好——system 态下
// mode-watcher 的派生 mode 实时响应 prefers-color-scheme，+layout 的
// toggleDarkTheme 联动把默认系 mermaid 配置 theme 同步改写（'default'
// ⇄ 'dark'，自定义主题如 forest 不受影响——该守卫逻辑零改动继承）。

const isDark = (page: import('@playwright/test').Page) =>
  page.locator('html').evaluate((el) => el.classList.contains('dark'));

const configTheme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('codeStore') ?? '{}') as { mermaid?: string };
    return (JSON.parse(store.mermaid ?? '{}') as { theme?: string }).theme;
  });

test.describe('跟随系统明暗', () => {
  test('system 态下系统切换实时生效，mermaid 配置 theme 跟随', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/edit');

    // 默认偏好即 system：未点过明暗时跟随系统（模拟深色系统 → 深色 UI）
    await expect.poll(() => isDark(page)).toBe(true);
    await expect.poll(() => configTheme(page)).toBe('dark');

    // 系统切到浅色：html 与配置 theme 同步翻转
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => isDark(page)).toBe(false);
    await expect.poll(() => configTheme(page)).toBe('default');
  });

  test('显式模式下系统切换不影响；导航栏直达钮回到显式相反态', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/edit');
    await expect.poll(() => isDark(page)).toBe(true);

    // 深色下点直达钮 → 显式浅色
    await page.getByRole('button', { name: '切换明暗主题' }).click();
    await expect.poll(() => isDark(page)).toBe(false);

    // 系统再切回深色：显式浅色不跟随
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => isDark(page)).toBe(false);

    // 直达钮再点 → 显式深色
    await page.getByRole('button', { name: '切换明暗主题' }).click();
    await expect.poll(() => isDark(page)).toBe(true);
  });
});
