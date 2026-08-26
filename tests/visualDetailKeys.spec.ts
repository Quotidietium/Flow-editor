import { expect, test, type Page } from '@playwright/test';

// 编辑内容（多行文本域）键盘路径：Enter 换行照旧，Ctrl+Enter 保存（IDE 惯例）。
const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

test.describe('编辑内容 Ctrl+Enter 保存', () => {
  test('文本域输入后 Ctrl+Enter 提交，普通 Enter 仍换行', async ({ page }) => {
    await openEditor(page);
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      'erDiagram\n  CUSTOMER ||--o{ ORDER : places'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await page.getByTestId('visual-tab').click();
    const codeOut = page.getByTestId('visual-code-out');
    await expect(codeOut).toBeVisible();

    // 选中 CUSTOMER 节点 → 编辑内容
    await page.locator('[data-node-id="CUSTOMER"]').click();
    await page.getByRole('button', { name: /编辑内容/ }).click();
    const textarea = page.getByTestId('visual-detail-editor');
    await expect(textarea).toBeVisible();

    // 普通 Enter 是换行（不触发保存）
    await textarea.fill('string name\nint age');
    await textarea.press('Enter');
    await expect(textarea).toBeVisible();

    // Ctrl+Enter 保存：对话框关闭、属性写回代码
    await textarea.press('Control+Enter');
    await expect(textarea).toHaveCount(0);
    await expect(codeOut).toContainText('string name');
    await expect(codeOut).toContainText('int age');
  });
});
