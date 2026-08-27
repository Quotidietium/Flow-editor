import { expect, test } from './test';

// 画布节点搜索：大流程图定位节点全靠拖屏——命中保持原样、非命中降为
// 25% 不透明度；Esc 清空；只影响显示不动数据。
test.describe('画布节点搜索', () => {
  test('搜索命中保持、非命中降透明度，Esc 恢复', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();
    // 默认图 6 节点（含特殊节点外全部 data-node-id 行）
    const nodes = page.locator('[data-node-id]');
    const total = await nodes.count();
    expect(total).toBeGreaterThanOrEqual(5);

    const search = page.getByTestId('visual-canvas-search');
    // 无匹配（循环 121）：明确提示 Esc 清除，避免全暗画布看着像卡死
    await search.fill('不存在的节点xyz');
    await expect(page.getByTestId('visual-canvas-search-count')).toHaveText('无匹配（Esc 清除）');
    await search.press('Escape');

    await search.fill('圣诞');
    await expect(page.getByTestId('visual-canvas-search-count')).toHaveText('1 匹配');
    // 命中节点：data-search-hit、无降透明；其余节点 opacity=0.25
    await expect(page.locator('[data-search-hit="true"]')).toHaveCount(1);
    expect(await page.locator('[data-node-id][opacity="0.25"]').count()).toBe(total - 1);

    // 只影响显示不动数据：代码不变（生成代码仍含全部节点）
    const codeOut = page.getByTestId('visual-code-out');
    await expect(codeOut).toContainText('去购物');

    // Esc 清空：全部恢复
    await search.press('Escape');
    await expect(page.getByTestId('visual-canvas-search-count')).toHaveCount(0);
    expect(await page.locator('[data-node-id][opacity="0.25"]').count()).toBe(0);
  });

  test('Enter 滚动居中并选中首个命中（节点操作即刻可用）', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    // 未选中时形状按钮禁用
    const shapeButton = page.getByRole('button', { name: /^形状:/ });
    await expect(shapeButton).toBeDisabled();

    const search = page.getByTestId('visual-canvas-search');
    // 选底行节点「新车」：居中目标滚动量为正（顶部节点目标为负会被钳到 0）
    await search.fill('新车');
    await search.press('Enter');

    // 首个命中被选中：形状按钮解禁，选区计数落到该节点
    await expect(shapeButton).toBeEnabled();
    await expect(page.locator('[data-search-hit="true"]')).toHaveCount(1);

    // 滚动确实发生（smooth 滚动异步进行，轮询到位）
    const canvas = page.getByTestId('visual-canvas');
    await expect
      .poll(async () => canvas.evaluate((el) => el.scrollTop + el.scrollLeft))
      .toBeGreaterThan(0);
  });
});
