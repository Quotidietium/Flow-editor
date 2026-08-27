import { expect, test, type Page } from '@playwright/test';

// 移动端 Git/Sequence 行换行平铺：行内控件定宽合计 ~500px，390px 下
// 此前靠容器横滚可达但挤（scrollW 462 > 374 实证）——flex-wrap 展开。
test.use({ viewport: { height: 844, width: 390 } });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

const typeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(code.split('\n')[0]?.trim() ?? '');
};

const enterVisual = async (page: Page) => {
  await page.getByRole('button', { name: '可视化编辑' }).click();
};

test('git 行换行平铺：无横向滚动且按钮可视', async ({ page }) => {
  await openEditor(page);
  await page.locator('#editorMode').click();
  await page.waitForTimeout(400);
  await typeCode(page, 'gitGraph\n  commit id: "a1"\n  commit id: "a2"');
  await enterVisual(page);
  const git = page.getByTestId('visual-git');
  await expect(page.locator('[data-operation-id]').first()).toBeVisible();

  // 无横向溢出（换行吃掉全部宽度）
  const metrics = await git.evaluate((el) => ({
    clientW: el.clientWidth,
    scrollW: el.scrollWidth
  }));
  expect(metrics.scrollW).toBeLessThanOrEqual(metrics.clientW + 1);

  // 行内按钮不裁剪：删除钮在视口内
  const del = page.locator('[data-operation-id]').first().getByTitle('删除');
  const box = await del.boundingBox();
  if (!box) {
    throw new Error('bounding box unavailable');
  }
  expect(box.x + box.width).toBeLessThanOrEqual(391);
});

test('sequence 行换行平铺：无横向滚动且编辑可用', async ({ page }) => {
  await openEditor(page);
  await page.locator('#editorMode').click();
  await page.waitForTimeout(400);
  await typeCode(page, 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 你好');
  await enterVisual(page);
  const seq = page.getByTestId('visual-sequence');
  await expect(page.locator('[data-message-id]').first()).toBeVisible();

  const metrics = await seq.evaluate((el) => ({
    clientW: el.clientWidth,
    scrollW: el.scrollWidth
  }));
  expect(metrics.scrollW).toBeLessThanOrEqual(metrics.clientW + 1);

  // 编辑照常：改消息内容 Enter 提交
  const input = page.locator('[data-message-id]').first().getByLabel('消息内容');
  await input.fill('移动端改写');
  await input.press('Enter');
  await expect(page.getByTestId('visual-code-out')).toContainText('移动端改写');
});
