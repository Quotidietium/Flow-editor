import type { Page } from '@playwright/test';
import { expect, test } from './test';

// 单行超长代码：换行开关的判别性样本（关 = 1 个 .view-line，开 = 多个）。
const LONG_CODE = `flowchart TD\n  A[${'很长的节点标签'.repeat(40)}]`;

const pasteCode = async (page: Page, code: string, marker: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(marker);
};

const viewLineCount = async (page: Page): Promise<number> =>
  page.locator('.monaco-editor .view-line').count();

// 冷启动 dev server 的依赖预优化整页刷新会落在首个测试的交互窗口内
// （吃掉切换与偏好落盘之间的间隙）。先显式 reload 一次把冷刷新耗尽，
// 之后的交互与断言都跑在稳定的暖页面上。
const warmUp = async (page: Page): Promise<void> => {
  await page.reload();
  await expect(page.locator('.monaco-editor')).toBeVisible();
};

test.describe('编辑器自动换行', () => {
  test('切换即改变长行折行', async ({ page }) => {
    await page.goto('/edit');
    await warmUp(page);
    const wrapToggle = page.getByTestId('editor-word-wrap');
    await expect(wrapToggle).toBeVisible();
    await expect(wrapToggle).not.toHaveAttribute('data-state', 'on');

    await pasteCode(page, LONG_CODE, '很长的节点标签');
    const wrappedOff = await viewLineCount(page);

    await wrapToggle.click();
    await expect(wrapToggle).toHaveAttribute('data-state', 'on');
    // 折行后同一逻辑行占多个 .view-line
    await expect
      .poll(async () => viewLineCount(page), {
        message: 'word wrap should split the long line into multiple view lines'
      })
      .toBeGreaterThan(wrappedOff);

    // 关闭即还原
    await wrapToggle.click();
    await expect(wrapToggle).not.toHaveAttribute('data-state', 'on');
    await expect.poll(async () => viewLineCount(page)).toBe(wrappedOff);
    // 偏好已落盘（持久化本身由下一个用例从冷启动验证）
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('editorWordWrap')))
      .toBe('false');
  });

  test('偏好跨会话保持：预置 localStorage 后冷启动即折行', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('editorWordWrap', 'true');
    });
    await page.goto('/edit');
    await warmUp(page);

    const wrapToggle = page.getByTestId('editor-word-wrap');
    await expect(wrapToggle).toHaveAttribute('data-state', 'on');

    await pasteCode(page, LONG_CODE, '很长的节点标签');
    await expect.poll(async () => viewLineCount(page)).toBeGreaterThan(2);
  });

  test('配置模式同享换行开关', async ({ page, editPage }) => {
    await warmUp(page);
    await editPage.setEditorMode('配置');
    await pasteCode(page, `{"theme":"default","note":"${'很长的注释'.repeat(50)}"}`, '很长的注释');
    const before = await viewLineCount(page);
    await page.getByTestId('editor-word-wrap').click();
    await expect.poll(async () => viewLineCount(page)).toBeGreaterThan(before);
  });
});
