import { TID } from '$/constants';
import type { Page } from '@playwright/test';
import { expect, test } from './test';

// 原子粘贴替换编辑器内容（逐字符键入会与 Monaco 状态同步竞态丢键，
// 与 visualEditor.spec.ts 同款做法）。
const replaceConfig = async (page: Page, text: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), text);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
};

const openPresetMenu = async (page: Page) => {
  await page.getByTestId(TID.configPresetMenu).click();
};

test.describe('配置模板', () => {
  test('模板按钮只在配置模式出现', async ({ page, editPage }) => {
    // 代码模式：无模板按钮
    await expect(page.getByTestId(TID.configPresetMenu)).toHaveCount(0);
    await editPage.setEditorMode('配置');
    await expect(page.getByTestId(TID.configPresetMenu)).toBeVisible();
    await editPage.setEditorMode('代码');
    await expect(page.getByTestId(TID.configPresetMenu)).toHaveCount(0);
  });

  test('一键合并模板且图表照常渲染', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"look": "handDrawn"');
    // 深合并保留既有键
    await expect(editor).toContainText('"theme": "default"');
    await editPage.setEditorMode('代码');
    await editPage.checkTextInView('圣诞节');
  });

  test('两个模板叠加深合并', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await page.getByTestId('config-preset-presentation').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"look": "handDrawn"');
    await expect(editor).toContainText('"fontSize": "20px"');
    // 主题键切换为覆盖语义
    await openPresetMenu(page);
    await page.getByTestId('config-preset-theme-forest').click();
    await expect(editor).toContainText('"theme": "forest"');
    await expect(editor).toContainText('"look": "handDrawn"');
  });

  test('JSON 损坏时不写入并提示，重置可恢复', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{ broken');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await expect(
      page.getByText('当前配置 JSON 无法解析，模板未应用', { exact: false })
    ).toBeVisible();
    // 内容保持原样，未被破坏
    await expect(page.locator('.monaco-editor')).toContainText('broken');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-reset').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"theme": "default"');
    await expect(editor).not.toContainText('broken');
  });

  test('格式化 JSON 一键整理缩进', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{"theme":"forest","look":"handDrawn"}');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-format').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"theme": "forest"');
    await expect(page.getByText('已格式化配置 JSON')).toBeVisible();
  });
});
