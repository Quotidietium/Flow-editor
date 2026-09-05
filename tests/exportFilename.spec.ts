import { expect, test } from './test';

// 导出文件名自定义（循环 134）：非空基础名贯穿图像与文档导出（自动附
// 时间戳防同名覆盖），偏好跨刷新保持；留空回退默认时间戳名。
test.describe('导出文件名自定义', () => {
  test('自定义名贯穿 PNG 与 .mmd 导出（同会话连发）', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    await page.getByTestId('export-filename').fill('my-arch');

    const downloadPng = page.waitForEvent('download');
    await editPage.openExportMenu();
    await page.getByTestId('download-PNG').click();
    const pngName = (await downloadPng).suggestedFilename();
    expect(pngName).toMatch(/^my-arch-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
    // 导出成功 toast 带产物文件名（诚实反馈，循环 137）
    await expect(page.getByText(`已导出 ${pngName}`)).toBeVisible();

    // 文档类导出同走自定义名
    const downloadMmd = page.waitForEvent('download');
    await page.getByTestId('save-mmd').click();
    const mmdName = (await downloadMmd).suggestedFilename();
    expect(mmdName).toMatch(/^my-arch-\d{4}-\d{2}-\d{2}-\d{6}\.mmd$/);
    await expect(page.getByText(`已导出 ${mmdName}`)).toBeVisible();
  });

  test('图片文件导入被明确拒绝（循环 137）', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('open-file').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47])
    });

    await expect(
      page.getByText('图片文件无法导入（支持 .mmd/.md/.json/.zip 或分享链接）')
    ).toBeVisible();
    // 编辑器内容不受影响（默认图仍在）
    await editPage.checkInEditor('圣诞节');
  });

  test('偏好跨刷新保持', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    await page.getByTestId('export-filename').fill('my-arch');
    await page.reload();

    // 输入框值 + storage 双重证据（writeJSON 存 JSON 编码值）
    await page.waitForTimeout(500);
    await editPage.ensureActionsOpen();
    await expect(page.getByTestId('export-filename')).toHaveValue('my-arch');
    await expect(
      page.evaluate(() => JSON.parse(localStorage.getItem('exportFileName') ?? '""'))
    ).resolves.toBe('my-arch');
  });

  test('非法字符消毒；留空回退默认时间戳名', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();
    await page.getByTestId('export-filename').fill('a/b:c');

    const downloadPng = page.waitForEvent('download');
    await editPage.openExportMenu();
    await page.getByTestId('download-PNG').click();
    const name = (await downloadPng).suggestedFilename();
    expect(name).toMatch(/^a-b-c-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);

    // 留空 → 默认 mermaid-diagram- 前缀
    await page.getByTestId('export-filename').fill('');
    const downloadDefault = page.waitForEvent('download');
    await editPage.openExportMenu();
    await page.getByTestId('download-PNG').click();
    expect((await downloadDefault).suggestedFilename()).toMatch(
      /^mermaid-diagram-\d{4}-\d{2}-\d{2}-\d{6}\.png$/
    );
  });
});
