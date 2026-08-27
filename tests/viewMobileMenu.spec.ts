import { expect, test } from './test';

// /view 移动端按钮收纳：四个显式按钮在 390px 占 288×208（74% 宽、
// 顶部 1/4 高）严重遮图——收进「更多」菜单；桌面保留显式按钮。
test.describe('/view 移动端更多菜单', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('显式按钮隐藏、菜单可用且遮蔽大幅缩小', async ({ page }) => {
    await page.goto('/edit');
    await page.waitForURL(/#pako:/);
    await page.goto(page.url().replace('/edit', '/view'));
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 显式按钮隐藏（sm 以下），菜单触发钮在场
    await expect(page.getByTestId('view-edit-link')).toBeHidden();
    await expect(page.getByTestId('view-actions-menu')).toBeVisible();

    // 收纳后右上列高度大幅缩小（触发钮+缩放工具栏 ≈ 80px vs 原 208px）
    const col = page.locator('.absolute.top-2.right-2');
    const box = await col.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    expect(box.height).toBeLessThanOrEqual(96);

    // 菜单路径可用：打开并复制链接（getByRole 走 a11y 树——隐藏的
    // sm 按钮不在树内，绕开 getByText 的双命中）
    await page.getByTestId('view-actions-menu').click();
    await page.getByRole('button', { name: '复制链接' }).click();
    await expect(page.getByText('已复制链接')).toBeVisible();
  });

  test('桌面保持显式按钮（无菜单触发钮）', async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await page.goto('/edit');
    await page.waitForURL(/#pako:/);
    await page.goto(page.url().replace('/edit', '/view'));
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    await expect(page.getByTestId('view-edit-link')).toBeVisible();
    await expect(page.getByTestId('view-copy-link')).toBeVisible();
    await expect(page.getByTestId('view-actions-menu')).toBeHidden();
  });
});
