import { expect, test } from './test';

// 移动端示例卡片默认折叠：编辑半屏 390px 实测示例卡占 296px（编辑器仅
// 364px，40% 被吃）——sm 以下默认收起，展开仍可（persistKey 记忆用户选择）。
test.describe('移动端示例卡默认折叠', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('初始折叠（编辑器占满），点开可用且记忆', async ({ page }) => {
    await page.goto('/edit');
    await page.locator('#editorMode').click();
    await page.waitForTimeout(500);

    // 初始折叠：卡片只剩头（~44px），示例内容不在
    const presetCard = page.locator('.card', { hasText: '示例图表' }).first();
    const collapsed = await presetCard.boundingBox();
    if (!collapsed) {
      throw new Error('bounding box unavailable');
    }
    expect(collapsed.height).toBeLessThanOrEqual(56);
    await expect(presetCard.locator('.flex-grow.overflow-x-auto')).toHaveCount(0);

    // 编辑器显著变高（对照折叠前实测 364px）
    const editorCard = page.locator('.card', { hasText: '代码' }).first();
    const editorBox = await editorCard.boundingBox();
    if (!editorBox) {
      throw new Error('bounding box unavailable');
    }
    expect(editorBox.height).toBeGreaterThan(420);

    // 点开可用 + 刷新后记住展开选择
    await presetCard.locator('[role="toolbar"]').click();
    await expect(presetCard.locator('.flex-grow.overflow-x-auto')).toBeVisible();
    await page.reload();
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);
    await expect(
      page.locator('.card', { hasText: '示例图表' }).first().locator('.flex-grow.overflow-x-auto')
    ).toBeVisible();

    // 复原出厂默认（避免污染其他用例的初始状态感知）
    await page.evaluate(() => localStorage.removeItem('flowCardPreset'));
  });
});
