import { expect, test, type Page } from '@playwright/test';

// Git editor: gitGraph edits as an ordered operation list (commit/merge rows).
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

test('git editor regenerates branch/checkout when a commit changes branch', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'gitGraph\n  commit id: "a1"\n  commit id: "a2"');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-git');

  // Move the second commit onto a new branch: the replay emits `branch dev`.
  const second = editor.locator('[data-operation-id="C2"]');
  await second.getByLabel('所在分支').fill('dev');
  await second.getByLabel('所在分支').blur();
  await expect(codeOut).toContainText('branch dev');
  await expect(codeOut).toContainText('commit id: "a2"');

  // With two branches present the merge button enables; the new merge lands
  // on the last active branch (dev) and defaults its source to the other one.
  await editor.getByTestId('visual-git-add-merge').click();
  const mergeRow = editor.locator('[data-operation-id="N3"]');
  await expect(mergeRow.getByLabel('所在分支')).toHaveValue('dev');
  await expect(mergeRow.getByLabel('合并来源')).toHaveValue('main');
  await expect(codeOut).toContainText('merge main');

  // Reorder: node order = replay order, so the merge can move above a2.
  await mergeRow.getByTitle('上移').click();
  const text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('merge main')).toBeLessThan(text.indexOf('commit id: "a2"'));
  expect(pageErrors).toEqual([]);
});

test('git editor edits tags and removes operations', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'gitGraph\n  commit id: "a1" tag: "v1"\n  commit id: "a2"');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-git');

  const first = editor.locator('[data-operation-id="C1"]');
  await expect(first.getByLabel('标签')).toHaveValue('v1');
  await first.getByLabel('标签').fill('v2');
  await first.getByLabel('标签').blur();
  await expect(codeOut).toContainText('tag: "v2"');

  await editor.locator('[data-operation-id="C2"]').getByTitle('删除').click();
  await expect(codeOut).not.toContainText('a2');
});
