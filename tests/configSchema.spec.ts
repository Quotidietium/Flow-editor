import { expect, test } from './test';

// 配置 JSON 的 Monaco schema 补全：敲键名/枚举值即出提示（离线手工 schema，
// 只做提示不做封锁）。suggest-widget 是 Monaco 的原生补全弹层。
test.describe('配置 JSON 智能提示', () => {
  test('键名补全出 theme，枚举值补全出 dark', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await editPage.clearEditor();

    // 键名补全：敲 "th → 建议含 theme / themeVariables
    await editPage.typeInEditor('{\n  "th');
    const suggest = page.locator('.monaco-editor .suggest-widget.visible');
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText('theme');

    // 接受 theme 后敲枚举位置：建议含 dark / forest
    await page.keyboard.press('Escape');
    await editPage.clearEditor();
    await editPage.typeInEditor('{\n  "theme": "d');
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText('dark');
    await page.keyboard.press('Escape');

    // 代码页（mermaid 模型）不受 schema 影响：无 JSON 补全弹层骚扰
    await editPage.setEditorMode('代码');
    await expect(page.getByTestId('editor-kind')).toHaveText('流程图');
  });
});
