import { expect, test, type Page } from '@playwright/test';

// Outline editor (mindmap / treeview / treemap / ishikawa / swimlane):
// indent-tree kinds edit as an outliner instead of the free canvas.
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

test('mindmap outline edits with Enter/Tab like an outliner', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'mindmap\n  根\n    甲\n    乙');
  const codeOut = await enterVisual(page);

  const outline = page.getByTestId('visual-outline');
  await expect(outline).toBeVisible();
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
  await expect(outline.locator('[data-row-id]')).toHaveCount(3);

  // Enter on 甲 adds a sibling right below it; type the label directly.
  const rowA = outline.locator('[data-row-id]').nth(1);
  await rowA.getByLabel('节点名称').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('甲二');
  // Tab flushes the label and indents the new row under 甲 in one step.
  await page.keyboard.press('Tab');
  const text = (await codeOut.textContent()) ?? '';
  expect(text).toMatch(/\(甲\)\n\s+\[甲二\]/);

  // Row buttons: delete 乙.
  await outline.locator('[data-row-id]').nth(3).getByTitle(/删除/).click();
  await expect(codeOut).not.toContainText('乙');
  expect(pageErrors).toEqual([]);
});

test('outline delete promotes children into the deleted slot', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'mindmap\n  根\n    甲\n      甲一\n    乙');
  const codeOut = await enterVisual(page);
  const outline = page.getByTestId('visual-outline');

  // Delete 甲: 甲一 promotes to root level in 甲's position.
  await outline.locator('[data-row-id]').nth(1).getByTitle(/删除/).click();
  const text = (await codeOut.textContent()) ?? '';
  expect(text).not.toContain('(甲)');
  expect(text).toContain('(甲一)');
  expect(text.indexOf('甲一')).toBeLessThan(text.indexOf('乙'));
});

test('treemap outline edits leaf values inline', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'treemap-beta\n  产品\n    甲: 10\n    乙: 20');
  const codeOut = await enterVisual(page);
  const outline = page.getByTestId('visual-outline');
  await expect(outline).toBeVisible();

  const rowA = outline.locator('[data-row-id]').nth(1);
  await rowA.getByLabel('数值').fill('42');
  await rowA.getByLabel('数值').blur();
  await expect(codeOut).toContainText('"甲": 42');
});
