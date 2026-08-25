import { expect, test } from './test';

test.describe('插入代码片段', () => {
  test('代码模式有插入菜单，配置模式没有', async ({ page, editPage }) => {
    await expect(page.getByTestId('insert-snippet-menu')).toBeVisible();
    await editPage.setEditorMode('配置');
    await expect(page.getByTestId('insert-snippet-menu')).toHaveCount(0);
    // 配置模式是模板按钮（循环1）
    await expect(page.getByTestId('config-preset-menu')).toBeVisible();
    await editPage.setEditorMode('代码');
    await expect(page.getByTestId('insert-snippet-menu')).toBeVisible();
  });

  test('片段插入光标处且不破坏既有内容', async ({ page, editPage }) => {
    // 输入基础代码，光标停在行尾
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');

    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-node').click();

    // 片段落在光标处
    await expect(editPage.editor).toContainText('A[标签]');
    // 既有内容保持
    await expect(editPage.editor).toContainText('flowchart TD');
    // 生成的是合法图：预览渲染出插入的节点
    await editPage.checkTextInView('标签');

    // 继续插入带标签连线骨架
    await editPage.typeInEditor('\n  ', { bottom: false });
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-edge-label').click();
    await expect(editPage.editor).toContainText('-->|标签|');
  });

  test('子图骨架多行插入', async ({ page, editPage }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-subgraph').click();
    await expect(editPage.editor).toContainText('subgraph 分组');
    await expect(editPage.editor).toContainText('end');
    await editPage.checkTextInView('分组');
  });

  test('我的片段：保存当前代码、光标处插回、删除', async ({ page, editPage }) => {
    // 造一段可辨识的代码
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  Alpha --> Beta');

    // 保存为我的片段
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('user-snippet-save').click();
    await page.getByTestId('user-snippet-save-name').fill('双节点骨架');
    await page.getByTestId('user-snippet-save-name').press('Enter');
    await expect(page.getByText('已保存片段「双节点骨架」')).toBeVisible();

    // 清空文档后从菜单插回（光标处，不弹整图替换）
    await editPage.clearEditor();
    await page.getByTestId('insert-snippet-menu').click();
    const item = page.locator('[data-testid^="user-snippet-snippet-"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('双节点骨架');
    // 预览行展示首行压缩文本
    await expect(item).toContainText('flowchart TD');
    await item.click();
    await expect(editPage.editor).toContainText('Alpha --> Beta');
    await editPage.checkTextInView('Alpha');

    // 刷新后仍在（持久化），随后删除
    await page.reload();
    await page.getByTestId('insert-snippet-menu').click();
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserSnippets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await page.getByTestId(`user-snippet-delete-${stored}`).click();
    await expect(page.getByText('已删除片段「双节点骨架」')).toBeVisible();
    await expect(page.locator('[data-testid^="user-snippet-snippet-"]')).toHaveCount(0);
  });
});
