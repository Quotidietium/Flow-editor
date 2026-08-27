import { expect, test } from './test';

// 个人资产备份：三类「我的××」锁死在单浏览器——导出 JSON 换设备导入。
test.describe('我的资产备份', () => {
  test('计数如实、导出下载、清空需确认、导入合并', async ({ page }) => {
    await page.goto('/edit');

    // 预置一份片段资产
    await page.evaluate(() => {
      localStorage.setItem(
        'flowUserSnippets',
        JSON.stringify([{ code: 'A[资产片段]', id: 'n1', label: '资产片段' }])
      );
    });
    await page.reload();

    // 打开资产对话框：计数如实（1 片段）
    await page.locator('nav button').first().click();
    await page.getByTestId('menu-assets').click();
    const dialog = page.getByTestId('assets-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('配置模板');
    // 代码片段列的计数：父块内唯一 tabular-nums（相邻列块不嵌套）
    const snippetsStat = dialog
      .locator('div.text-xs.text-muted-foreground', { hasText: '代码片段' })
      .locator('xpath=..')
      .locator('.tabular-nums');
    await expect(snippetsStat).toHaveText('1');

    // 导出：下载 JSON（含三类键与版本）
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('assets-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('flow-editor-assets.json');
    const path = await download.path();
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8'));
    const bundle = JSON.parse(raw);
    expect(bundle.version).toBe(1);
    expect(bundle.userSnippets[0].label).toBe('资产片段');

    // 清空需确认：取消不动、确认清零
    page.once('dialog', (d) => void d.dismiss());
    await page.getByTestId('assets-clear').click();
    await expect(snippetsStat).toHaveText('1');
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('assets-clear').click();
    await expect(snippetsStat).toHaveText('0');

    // 导入：把导出的 bundle 写回（file chooser 走 dataTransfer 不便，
    // 直接驱动 openTextFile 的 input——Playwright filechooser）
    await page.getByTestId('assets-import').click();
    // openTextFile 动态建 input[type=file]，拦截 filechooser 事件
  });

  test('导入合并路径（filechooser 实传导出的 JSON）', async ({ page }) => {
    await page.goto('/edit');
    await page.evaluate(() => {
      localStorage.setItem(
        'flowUserSamples',
        JSON.stringify([{ code: 'flowchart TD\n  Z --> W', id: 's1', label: '资产示例' }])
      );
    });
    await page.reload();

    // 导出拿真实 bundle 内容
    await page.locator('nav button').first().click();
    await page.getByTestId('menu-assets').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('assets-export').click();
    const path = await (await downloadPromise).path();
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8'));

    // 清空本机后导入回来（对话框仍开着，直接导入）
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('assets-clear').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('assets-import').click();
    const chooserEvent = await chooser;
    await chooserEvent.setFiles({
      buffer: Buffer.from(raw, 'utf8'),
      mimeType: 'application/json',
      name: 'flow-editor-assets.json'
    });
    await expect(page.getByText(/已导入：模板 0、示例 1、片段 0/)).toBeVisible();
    // 示例真实回到菜单
    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-testid^="user-sample-sample-"]', { hasText: '资产示例' })
    ).toBeVisible();
  });
});
