import { expect, test, type Page } from '@playwright/test';

// Retained-canvas kinds (state / er / class / c4 / architecture / sankey /
// requirement / block / quadrant / wardley) keep the free canvas because
// their semantics ARE node-link or coordinate — these tests pin their core
// editing loops so "kept the canvas" is evidence, not just an argument.
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

const nodeBox = async (
  page: Page,
  id: string
): Promise<{ height: number; width: number; x: number; y: number }> => {
  const box = await page.locator(`[data-node-id="${id}"]`).boundingBox();
  if (!box) {
    throw new Error(`node ${id} missing`);
  }
  return box;
};

const center = (box: { height: number; width: number; x: number; y: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2
});

/** Screen center of the selected node's bottom link handle (crosshair circle). */
const bottomHandle = async (page: Page): Promise<{ x: number; y: number }> => {
  const handles = page.locator('circle[style*="crosshair"]');
  await expect(handles).toHaveCount(4);
  let best: { x: number; y: number } | undefined;
  let bestY = -1;
  for (const handle of await handles.all()) {
    const cy = Number(await handle.getAttribute('cy'));
    if (cy > bestY) {
      bestY = cy;
      const box = await handle.boundingBox();
      if (box) {
        best = center(box);
      }
    }
  }
  if (!best) {
    throw new Error('handle missing');
  }
  return best;
};

test('state diagram canvas: start/end dots, label edit, transition to [*]', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'stateDiagram-v2\n  [*] --> S1\n  S1 --> S2: 事件');
  const codeOut = await enterVisual(page);

  // The canvas stays for state diagrams (node-link semantics).
  await expect(page.getByTestId('visual-canvas')).toBeVisible();
  await expect(page.locator('[data-node-id="__start__"]')).toBeVisible();
  await expect(codeOut).toContainText('[*] --> S1');

  // Inline label edit rewrites the state declaration.
  const s1 = center(await nodeBox(page, 'S1'));
  await page.mouse.dblclick(s1.x, s1.y);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('待机');
  await page.keyboard.press('Enter');
  await expect(codeOut).toContainText('state "待机" as S1');

  // Add the end pseudo node from the toolbar, then connect S2 → [*]. The end
  // dot spawns at a fixed spot that can overlap an auto-laid-out node — drag
  // it aside first so the link target is unambiguous.
  await page.getByRole('button', { name: '终点' }).click();
  await expect(page.locator('[data-node-id="__end__"]')).toBeVisible();
  const end0 = center(await nodeBox(page, '__end__'));
  await page.mouse.move(end0.x, end0.y);
  await page.mouse.down();
  await page.mouse.move(end0.x + 360, end0.y, { steps: 6 });
  await page.mouse.up();
  const s2 = center(await nodeBox(page, 'S2'));
  await page.mouse.click(s2.x, s2.y);
  const handle = await bottomHandle(page);
  const end = center(await nodeBox(page, '__end__'));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(codeOut).toContainText('S2 --> [*]');
  expect(pageErrors).toEqual([]);
});

test('er diagram canvas: cardinality cycling, new entity, relation drag', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(page, 'erDiagram\n  A ||--o{ B : has');
  const codeOut = await enterVisual(page);
  await expect(page.getByTestId('visual-canvas')).toBeVisible();
  await expect(codeOut).toContainText('A ||--o{ B : has');

  // Select the relation by clicking its midpoint, then cycle the crow's foot.
  const a0 = center(await nodeBox(page, 'A'));
  const b0 = center(await nodeBox(page, 'B'));
  await page.mouse.click((a0.x + b0.x) / 2, (a0.y + b0.y) / 2);
  await page.getByRole('button', { name: /基数/ }).click();
  await expect(codeOut).toContainText('A ||--o| B : has');

  // Add a third entity on the canvas and relate it to A (A ||--o{ N3).
  const canvas = page.getByTestId('visual-canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('canvas box missing');
  }
  await page.mouse.dblclick(box.x + 500, box.y + 320);
  await page.keyboard.type('C');
  await page.keyboard.press('Enter');
  const a = center(await nodeBox(page, 'A'));
  await page.mouse.click(a.x, a.y);
  const handle = await bottomHandle(page);
  const c = center(await nodeBox(page, 'N3'));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.up();
  await expect(codeOut).toContainText('A ||--o{ N3');
  expect(pageErrors).toEqual([]);
});
