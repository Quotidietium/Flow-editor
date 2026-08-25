import { expect, test } from './test';

// 预览背景四档循环：网格点 → 棋盘格（透明检查）→ 纯白 → 纯黑 → 网格点。
// 主要服务透明 PNG/SVG 导出前的核对（棋盘格是设计工具通用的透明示意）。
test.describe('预览背景切换', () => {
  test('循环四档并持久化', async ({ page }) => {
    await page.goto('/edit');
    const view = page.locator('#view');
    const toggle = page.getByTestId('preview-bg-toggle');

    // 默认网格点（跟随主题的 grid-bg-*）
    await expect(view).toHaveClass(/grid-bg-/);
    await expect(toggle).toHaveAttribute('title', /网格点/);

    // 棋盘格：透明检查
    await toggle.click();
    await expect(view).toHaveClass(/preview-bg-checker/);
    await expect(toggle).toHaveAttribute('title', /棋盘格/);

    // 纯白 / 纯黑（与主题无关，核对文档嵌图效果）
    await toggle.click();
    await expect(view).toHaveClass(/preview-bg-white/);
    await toggle.click();
    await expect(view).toHaveClass(/preview-bg-black/);

    // 回到网格点
    await toggle.click();
    await expect(view).toHaveClass(/grid-bg-/);

    // 持久化：切到纯白后刷新仍生效
    await toggle.click();
    await toggle.click();
    await expect(view).toHaveClass(/preview-bg-white/);
    await page.reload();
    await expect(page.locator('#view')).toHaveClass(/preview-bg-white/);
  });

  test('全屏预览页同样生效', async ({ page }) => {
    await page.goto('/edit');
    const toggle = page.getByTestId('preview-bg-toggle');
    await toggle.click();
    await expect(page.locator('#view')).toHaveClass(/preview-bg-checker/);

    // 查看页复用同一工具栏与持久化档位
    await page.goto('/view');
    await expect(page.locator('#view')).toHaveClass(/preview-bg-checker/);
    await page.getByTestId('preview-bg-toggle').click();
    await expect(page.locator('#view')).toHaveClass(/preview-bg-white/);
  });
});
