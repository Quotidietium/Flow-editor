import { expect, test } from './test';

// 卡片折叠状态跨会话记忆：收起示例卡片专心作图（或常驻展开操作卡片），
// 重载后保持。不给 persistKey 的卡片（编辑卡）行为不变。
test.describe('卡片折叠状态记忆', () => {
  test('折叠/展开跨刷新保持', async ({ page }) => {
    await page.goto('/edit');
    const presetCard = page.locator('.card', { hasText: '示例图表' }).first();
    const actionsCard = page.locator('.card', { hasText: '操作' }).first();

    // 初始：示例展开、操作收起（出厂默认）
    await expect(presetCard.locator('.flex-grow.overflow-x-auto')).toBeVisible();
    await expect(actionsCard.locator('.flex-grow.overflow-x-auto')).toHaveCount(0);

    // 收起示例卡片 + 展开操作卡片
    await presetCard.locator('[role="toolbar"]').click();
    await expect(presetCard.locator('.flex-grow.overflow-x-auto')).toHaveCount(0);
    await actionsCard.locator('[role="toolbar"]').click();
    await expect(actionsCard.locator('.flex-grow.overflow-x-auto')).toBeVisible();

    // 刷新后：两个卡片保持用户选择
    await page.reload();
    await expect(page.locator('.card', { hasText: '示例图表' }).first()).toBeVisible();
    await expect(
      page.locator('.card', { hasText: '示例图表' }).first().locator('.flex-grow.overflow-x-auto')
    ).toHaveCount(0);
    await expect(
      page.locator('.card', { hasText: '操作' }).first().locator('.flex-grow.overflow-x-auto')
    ).toBeVisible();

    // 复原出厂（避免污染其它用例的初始状态感知）：再各点一次
    await page
      .locator('.card', { hasText: '示例图表' })
      .first()
      .locator('[role="toolbar"]')
      .click();
    await page.locator('.card', { hasText: '操作' }).first().locator('[role="toolbar"]').click();
  });
});
