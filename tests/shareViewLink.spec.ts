import { expect, test } from './test';

// Share 对话框只读链接：接收者免被编辑器界面淹没（/view 页自带回链，
// 但正向入口此前缺失）。
test.describe('Share 只读链接', () => {
  test('只读链接指向 /view 且携带当前态，可复制', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/edit');
    await page.waitForURL(/#pako:/);

    await page.getByRole('button', { name: '分享' }).click();
    const viewInput = page.getByTestId('share-view-link');
    await expect(viewInput).toBeVisible();
    const value = await viewInput.inputValue();
    expect(value).toContain('/view#pako:');

    // 复制按钮入剪贴板（CopyInput 内与输入框同级的按钮）
    await page.getByTestId('share-view-link').locator('xpath=following-sibling::button[1]').click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('/view#pako:');
  });

  test('链接长度读数：短图无警告，超大图给截断建议', async ({ page }) => {
    await page.goto('/edit');
    await page.waitForURL(/#pako:/);

    // 默认小图：有读数、无截断警告
    await page.getByRole('button', { name: '分享' }).click();
    const lengthRow = page.getByTestId('share-link-length');
    await expect(lengthRow).toBeVisible();
    await expect(lengthRow).toContainText('链接长度');
    await expect(lengthRow).not.toContainText('截断');
    // 读数与真实链接长度一致
    const realLen = await page.evaluate(
      () => (window.location.origin + '/view' + window.location.hash).length
    );
    await expect(lengthRow).toContainText(`${realLen} 字符`);
    await page.keyboard.press('Escape');

    // 超大图（随机标签防压缩）：链接过 8000 → 警告出现
    const editor = page.locator('.monaco-editor');
    await editor.click();
    const bigCode = await page.evaluate(() => {
      const rand = () => Math.random().toString(36).slice(2, 26);
      const lines = ['graph TD'];
      for (let i = 0; i < 400; i++) {
        lines.push(`  N${i}["${rand()}"] --> N${i + 1}["${rand()}"]`);
      }
      return lines.join('\n');
    });
    await page.evaluate((c) => navigator.clipboard.writeText(c), bigCode);
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect
      .poll(async () =>
        page.evaluate(() => (window.location.origin + '/view' + window.location.hash).length)
      )
      .toBeGreaterThan(8000);

    await page.getByRole('button', { name: '分享' }).click();
    await expect(lengthRow).toContainText('截断');
    await expect(lengthRow).toContainText('导出 PNG/SVG 或 .mmd');
  });
});
