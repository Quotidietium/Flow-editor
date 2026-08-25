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
});
