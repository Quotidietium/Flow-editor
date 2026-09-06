import { expect, test } from './test';
import type { Page } from '@playwright/test';

// 移动端 390×844 弹层盘点（循环 155）：主要弹层/对话框逐面打开，
// 断言完整落在视口内（fixed/portal 定位错误的历史高发区）；对话框
// Esc 可关（键盘路径）。测量前必须等开合动画落定（bits-ui zoom/slide
// ~200ms——裸 boundingBox 会量到中途位移帧，探针曾因此误报）。
test.use({ viewport: { height: 844, width: 390 } });

const VIEWPORT = { h: 844, w: 390 };

/** 断言 selector 首个元素的包围盒完整落在 390×844 视口内。 */
const expectWithinViewport = async (page: Page, selector: string): Promise<void> => {
  // 等过渡动画落定
  await page.waitForTimeout(500);
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} 应有包围盒`).not.toBeNull();
  if (!box) {
    return;
  }
  expect(box.x, `${selector} 左缘出屏`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${selector} 上缘出屏`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${selector} 右缘出屏`).toBeLessThanOrEqual(VIEWPORT.w + 1);
  expect(box.y + box.height, `${selector} 下缘出屏`).toBeLessThanOrEqual(VIEWPORT.h + 1);
};

const expectNoPageOverflow = async (page: Page): Promise<void> => {
  const m = await page.evaluate(() => ({
    iw: window.innerWidth,
    sw: document.documentElement.scrollWidth
  }));
  expect(m.sw, '页面级横向溢出').toBeLessThanOrEqual(m.iw + 1);
};

test.describe('移动端弹层盘点', () => {
  test('历史/分享/插件/导出菜单/主菜单 全部落在视口内，对话框 Esc 可关', async ({ page }) => {
    await page.goto('/edit');
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    await expectNoPageOverflow(page);

    // 历史（移动端全屏接管面板）
    await page.getByRole('button', { name: '历史记录' }).click();
    await expectWithinViewport(page, '[data-testid="history-mobile-close"]');
    await expectNoPageOverflow(page);
    await page.getByTestId('history-mobile-close').click();
    await page.waitForTimeout(300);

    // 分享对话框：在视口内 + Esc 可关
    await page.getByRole('button', { name: '分享' }).click();
    await expectWithinViewport(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // 插件管理器：在视口内 + Esc 可关（循环 155 修复：keydown 拦截曾吞掉
    // Escape，bits-ui 图层栈收不到 → 对话框关不掉）
    await page.getByRole('button', { exact: true, name: '插件' }).click();
    await expectWithinViewport(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // 导出菜单（空间不足转 fixed 门户钳入）：卡片在编辑半屏，操作卡移动端
    // 默认收起——先翻页再经卡片 toolbar 展开（mobileExportMenu 既有模式）
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);
    await page.locator('.card', { hasText: '操作' }).first().locator('[role="toolbar"]').click();
    await page.getByTestId('export-menu').click();
    await expectWithinViewport(page, '[data-testid="export-menu-list"]');
    await page.keyboard.press('Escape');

    // 主菜单（Popover，循环 155 起触发器有了无障碍名）
    await page.getByRole('button', { name: '主菜单' }).click();
    await expectWithinViewport(page, '[data-testid="main-menu-content"]');
    await page.keyboard.press('Escape');

    await expectNoPageOverflow(page);
  });
});
