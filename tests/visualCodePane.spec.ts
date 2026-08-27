import { expect, test } from './test';

// 可视化代码面板折叠：①收起后此前整块消失无重开入口（真缺陷）——现保留
// 一条可重开头部；②折叠状态跨会话记忆（收起=纯画布工作法）。
test.describe('可视化代码面板折叠记忆', () => {
  test('收起有重开入口，跨刷新保持，重开恢复', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('visual-tab').click();
    const codeOut = page.getByTestId('visual-code-out');
    await expect(codeOut).toBeVisible();

    // 点折叠头收起（面板消失但重开头部仍在）
    await page.getByTestId('visual-code-toggle').click();
    await expect(codeOut).toHaveCount(0);
    await expect(page.getByTestId('visual-code-toggle')).toContainText('已收起');

    // 刷新后保持收起（持久化）
    await page.reload();
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();
    await expect(page.getByTestId('visual-code-out')).toHaveCount(0);
    await expect(page.getByTestId('visual-code-toggle')).toContainText('已收起');

    // 重开恢复 + 复原出厂（避免污染其它用例）
    await page.getByTestId('visual-code-toggle').click();
    await expect(page.getByTestId('visual-code-out')).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('visualCodePane'));
  });
});
