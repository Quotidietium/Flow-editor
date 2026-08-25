import { expect, test, type Page } from '@playwright/test';

// Board editor (journey / gantt / timeline / kanban / cynefin): grouped-list
// kinds edit as columns + cards instead of the free canvas.
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

const enterVisual = async (page: Page): Promise<ReturnType<Page['getByTestId']>> => {
  await page.getByTestId('visual-tab').click();
  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toBeVisible();
  return codeOut;
};

test('kanban board drags cards between columns and reorders within one', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'kanban\ntodo[待办]\n  t1[甲]\n  t2[乙]\ndone[完成]\n  t3[丙]');
  const codeOut = await enterVisual(page);

  const board = page.getByTestId('visual-board');
  await expect(board).toBeVisible();
  // The free canvas is gone for board kinds.
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
  await expect(board.getByLabel('列表名称')).toHaveCount(2);
  await expect(board.getByTestId('visual-board-card')).toHaveCount(3);

  // Drag 甲 from 待办 onto the 完成 column.
  await page.dragAndDrop('[data-card-id="t1"]', 'section[aria-label="完成"]');
  let text = (await codeOut.textContent()) ?? '';
  const doneIdx = text.indexOf('完成');
  expect(text.indexOf('甲')).toBeGreaterThan(doneIdx);

  // Drag 丙 above 甲 inside 完成 (drop on a card inserts before it).
  await page.dragAndDrop('[data-card-id="t3"]', '[data-card-id="t1"]');
  text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('丙')).toBeLessThan(text.indexOf('甲'));
  expect(pageErrors).toEqual([]);
});

test('kanban card duplicates next to the original with autofocus', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'kanban\ntodo[待办]\n  t1[甲]\n  t2[乙]');
  const codeOut = await enterVisual(page);
  const board = page.getByTestId('visual-board');

  await expect(board.getByTestId('visual-board-card')).toHaveCount(2);
  await page.locator('[data-card-id="t1"]').getByTitle('复制卡片（紧邻原位插入）').click();

  // 拷贝紧跟原卡、同列（边序=卡序），名称输入自动聚焦立即可改名
  await expect(board.getByTestId('visual-board-card')).toHaveCount(3);
  await expect(
    page.locator('section[aria-label="待办"]').getByTestId('visual-board-card')
  ).toHaveCount(3);
  const text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('甲')).toBeLessThan(text.lastIndexOf('甲'));
  expect(text.indexOf('乙')).toBeGreaterThan(text.lastIndexOf('甲'));
  await expect(board.locator('input[aria-label="卡片名称"]:focus')).toHaveValue('甲');

  // 改名拷贝不回染原卡
  await board.locator('input[aria-label="卡片名称"]:focus').fill('甲改');
  await board.locator('input[aria-label="卡片名称"]:focus').blur();
  await expect(codeOut).toContainText('甲改');
  const after = (await codeOut.textContent()) ?? '';
  expect(after).toContain('甲]');
});

test('kanban board filters cards by label/detail without touching data', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'kanban\ntodo[待办]\n  t1[甲]\n  t2[乙]\ndone[完成]\n  t3[丙]');
  const codeOut = await enterVisual(page);
  const board = page.getByTestId('visual-board');

  // 过滤「甲」：只剩一张，计数提示出现；列结构保留（完成列 0 张仍在）
  const search = board.getByTestId('visual-board-search');
  await search.fill('甲');
  await expect(board.getByTestId('visual-board-card')).toHaveCount(1);
  await expect(board.getByTestId('visual-board-search-count')).toHaveText('1 张匹配');
  await expect(page.locator('section[aria-label="完成"]')).toBeVisible();

  // 只过滤显示不动数据：代码全文不变
  const text = (await codeOut.textContent()) ?? '';
  expect(text).toContain('乙');
  expect(text).toContain('丙');

  // Esc 清空：全部回来
  await search.press('Escape');
  await expect(board.getByTestId('visual-board-card')).toHaveCount(3);
  await expect(board.getByTestId('visual-board-search-count')).toHaveCount(0);
});

test('journey board adds tasks with scores and renames sections inline', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'journey\n  title 我的一天\n  section 上班\n    泡茶: 5: 我');
  const codeOut = await enterVisual(page);
  const board = page.getByTestId('visual-board');
  await expect(board).toBeVisible();

  // Add a task to the section; name and score edit inline.
  await board.getByTestId('visual-board-add-card').first().click();
  const nameInput = board.getByLabel('任务名称').last();
  await nameInput.fill('遛狗');
  await nameInput.blur();
  const detailInput = board.getByLabel('任务详情').last();
  await detailInput.fill('3: 我');
  await detailInput.blur();
  await expect(codeOut).toContainText('遛狗: 3: 我');

  // Rename the section.
  const sectionInput = board.getByLabel('分组名称');
  await sectionInput.fill('早晨');
  await sectionInput.blur();
  await expect(codeOut).toContainText('section 早晨');

  // Add a second section via the trailing add-column button.
  await board.getByTestId('visual-board-add-column').click();
  await expect(board.getByLabel('分组名称')).toHaveCount(2);
  await expect(codeOut).toContainText('section 分组');

  // The journey still renders after leaving visual mode.
  await page.getByTestId('visual-tab').click();
  await expect(page.locator('#container').getByText('遛狗', { exact: true }).first()).toBeVisible();
});

test('cynefin board keeps fixed domains and edits transitions', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'cynefin-beta\n  complex\n    "试点"\n  clear\n    "手册"');
  const codeOut = await enterVisual(page);
  const board = page.getByTestId('visual-board');
  await expect(board).toBeVisible();

  // Fixed domains: no add/remove column buttons.
  await expect(board.getByTestId('visual-board-add-column')).toHaveCount(0);
  await expect(board.getByLabel('复杂域')).toBeVisible();
  await expect(board.getByLabel('清晰域')).toBeVisible();

  // Add a transition from 复杂域 to 清晰域.
  const complex = board.locator('section[aria-label="复杂域"]');
  await complex.getByLabel('转换目标域').selectOption({ label: '清晰域' });
  await complex.getByLabel('转换说明').fill('沉淀');
  await complex.getByRole('button', { name: '添加', exact: true }).click();
  await expect(codeOut).toContainText('complex --> clear : "沉淀"');

  // Cards keep working on the fixed columns.
  await complex.getByTestId('visual-board-add-card').click();
  const input = board.getByLabel('条目名称').last();
  await input.fill('复盘');
  await input.blur();
  await expect(codeOut).toContainText('"复盘"');
});
