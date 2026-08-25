import { expect, test } from './test';

test.describe('编辑器状态栏', () => {
  test('显示光标行列与总行数，随交互更新', async ({ page, editPage }) => {
    const status = page.getByTestId('editor-status');
    await expect(status).toBeVisible();
    // 默认图 7 行（含尾换行）；初始光标随状态同步落在文档尾
    await expect(status).toContainText(/行 \d+，列 \d+/);
    await expect(status).toContainText('共 7 行');

    // 点到第 2 行：状态行更新
    await page.locator('.monaco-editor .view-lines > div:nth-child(2)').first().click();
    await expect(status).toContainText('行 2，');

    // 末尾追加一行：总行数 7 → 8
    await editPage.typeInEditor('\n  G[新节点]');
    await expect(status).toContainText('共 8 行');

    // 「定位到错误行」联动：制造错误后光标跳转到错误行
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('语法错误');
    await page.getByTestId('error-reveal').click();
    await expect(status).toContainText('行 2，', { timeout: 10_000 });
  });
});
