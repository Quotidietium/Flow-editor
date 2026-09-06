import { expect, test } from './test';

const editorFontSize = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const line = document.querySelector('.monaco-editor .view-line');
    return line ? Number.parseFloat(getComputedStyle(line).fontSize) : 0;
  });

test.describe('编辑器字号', () => {
  test('选择字号即时生效且跨会话保持', async ({ page }) => {
    await page.goto('/edit');
    const menu = page.getByTestId('editor-font-size-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('14');

    // 切到 18px：Monaco 行计算样式真实变化 + 按钮读数更新
    await menu.click();
    await page.getByTestId('editor-font-size-18').click();
    await expect(menu).toContainText('18');
    await expect.poll(async () => editorFontSize(page)).toBe(18);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('editorFontSize')))
      .toBe('18');

    // 刷新后偏好保持且构造即生效
    await page.reload();
    await expect(page.getByTestId('editor-font-size-menu')).toContainText('18');
    await expect.poll(async () => editorFontSize(page)).toBe(18);

    // 恢复 14，避免污染同浏览器后续用例
    await page.getByTestId('editor-font-size-menu').click();
    await page.getByTestId('editor-font-size-14').click();
    await expect.poll(async () => editorFontSize(page)).toBe(14);
  });

  test('Ctrl+滚轮调字号：同一偏好即时生效、夹取 12–20、无 Ctrl 不劫持', async ({ page }) => {
    await page.goto('/edit');
    await expect.poll(async () => editorFontSize(page)).toBe(14);
    await page.locator('.monaco-editor').hover();

    // Ctrl+滚轮上 = 放大一档（滚轮步进 1，比菜单 ±2 细），偏好即时持久化
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect.poll(async () => editorFontSize(page)).toBe(15);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('editorFontSize')))
      .toBe('15');

    // Ctrl+滚轮下 = 缩小，回到 14
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Control');
    await expect.poll(async () => editorFontSize(page)).toBe(14);

    // 连滚越过下限：夹取在 12 停住（不会一路缩到不可读）
    await page.keyboard.down('Control');
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 120);
    }
    await page.keyboard.up('Control');
    await expect.poll(async () => editorFontSize(page)).toBe(12);

    // 无 Ctrl 的滚轮是编辑器滚动，字号不动
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => editorFontSize(page)).toBe(12);

    // 恢复 14，避免污染同浏览器后续用例
    await page.getByTestId('editor-font-size-menu').click();
    await page.getByTestId('editor-font-size-14').click();
    await expect.poll(async () => editorFontSize(page)).toBe(14);
  });
});
