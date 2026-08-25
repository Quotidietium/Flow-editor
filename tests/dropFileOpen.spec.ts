import { expect, test } from './test';

// 拖拽 .mmd/.json 文件进工作区直接打开：与「打开」按钮同走
// loadFileIntoEditor（插件导入钩子优先、输入管道、配置安全门）。
test.describe('拖拽文件打开', () => {
  const dropFile = (page: import('@playwright/test').Page, name: string, content: string) =>
    page.evaluate(
      ({ content: text, name: fileName }) => {
        const dt = new DataTransfer();
        dt.items.add(new File([text], fileName, { type: 'text/plain' }));
        const target = document.querySelector('[data-testid="edit-workspace"]') as HTMLElement;
        target.dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
        );
      },
      { content, name }
    );

  test('.mmd 拖入即载入并渲染', async ({ page }) => {
    await page.goto('/edit');
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    await dropFile(page, 'dropped.mmd', 'flowchart TD\n  A[拖入的节点]');
    await expect(page.locator('.monaco-editor')).toContainText('拖入的节点');
    await expect(page.locator('#container')).toContainText('拖入的节点');
    await expect(page.getByText('已载入「dropped.mmd」')).toBeVisible();
  });

  test('.json 状态文件拖入：代码与配置一起恢复', async ({ page }) => {
    await page.goto('/edit');
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    const state = JSON.stringify({
      code: 'flowchart LR\n  S[状态文件] --> T[拖入恢复]',
      mermaid: '{\n  "theme": "forest"\n}'
    });
    await dropFile(page, 'state.json', state);
    await expect(page.locator('.monaco-editor')).toContainText('状态文件');
    // 配置随状态恢复（forest 主题进了配置文档）
    await page.getByRole('tab', { name: '配置' }).click();
    await expect(page.locator('.monaco-editor')).toContainText('forest');
  });

  test('空文件拖入：提示无法识别且不动手头内容', async ({ page }) => {
    await page.goto('/edit');
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 非空文本本身就是合法代码候选（parseOpenedFile 按 mermaid 源码收下），
    // 只有空内容才落进「无法识别」——这正是该分支的语义边界。
    await dropFile(page, 'empty.mmd', '');
    await expect(page.getByText('无法识别文件「empty.mmd」的内容')).toBeVisible();
    await expect(page.locator('#container')).toContainText('圣诞节');
  });
});
