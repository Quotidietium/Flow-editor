import { expect, test } from './test';

test.describe('围栏粘贴剥离（循环 125）', () => {
  test('粘贴整段 mermaid 围栏自动剥离为裸代码，正常渲染', async ({ page, editPage }) => {
    await editPage.editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      '```mermaid\nflowchart TD\nA[围栏粘贴] --> B[直接渲染]\n```'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');

    // 围栏剥离为裸代码（无 ``` 残留），状态流接管、预览直接渲染
    await expect(page.getByText('已剥离 Markdown 代码围栏')).toBeVisible();
    await expect(editPage.editor).toContainText('flowchart TD');
    await expect(editPage.editor).not.toContainText('```');
    await editPage.checkTextInView('围栏粘贴');
    await expect(page.getByTestId('error-container')).toHaveCount(0);
  });

  test('其它语言围栏不剥离（原样保留，交给语法错误横幅）', async ({ page, editPage }) => {
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '```python\nprint("hello")\n```');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');

    await expect(editPage.editor).toContainText('```python');
    await expect(page.getByText('已剥离 Markdown 代码围栏')).toHaveCount(0);
  });
});
