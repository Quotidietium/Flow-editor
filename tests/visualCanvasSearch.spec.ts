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
});
