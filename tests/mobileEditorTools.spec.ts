import { expect, test } from './test';

test.describe('移动端编辑器头部工具', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('换行/字号/插入工具在 390px 宽全部可达且不溢出', async ({ page }) => {
    await page.goto('/edit');

    // 移动端滑动布局：先切到「编辑」半屏（默认停在「预览」），等滑屏动画结束
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    const wrapToggle = page.getByTestId('editor-word-wrap');
    const insertMenu = page.getByTestId('insert-snippet-menu');
    await expect(wrapToggle).toBeVisible();
    await expect(insertMenu).toBeVisible();
    // 字号菜单在移动端隐藏（头部空间不足，桌面端可用）
    await expect(page.getByTestId('editor-font-size-menu')).toHaveCount(1);
    await expect(page.getByTestId('editor-font-size-menu')).toBeHidden();

    // 头部无横向溢出：最右控件的右缘不超过编辑器卡片右缘
    const cardBox = await page.locator('.card').first().boundingBox();
    const insertBox = await insertMenu.boundingBox();
    if (!cardBox || !insertBox) {
      throw new Error('bounding box unavailable');
    }
    expect(insertBox.x).toBeGreaterThanOrEqual(0);
    expect(insertBox.x + insertBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);

    // 插入菜单在移动端（CodeMirror）照常工作：光标到文档尾后插入
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await insertMenu.click();
    await page.getByTestId('insert-snippet-node').click();
    await expect(page.locator('.cm-content')).toContainText('A[标签]');

    // 切到配置模式：模板按钮同样可达（图标化，文字折叠）
    await page.getByRole('tab', { name: '配置' }).click();
    await page.getByTestId('config-preset-menu').click();
    await page.getByTestId('config-preset-hand-drawn').click();
    await expect(page.locator('.cm-content')).toContainText('handDrawn');
  });
});
