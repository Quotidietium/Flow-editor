import { expect, test } from './test';

// 移动端状态栏防挤压：图类型（循环43）/字符数（循环54）/已选数（循环68）
// 逐批加宽后，390px 下全套件必须在视口内。
test.describe('移动端状态栏', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('全套件（含已选）在 390px 视口内', async ({ page }) => {
    await page.goto('/edit');
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    const status = page.getByTestId('editor-status');
    await expect(status).toBeVisible();
    // 图类型在左、统计在右
    await expect(page.getByTestId('editor-kind')).toHaveText('流程图');
    await expect(page.getByTestId('editor-char-count')).toContainText('字符');

    // 全选出已选数（最宽形态）
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+KeyA');
    await expect(page.getByTestId('editor-selection')).toContainText('已选');

    const box = await status.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    // 各套件自身也在视口内
    const selectionBox = await page.getByTestId('editor-selection').boundingBox();
    if (!selectionBox) {
      throw new Error('bounding box unavailable');
    }
    expect(selectionBox.x + selectionBox.width).toBeLessThanOrEqual(391);
  });
});
