import { readFileSync } from 'node:fs';
import { expect, test } from './test';

// PNG 布局：8 字节签名 + 4 字节长度 + "IHDR" + 4 字节宽 + 4 字节高（大端）。
const pngSize = (path: string): { height: number; width: number } => {
  const buffer = readFileSync(path);
  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16)
  };
};

test.describe('导出倍数', () => {
  test('3x 导出的 PNG 像素尺寸为 1x 的三倍', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    await expect(page.getByTestId('export-scale-chips')).toBeVisible();
    // 默认 1x 选中
    await expect(page.getByTestId('export-scale-1')).toHaveClass(/border-primary/);

    const downloadPng = async (): Promise<string> => {
      const downloadPromise = page.waitForEvent('download');
      await editPage.openExportMenu();
      await page.getByTestId('download-PNG').click();
      const path = await (await downloadPromise).path();
      if (!path) throw new Error('download path missing');
      return path;
    };

    const size1 = pngSize(await downloadPng());
    expect(size1.width).toBeGreaterThan(100);

    await page.getByTestId('export-scale-3').click();
    await expect(page.getByTestId('export-scale-3')).toHaveClass(/border-primary/);
    const size3 = pngSize(await downloadPng());

    // 像素级判别：3x 双边恰为 1x 三倍（允许 ±1 的取整误差）
    expect(Math.abs(size3.width - size1.width * 3)).toBeLessThanOrEqual(1);
    expect(Math.abs(size3.height - size1.height * 3)).toBeLessThanOrEqual(1);
  });
});
