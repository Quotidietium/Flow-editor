import { expect, test } from './test';

// 括号配对着色 + 缩进/括号参考线：配置 JSON 嵌套一深就靠数括号。
// Monaco 把配对着色实现为 token span 上的 bracket-highlighting-N 类。
test.describe('编辑器括号配对着色', () => {
  test('配置 JSON 的嵌套括号带着色类渲染', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await editPage.clearEditor();
    // 两层嵌套：内层括号应获得 bracket-highlighting-2 类（外层为 1）
    await editPage.typeInEditor('{\n  "flowchart": {\n    "nodeSpacing": 25\n  }\n}');
    const colored = page.locator('.monaco-editor [class*="bracket-highlighting-"]');
    await expect(colored.first()).toBeVisible();
    expect(await colored.count()).toBeGreaterThanOrEqual(2);
  });
});
