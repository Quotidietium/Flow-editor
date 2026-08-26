import { expect, test } from './test';

// 启动加载指示：SPA 首屏水合前不再空白（纯 HTML/CSS，无 JS 依赖），
// Svelte 挂载清空 #svelte 后自动消失。
test.describe('启动加载指示', () => {
  test('HTML 出厂含加载指示，水合后消失', async ({ page }) => {
    // HTML 级断言（无计时竞争）：出厂页面携带 boot splash
    const response = await page.request.get('/edit');
    const html = await response.text();
    expect(html).toContain('boot-splash');
    expect(html).toContain('Flow 编辑器加载中');

    // 水合后：#svelte 被清空重建，splash 不在 DOM 中
    await page.goto('/edit');
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });
    await expect(page.getByTestId('boot-splash')).toHaveCount(0);
  });
});
