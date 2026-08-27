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
});
