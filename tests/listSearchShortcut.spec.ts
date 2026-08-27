import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { height: 1080, width: 1920 } });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

const typeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(code.split('\n')[0]?.trim() ?? '');
};

// Ctrl+F 在列表视图聚焦当前视图的搜索框（循环 122：画布之外的四种
// 专用编辑器同享该快捷键）。
test('board/outline views focus their search on Ctrl+F', async ({ page }) => {
  // 看板
  await openEditor(page);
  await typeCode(page, 'kanban\ntodo[待办]\n  t1[甲]');
  await page.getByTestId('visual-tab').click();
  await page.keyboard.press('Control+f');
  const boardSearch = page.getByTestId('visual-board-search');
  await expect(boardSearch).toBeFocused();
  await page.keyboard.type('甲');
  await expect(page.getByTestId('visual-board-search-count')).toHaveText('1 张匹配');

  // 大纲（退出可视化改代码——可视化模式下 Ctrl+A 被画布全选拦截，Monaco 收不到）
  await page.getByTestId('visual-tab').click();
  await typeCode(page, 'mindmap\n  根\n    甲');
  await page.getByTestId('visual-tab').click();
  await page.keyboard.press('Control+f');
  const outlineSearch = page.getByTestId('visual-outline-search');
  await expect(outlineSearch).toBeFocused();
  await page.keyboard.type('甲');
  await expect(page.getByTestId('visual-outline-search-count')).toHaveText('1 行匹配');
});
