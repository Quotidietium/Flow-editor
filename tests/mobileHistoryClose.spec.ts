import { expect, test } from './test';

test.describe('移动端历史面板', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('全屏接管时提供返回按钮', async ({ page }) => {
    await page.goto('/edit');
    // 打开历史（全屏接管）
    await page.getByRole('button', { name: '历史记录' }).click();
    const closeButton = page.getByTestId('history-mobile-close');
    await expect(closeButton).toBeVisible();
    // 面板内容在（搜索框/标签页）
    await expect(page.getByRole('tab', { name: /已保存/ })).toBeVisible();

    // 返回 → 面板关闭，回到编辑布局
    await closeButton.click();
    await expect(closeButton).toHaveCount(0);
    await expect(page.getByTestId('editor-word-wrap')).toBeVisible();
  });
});
