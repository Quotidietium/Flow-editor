import { expect, test, type Page } from '@playwright/test';

// Sheet editor (pie / packet / radar / xychart / venn / eventmodeling /
// railroad): record-list kinds edit as table rows instead of the free canvas.
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

test('pie sheet adds, reorders and deletes slices', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85');
  const codeOut = await enterVisual(page);
  const sheet = page.getByTestId('visual-sheet');
  await expect(sheet).toBeVisible();

  // Add a slice; the new row is autofocused (id minted as N3 after S1/S2).
  await sheet.getByTestId('visual-sheet-add-row').click();
  await page.keyboard.type('Birds');
  const newRow = sheet.locator('[data-row-id="N3"]');
  await newRow.getByLabel('切片名').blur();
  await newRow.getByLabel('数值').fill('12');
  await newRow.getByLabel('数值').blur();
  await expect(codeOut).toContainText('"Birds": 12');

  // Move Birds above Dogs.
  await newRow.getByTitle('上移').click();
  await newRow.getByTitle('上移').click();
  let text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('"Birds"')).toBeLessThan(text.indexOf('"Dogs"'));

  // Delete Cats.
  await sheet.locator('[data-row-id="S2"]').getByTitle('删除').click();
  text = (await codeOut.textContent()) ?? '';
  expect(text).not.toContain('"Cats"');
  expect(pageErrors).toEqual([]);
});

test('radar sheet edits axes and curves in separate sections', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'radar-beta\n  axis a["Art"], b["Blog"]\n  curve c["Alice"]{1, 2}\n  max 5');
  const codeOut = await enterVisual(page);
  const sheet = page.getByTestId('visual-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-row-id]')).toHaveCount(3);

  // Add an axis and a curve; curve values edit as a comma list.
  await sheet.getByTestId('visual-sheet-add-row').first().click();
  const axisRow = sheet.locator('li', { has: page.getByLabel('维度名') }).last();
  await axisRow.getByLabel('维度名').fill('Code');
  await axisRow.getByLabel('维度名').blur();
  await expect(codeOut).toContainText('"Code"');

  await sheet.getByTestId('visual-sheet-add-row').last().click();
  const curveRow = sheet.locator('li', { has: page.getByLabel('曲线名') }).last();
  await curveRow.getByLabel('曲线名').fill('Bob');
  await curveRow.getByLabel('曲线名').blur();
  await curveRow.getByLabel('数值').fill('3, 4, 5');
  await curveRow.getByLabel('数值').blur();
  await expect(codeOut).toContainText('"Bob"]{3, 4, 5}');
});

test('eventmodeling sheet switches element types via select', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'eventmodeling\n  tf S1 ui Screen\n  tf C1 cmd Do-It');
  const codeOut = await enterVisual(page);
  const sheet = page.getByTestId('visual-sheet');
  await expect(sheet).toBeVisible();

  const row = sheet.locator('[data-row-id="C1"]');
  await row.getByLabel('类型').selectOption('evt');
  await expect(codeOut).toContainText('tf C1 evt Do-It');

  // A read-model row can declare its target event inline.
  await row.getByLabel('类型').selectOption('rmo');
  await row.getByLabel('链接目标').fill('S1');
  await row.getByLabel('链接目标').blur();
  await expect(codeOut).toContainText('tf C1 rmo Do-It ->> S1');
});
