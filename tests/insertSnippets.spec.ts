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
});
