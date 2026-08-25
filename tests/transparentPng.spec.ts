import { readFileSync } from 'node:fs';
import { expect, test } from './test';

test.describe('透明背景导出', () => {
  test('勾选后 PNG 字节变化且偏好持久', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    const toggle = page.getByTestId('png-transparent');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    const downloadPng = async (): Promise<Buffer> => {
      const downloadPromise = page.waitForEvent('download');
      await editPage.openExportMenu();
      await page.getByTestId('download-PNG').click();
      const path = await (await downloadPromise).path();
      if (!path) throw new Error('download path missing');
      return readFileSync(path);
    };

    const opaque = await downloadPng();
    expect(opaque.length).toBeGreaterThan(1000);

    // 勾选透明背景：画布不再填充底色，PNG 字节必然变化
    await toggle.check();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('pngTransparentBg')))
      .toBe('true');
    const transparent = await downloadPng();
    expect(transparent.length).toBeGreaterThan(1000);
    expect(transparent.equals(opaque)).toBe(false);

    // 取消勾选恢复不透明，偏好落盘 false
    await toggle.uncheck();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('pngTransparentBg')))
      .toBe('false');
  });

  test('SVG 下载随透明选项去掉背景色', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    const toggle = page.getByTestId('png-transparent');

    const downloadSvgText = async (): Promise<string> => {
      const downloadPromise = page.waitForEvent('download');
      await editPage.openExportMenu();
      await page.getByTestId('download-SVG').click();
      const path = await (await downloadPromise).path();
      if (!path) throw new Error('download path missing');
      return readFileSync(path, 'utf8');
    };

    // 判别点 = 根 <svg> 标签的内联 style（mermaid 自带 CSS 也含
    // background-color 字样，不能整串断言）
    const rootStyle = (svg: string): string => svg.match(/<svg[^>]*\bstyle="([^"]*)"/)?.[1] ?? '';

    // 不透明：根元素带背景色
    const opaque = await downloadSvgText();
    expect(rootStyle(opaque)).toContain('background-color');

    // 透明：根元素不带背景色
    await toggle.check();
    const transparent = await downloadSvgText();
    expect(rootStyle(transparent)).not.toContain('background-color');
    expect(transparent).toContain('<svg');

    await toggle.uncheck();
  });
});
