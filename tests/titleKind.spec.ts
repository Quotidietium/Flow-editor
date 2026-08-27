import { expect, test } from './test';

// 标签页标题跟随图类型：多标签开多张图时浏览器标签栏一眼区分。
test.describe('标签页标题跟随图类型', () => {
  test('默认流程图 → 改时序图随动，清空回落默认', async ({ page, editPage }) => {
    await page.goto('/edit');
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });
    await expect(page).toHaveTitle('流程图 - Flow 编辑器');

    // 改成时序图
    await editPage.clearEditor();
    await editPage.typeInEditor('sequenceDiagram\n  A->>B: 你好');
    await expect(page).toHaveTitle('时序图 - Flow 编辑器');

    // 清空（无法识别）回落默认标题
    await editPage.clearEditor();
    await expect(page).toHaveTitle('在线流程图与图表编辑器 - Flow 编辑器');
  });
});
