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
});
