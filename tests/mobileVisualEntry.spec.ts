import { expect, test } from './test';

// 移动端（滑屏布局：代码半屏 | 预览半屏）开启「可视化编辑」时，画布挂在
// 预览半屏——若用户停在代码半屏点开关，页面必须自动翻过去，否则如同没反应。
test.describe('移动端可视化入口', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  const visualToolbarBox = async (page: import('@playwright/test').Page) => {
    const button = page.getByTestId('visual-add-node');
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    if (!box) {
      throw new Error('bounding box unavailable');
    }
    return box;
  };

  test('代码半屏点可视化 → 自动翻到画布半屏；手动翻回不被拽回', async ({ page }) => {
    await page.goto('/edit');

    // 先翻到代码半屏（默认停在预览半屏）
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('editor-word-wrap')).toBeVisible();

    // 开启可视化：画布在另一半屏，页面应自动翻页
    await page.getByRole('button', { name: '可视化编辑' }).click();
    await page.waitForTimeout(400);
    const box = await visualToolbarBox(page);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);

    // 文档无横向滚动条（滑屏容器 200% 但页面本身不溢出）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // 用户手动翻回代码半屏：不被自动逻辑拽回（只跟随开启的上升沿）
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('editor-word-wrap')).toBeVisible();
    // 可视化仍开着，画布留在另一半屏（不强行翻回）
    const offscreen = await page.getByTestId('visual-add-node').boundingBox();
    expect(offscreen === null || offscreen.x >= 390 || offscreen.x + offscreen.width <= 0).toBe(
      true
    );
  });

  test('预览半屏直接开可视化：画布本就在眼前，位置不变', async ({ page }) => {
    await page.goto('/edit');
    // 默认停在预览半屏，直接开可视化
    await page.getByRole('button', { name: '可视化编辑' }).click();
    const box = await visualToolbarBox(page);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  });
});
