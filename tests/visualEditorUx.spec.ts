import { expect, test, type Page } from '@playwright/test';

// Local tracing + mid-drag screenshots can freeze the renderer during the
// marquee/batch-drag sequences below (positions verified green with tracing
// disabled); keep this spec lean.
test.use({ trace: 'off', viewport: { height: 1080, width: 1920 } });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

const enterVisual = async (page: Page) => {
  await page.getByTestId('visual-tab').click();
  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toBeVisible();
  return codeOut;
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('visual-canvas').boundingBox();
  if (!box) {
    throw new Error('canvas has no box');
  }
  return box;
};

// Create a node via canvas double-click and name it.
const addNode = async (page: Page, x: number, y: number, label: string): Promise<void> => {
  await page.mouse.dblclick(x, y);
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
};

test('multi-select deletes several nodes at once', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 120, 'One');
  await addNode(page, box.x + 200, box.y + 320, 'Two');
  await addNode(page, box.x + 500, box.y + 220, 'Three');
  await expect(codeOut).toContainText('N3[Three]');

  // Shift-click adds to the selection; Delete removes every member at once.
  await page.mouse.click(box.x + 200, box.y + 120);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 200, box.y + 320);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1[One]');
  await expect(codeOut).not.toContainText('N2[Two]');
  await expect(codeOut).toContainText('N3[Three]');
});

test('rubber band selects enclosed nodes for a batch delete', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 140, 'A');
  await addNode(page, box.x + 220, box.y + 260, 'B');
  await addNode(page, box.x + 700, box.y + 200, 'C');

  // Rubber band around A and B only; Delete removes exactly the enclosed set.
  await page.mouse.move(box.x + 100, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1[A]');
  await expect(codeOut).not.toContainText('N2[B]');
  await expect(codeOut).toContainText('N3[C]');
  expect(pageErrors).toEqual([]);
});

test('batch drag moves every selected node together', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 140, 'A');
  await addNode(page, box.x + 220, box.y + 300, 'B');
  await addNode(page, box.x + 700, box.y + 200, 'C');

  const before = {
    a: await page.locator('[data-node-id="N1"]').boundingBox(),
    b: await page.locator('[data-node-id="N2"]').boundingBox(),
    c: await page.locator('[data-node-id="N3"]').boundingBox()
  };

  // Shift-click selects A and B, dragging either moves both; C stays put.
  if (!before.a || !before.b) {
    throw new Error('nodes missing before drag');
  }
  await page.mouse.click(before.a.x + 30, before.a.y + 10);
  await page.keyboard.down('Shift');
  await page.mouse.click(before.b.x + 30, before.b.y + 10);
  await page.keyboard.up('Shift');
  const aCenter = { x: before.a.x + before.a.width / 2, y: before.a.y + before.a.height / 2 };
  await page.mouse.move(aCenter.x, aCenter.y);
  await page.mouse.down();
  await page.mouse.move(aCenter.x, aCenter.y + 130, { steps: 4 });
  await page.mouse.up();

  const a = await page.locator('[data-node-id="N1"]').boundingBox();
  const b = await page.locator('[data-node-id="N2"]').boundingBox();
  const c = await page.locator('[data-node-id="N3"]').boundingBox();
  expect((a?.y ?? 0) - (before.a?.y ?? 0)).toBeGreaterThan(100);
  expect((b?.y ?? 0) - (before.b?.y ?? 0)).toBeGreaterThan(100);
  expect(Math.abs((c?.y ?? -1) - (before.c?.y ?? -2))).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('undo restores a deleted node and redo reapplies it', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Keep');

  await page.mouse.click(box.x + 240, box.y + 180);
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1[Keep]');

  await page.keyboard.press('Control+KeyZ');
  await expect(codeOut).toContainText('N1[Keep]');

  await page.keyboard.press('Control+KeyY');
  await expect(codeOut).not.toContainText('N1[Keep]');
});

test('Ctrl+D duplicates the selection with fresh ids', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Orig');
  await page.mouse.click(box.x + 240, box.y + 180);
  await page.keyboard.press('Control+KeyD');

  await expect(codeOut).toContainText('N1[Orig]');
  await expect(codeOut).toContainText('N1_1[Orig]');
  await expect(page.locator('[data-node-id="N1_1"]')).toBeVisible();
});

test('context menu edits and aligns like office software', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 140, 'L');
  await addNode(page, box.x + 520, box.y + 300, 'R');

  // Node context menu: rename via 编辑标签.
  await page.mouse.click(box.x + 520, box.y + 300);
  await page.mouse.click(box.x + 520, box.y + 300, { button: 'right' });
  const menu = page.getByTestId('visual-context-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: /编辑标签/ }).click();
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('Right');
  await page.keyboard.press('Enter');
  await expect(codeOut).toContainText('N2[Right]');

  // Multi-select both nodes, then align left via the context submenu.
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 200, box.y + 140);
  await page.keyboard.up('Shift');
  await page.mouse.click(box.x + 200, box.y + 140, { button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '对齐 ▸' }).hover();
  await menu.getByRole('button', { name: '左对齐' }).click();

  const l = await page.locator('[data-node-id="N1"]').boundingBox();
  const r = await page.locator('[data-node-id="N2"]').boundingBox();
  expect(Math.abs((l?.x ?? -1) - (r?.x ?? -2))).toBeLessThanOrEqual(1);

  // Canvas context menu offers paste/select-all utilities.
  await page.mouse.click(box.x + 900, box.y + 420, { button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: /全选/ }).click();
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1[L]');
});

test('alignment guides snap a dragged node to its neighbour', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 200, 'Anchor');
  await addNode(page, box.x + 600, box.y + 380, 'Drift');

  // Drag the second node so its left edge lands ~3px off the anchor's left
  // edge; the guide tolerance (6px) must snap them flush.
  const anchor = await page.locator('[data-node-id="N1"]').boundingBox();
  const drift = await page.locator('[data-node-id="N2"]').boundingBox();
  if (!anchor || !drift) {
    throw new Error('nodes missing');
  }
  await page.mouse.move(drift.x + drift.width / 2, drift.y + drift.height / 2);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 3 + drift.width / 2, anchor.y + 180, { steps: 8 });
  await page.mouse.up();

  const snapped = await page.locator('[data-node-id="N2"]').boundingBox();
  expect(Math.abs((snapped?.x ?? -1) - anchor.x)).toBeLessThanOrEqual(1);
});
