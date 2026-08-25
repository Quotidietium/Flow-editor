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

  test('菜单对当前生效模板打勾并随应用切换', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    // 默认配置 theme:default → 默认主题打勾，深色无勾
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-default')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-theme-dark')).toHaveCount(0);

    // 应用深色主题 → 勾选切换
    await page.getByTestId('config-preset-theme-dark').click();
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-theme-default')).toHaveCount(0);

    // 再叠手绘 → 两个都打勾（子集语义：各自叶子都在配置里）
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-hand-drawn')).toBeVisible();
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

  test('保存当前配置为我的模板，应用与删除', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    // 造一份自定义配置
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await page.getByTestId('config-preset-theme-forest').click();

    // 保存为我的模板
    await openPresetMenu(page);
    await page.getByTestId('config-preset-save').click();
    await page.getByTestId('config-preset-save-name').fill('森林手绘');
    await page.getByTestId('config-preset-save-name').press('Enter');
    await expect(page.getByText('已保存模板「森林手绘」')).toBeVisible();

    // 重置后从我的模板恢复两键合一
    await openPresetMenu(page);
    await page.getByTestId('config-preset-reset').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).not.toContainText('handDrawn');
    await openPresetMenu(page);
    await page.getByText('森林手绘', { exact: true }).click();
    await expect(editor).toContainText('"look": "handDrawn"');
    await expect(editor).toContainText('"theme": "forest"');

    // 删除我的模板
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserConfigPresets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await openPresetMenu(page);
    await page.getByTestId(`config-preset-delete-${stored}`).click();
    await expect(page.getByText('已删除模板「森林手绘」')).toBeVisible();
    await expect(page.getByText('森林手绘', { exact: true })).toHaveCount(0);
  });

  test('JSON 损坏时保存我的模板被拒绝', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{ broken');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-save').click();
    await page.getByTestId('config-preset-save-name').fill('坏模板');
    await page.getByTestId('config-preset-save-confirm').click();
    await expect(page.getByText('当前配置 JSON 无法解析，未保存')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('flowUserConfigPresets'));
    expect(stored ?? '[]').toBe('[]');
  });
});
