import { expect, test } from './test';

// 键盘缩放（循环 148）：PanZoomToolbar 全局键位 + 放大、- 缩小、0 重置、
// F 适应窗口——/view 只读页与 /edit 预览同享；输入态与修饰键组合让路。
test.describe('预览键盘缩放', () => {
  const readoutOf = (page: import('@playwright/test').Page) => page.getByTestId('zoom-level');
  const readoutValue = async (page: import('@playwright/test').Page): Promise<number> =>
    Number.parseInt((await readoutOf(page).textContent()) ?? '0', 10);

  test('/view：+ 放大、- 缩小、0 重置回归 88%', async ({ editPage }) => {
    // 全程走 editPage.page（导航在 fixture 里；只解构 page 会跑在 about:blank）
    const page = editPage.page;
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    await page.goto(page.url().replace('/edit', '/view'));
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    const readout = readoutOf(page);
    await expect(readout).toBeVisible();
    const initial = await readoutValue(page);

    // 纯字符键直接驱动缩放（无需先点工具栏）
    await page.keyboard.press('+');
    await expect.poll(() => readoutValue(page)).toBeGreaterThan(initial);
    const zoomed = await readoutValue(page);

    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect.poll(() => readoutValue(page)).toBeLessThan(zoomed);

    // 0 = 重置视图（同工具钮语义，回归 0.875 基准）
    await page.keyboard.press('0');
    await expect(readout).toHaveText('88%');
  });

  test('/view：F 适应窗口——放大后一键归位', async ({ editPage }) => {
    const page = editPage.page;
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    await page.goto(page.url().replace('/edit', '/view'));
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    const zoomed = await readoutValue(page);

    await page.keyboard.press('f');
    await expect.poll(() => readoutValue(page)).toBeLessThan(zoomed);
  });

  test('/edit：输入态守卫——输入框内敲 +/f/0 不触发缩放，字符照常入框', async ({
    page,
    editPage
  }) => {
    const readout = readoutOf(page);
    await expect(readout).toHaveText('88%');

    // 用导出文件名输入框做纯输入态（改它不触碰图表代码，无重渲染干扰）
    await editPage.ensureActionsOpen();
    const nameInput = page.getByTestId('export-filename');
    await nameInput.click();
    await page.keyboard.press('+');
    await page.keyboard.press('f');
    await page.keyboard.press('0');
    await expect(nameInput).toHaveValue('+f0');
    // 读数不动：纯字符键在输入态让路
    await expect(readout).toHaveText('88%');
  });
});
