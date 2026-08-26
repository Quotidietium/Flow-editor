import { expect, test } from './test';

// 右键菜单 portal：与插入面板/整理菜单同一个 transform 偏移缺陷
// （fixed 在 200% 滑屏容器内相对祖先定位，移动端偏移 390px 出屏）。
test.describe('右键菜单移动端定位', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('390px 右键节点，菜单在视口内且可用', async ({ page }) => {
    await page.goto('/edit');
    await page.getByRole('button', { name: '可视化编辑' }).click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    // 右键第一个节点（画布类元素级断言在移动窄屏用 mouse 坐标更稳）
    const node = page.locator('[data-node-id]').first();
    const box = await node.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });

    const menu = page.getByTestId('visual-context-menu');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    if (!menuBox) {
      throw new Error('bounding box unavailable');
    }
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(391);

    // 菜单可用：点「编辑标签」打开内联编辑器（自动聚焦、预填节点名）
    await menu.getByText('编辑标签').click();
    await expect(page.locator('input[type="text"]:focus')).toHaveValue('圣诞节');
  });
});
