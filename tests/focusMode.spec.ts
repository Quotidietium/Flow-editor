import { type Page } from '@playwright/test';
import { expect, test } from './test';

const editorWidth = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelector('.monaco-editor')?.getBoundingClientRect().width ?? 0);

test.describe('专注模式与分隔条复位（循环 126）', () => {
  test('专注模式：编辑区收起、预览照常；退出后编辑区连同内容恢复', async ({ page, editPage }) => {
    const focusButton = page.getByTestId('focus-mode');
    await expect(focusButton).toHaveAttribute('title', '专注模式（预览占满工作区）');
    await focusButton.click();

    // 编辑区整体卸载（Monaco 消失），预览仍在并正常渲染
    await expect(page.locator('.monaco-editor')).toHaveCount(0);
    await expect(focusButton).toHaveAttribute('title', '退出专注模式（恢复编辑区）');
    await editPage.checkTextInView('圣诞节');

    await focusButton.click();
    // 恢复：Monaco 重新挂载并从状态网关取回代码
    await editPage.checkInEditor('圣诞节');
    await editPage.checkTextInView('圣诞节');
  });

  test('分隔条双击复位：键盘移动分隔条后双击回到初始宽度（悬停可见）', async ({ page }) => {
    // paneforge 分隔条（页面里 role=separator 有多处，用它的专有属性定位）
    const handle = page.locator('[data-pane-resizer]');
    await expect(handle).toHaveCount(1);

    const widthBefore = await editorWidth(page);
    await handle.focus();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    const widthMoved = await editorWidth(page);
    expect(widthMoved).not.toBe(widthBefore);

    await handle.dblclick();
    await expect
      .poll(async () => editorWidth(page), { timeout: 5000 })
      .toBeCloseTo(widthBefore, -1);
  });

  test('专注模式是会话级——刷新后自动恢复编辑区', async ({ page, editPage }) => {
    const focusButton = page.getByTestId('focus-mode');
    await focusButton.click();
    await expect(page.locator('.monaco-editor')).toHaveCount(0);

    await page.reload();
    await expect(focusButton).toHaveAttribute('title', '专注模式（预览占满工作区）');
    await editPage.checkInEditor('圣诞节');
  });
});
