import { expect, test } from './test';

// 复制图像（PNG 入剪贴板）：此前 fire-and-forget，写入被拒只进 console
// 而按钮照显 ✓（假阳性）；现成败都有 toast，且零测试覆盖补齐。
test.describe('复制图像到剪贴板', () => {
  test('点击后 toast 确认且剪贴板内确有 PNG', async ({ page, context, editPage }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 操作卡片可能被示例卡片挤收（fixture 注释同款），先展开
    await editPage.ensureActionsOpen();
    const copyButton = page.getByRole('button', { name: '复制图像' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(page.getByText('已复制图像到剪贴板')).toBeVisible();
    // 剪贴板实读：确有 image/png 条目（而非仅凭 toast）
    const types = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap((item) => [...item.types]);
    });
    expect(types).toContain('image/png');
    await editPage.checkTextInView('圣诞节');
  });
});
