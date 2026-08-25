import { expect, test } from './test';

// 状态栏左侧的图类型标识：与历史徽章/示例类目高亮同源的 detectDiagramKind，
// 代码模式实时跟随，配置模式不显示。
test.describe('编辑器状态栏图类型', () => {
  test('随代码切换图类型，配置模式隐藏', async ({ page, editPage }) => {
    const kind = page.getByTestId('editor-kind');
    // 默认图是流程图
    await expect(kind).toHaveText('流程图');

    // 改写成时序图：标识实时跟随
    await editPage.clearEditor();
    await editPage.typeInEditor('sequenceDiagram\n  A->>B: 你好');
    await expect(kind).toHaveText('时序图');

    // 配置模式无图可识别：标识隐藏（行列统计仍在）
    await editPage.setEditorMode('配置');
    await expect(kind).toHaveCount(0);
    await expect(page.getByTestId('editor-status')).toContainText('共');
    await editPage.setEditorMode('代码');
    await expect(kind).toHaveText('时序图');
  });
});
