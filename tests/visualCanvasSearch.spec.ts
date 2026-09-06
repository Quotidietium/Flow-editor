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

  // 循环 153：Enter 不再只定位首个命中——重复按循环前进、Shift+Enter 后退，
  // 两端回卷；读数显示「当前/总数」；查询变化即复位位置。
  test('Enter/Shift+Enter 循环命中并显示位置读数', async ({ page }) => {
    await page.goto('/edit');
    // 默认图各标签无公共子串——自定义三命中图（Monaco 隐藏时不接受
    // 剪贴板粘贴，进可视化之前先改码）
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      'flowchart TD\n  A[苹果一] --> B[苹果二]\n  B --> C[苹果三]'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+KeyV');
    await expect(editor).toContainText('苹果一');
    await page.getByTestId('visual-tab').click();
    await expect(page.getByTestId('visual-canvas')).toBeVisible();

    const search = page.getByTestId('visual-canvas-search');
    const count = page.getByTestId('visual-canvas-search-count');
    await search.fill('苹果');
    await expect(count).toHaveText('3 匹配');

    // 选中态 = 节点描边加粗（stroke-width 2.5），随循环逐节点迁移
    const selectedStroke = (id: string) =>
      page.locator(`[data-node-id="${id}"] [stroke-width="2.5"]`);
    await search.press('Enter');
    await expect(count).toHaveText('1/3 匹配');
    await expect(selectedStroke('A')).toHaveCount(1);
    await search.press('Enter');
    await expect(count).toHaveText('2/3 匹配');
    await expect(selectedStroke('B')).toHaveCount(1);
    await search.press('Enter');
    await expect(count).toHaveText('3/3 匹配');
    await expect(selectedStroke('C')).toHaveCount(1);
    // 到底回卷到首个
    await search.press('Enter');
    await expect(count).toHaveText('1/3 匹配');
    await expect(selectedStroke('A')).toHaveCount(1);
    // Shift+Enter 后退（从 1 回卷到 3）
    await search.press('Shift+Enter');
    await expect(count).toHaveText('3/3 匹配');
    await expect(selectedStroke('C')).toHaveCount(1);
    // 查询变化复位位置读数
    await search.fill('苹果三');
    await expect(count).toHaveText('1 匹配');
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
