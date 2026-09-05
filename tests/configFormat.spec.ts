import { expect, test } from './test';

// 配置 JSON 一键格式化（循环 130 直达钮；循环 131 勘误收敛）：模板菜单
// 里本就有「格式化 JSON」（formatConfigJson）——本钮是直达入口，逻辑与
// 文案同源。压缩/混乱 JSON 展开为 2 空格缩进；解析失败不改动内容。
test.describe('配置 JSON 一键格式化', () => {
  test('压缩单行 JSON 展开为缩进结构', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await editPage.editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      '{"theme":"dark","flowchart":{"curve":"basis"}}'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('"theme":"dark"');

    await page.getByTestId('editor-format-config').click();
    await expect(page.getByText('已格式化配置 JSON')).toBeVisible();
    // 展开为 2 空格缩进的键值（含冒号后空格）
    await expect(editPage.editor).toContainText('"theme": "dark"');
    await expect(editPage.editor).toContainText('"curve": "basis"');
    await expect(page.getByTestId('error-container')).toHaveCount(0);
  });

  test('JSON 语法错误时格式化拒绝并保留原文（与模板菜单同文案）', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('{ broken');

    await page.getByTestId('editor-format-config').click();
    await expect(page.getByText('当前配置 JSON 无法解析，无法格式化')).toBeVisible();
    await expect(editPage.editor).toContainText('{ broken');
  });
});
