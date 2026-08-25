import { expect, test } from './test';

test.describe('/view 只读页', () => {
  test('有缩放工具与「在编辑器中打开」回链', async ({ page, editPage }) => {
    // 拿到当前图的 /view 链接（fixture 已加载默认图）
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    const editUrl = page.url();
    const viewUrl = editUrl.replace('/edit', '/view');
    await page.goto(viewUrl);

    // 图表渲染
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 缩放工具：读数存在，放大后读数上升
    const readout = page.getByTestId('zoom-level');
    await expect(readout).toBeVisible();
    const before = Number.parseInt((await readout.textContent()) ?? '0', 10);
    await page.getByRole('button', { name: '放大' }).click();
    await expect
      .poll(async () => Number.parseInt((await readout.textContent()) ?? '0', 10))
      .toBeGreaterThan(before);

    // 回链指向 /edit#pako 且可回到编辑器
    const link = page.getByTestId('view-edit-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/edit#pako:/);
    await link.click();
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });
    await editPage.checkTextInView('圣诞节');
  });
});
