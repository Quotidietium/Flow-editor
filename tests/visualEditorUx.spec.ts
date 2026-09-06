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

// Clipboard paste into the code editor (typing special chars races Monaco).
const typeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(code.split('\n')[0]?.trim() ?? '');
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

  // Rubber band (Shift+drag) around A and B only; Delete removes exactly
  // the enclosed set.
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 100, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1[A]');
  await expect(codeOut).not.toContainText('N2[B]');
  await expect(codeOut).toContainText('N3[C]');
  expect(pageErrors).toEqual([]);
});

test('blank drag pans the canvas; blank click clears the selection', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Pan');
  const canvas = page.getByTestId('visual-canvas');

  // Plain left-drag on empty canvas scrolls the view (no modifier needed).
  const before = await canvas.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 220, { steps: 4 });
  await page.mouse.up();
  const after = await canvas.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(after.x).toBeGreaterThan(before.x + 100);
  expect(after.y).toBeGreaterThan(before.y + 50);

  // A blank click without movement clears the selection instead of panning.
  // (The node moved on screen during the pan — re-measure before clicking.)
  const node = page.locator('[data-node-id="N1"]');
  const nb = await node.boundingBox();
  if (!nb) {
    throw new Error('node missing after pan');
  }
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  const selectedStroke = page.locator('[data-node-id="N1"] rect[stroke="var(--primary)"]');
  await expect(selectedStroke).toHaveCount(1);
  await page.mouse.click(box.x + 700, box.y + 450);
  await expect(selectedStroke).toHaveCount(0);
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

test('AutoConnect arrow spawns a connected node', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'First');
  await page.mouse.click(box.x + 240, box.y + 180);

  await page.getByTestId('visual-autoconnect-right').click();
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');

  await expect(codeOut).toContainText('N1 --> N2');
  await expect(codeOut).toContainText('N2[Second]');
});

test('AutoConnect arrow connects the nearest existing node', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 180, 'A');
  await addNode(page, box.x + 460, box.y + 185, 'B');
  await page.mouse.click(box.x + 200, box.y + 180);

  await page.getByTestId('visual-autoconnect-right').click();
  await expect(codeOut).toContainText('N1 --> N2');
  // No new node was spawned: still exactly two nodes.
  await expect(codeOut).not.toContainText('N3');
});

test('Alt+Shift+Arrow clones the selection and connects it', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Orig');
  await page.mouse.click(box.x + 240, box.y + 180);
  await page.keyboard.press('Alt+Shift+ArrowRight');

  await expect(codeOut).toContainText('N1[Orig]');
  await expect(codeOut).toContainText('N2[Orig]');
  await expect(codeOut).toContainText('N1 --> N2');
});

test('insert palette creates a specific shape', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  await page.getByTestId('visual-insert').click();
  const menu = page.getByTestId('visual-insert-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '形状：菱形' }).click();
  await page.keyboard.type('Decision');
  await page.keyboard.press('Enter');

  await expect(codeOut).toContainText('N1{Decision}');
});

test('ctrl+wheel zooms the canvas and Ctrl+H resets it', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Zoom');
  const node = page.locator('[data-node-id="N1"]');
  const before = await node.boundingBox();
  if (!before) {
    throw new Error('node missing');
  }

  await page.mouse.move(box.x + 300, box.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  const zoomed = await node.boundingBox();
  expect(zoomed?.width ?? 0).toBeGreaterThan(before.width * 1.08);

  await page.keyboard.press('Control+KeyH');
  const reset = await node.boundingBox();
  expect(Math.abs((reset?.width ?? 0) - before.width)).toBeLessThanOrEqual(2);
});

// 缩放读数点击复位（循环 151）：工具栏 % 读数即按钮，与 Ctrl+H 同语义
test('clicking the canvas zoom readout resets the view', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);

  const readout = page.getByTestId('visual-zoom-reset');
  await expect(readout).toHaveText('100%');

  const box = await canvasBox(page);
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(readout).not.toHaveText('100%');

  await readout.click();
  await expect(readout).toHaveText('100%');
});

// 画布键盘缩放（循环 156）：+/- 锚定视口中心缩放（与 Ctrl+滚轮同 1.1
// 步进）、0 复位（Ctrl+H 别名）；输入框聚焦时守卫不劫持——预览区
// +/-/0（循环 148）的画布同款。
test('keyboard +/-/0 zoom the canvas; typing targets untouched', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  const readout = page.getByTestId('visual-zoom-reset');
  await expect(readout).toHaveText('100%');

  await page.keyboard.press('+');
  await expect(readout).toHaveText('110%');
  await page.keyboard.press('-');
  await expect(readout).toHaveText('100%');
  await page.keyboard.press('-');
  await expect(readout).toHaveText('91%');
  await page.keyboard.press('0');
  await expect(readout).toHaveText('100%');

  // 输入态守卫：搜索框里敲 + 是文本不是缩放
  const search = page.getByTestId('visual-canvas-search');
  await search.click();
  await search.press('+');
  await expect(readout).toHaveText('100%');
  await expect(search).toHaveValue('+');
});

// 画布选中计数（循环 158）：框选/加选准备批量删除、对齐时没有任何数量
// 反馈——状态行补「已选 N 项」（代码侧状态栏「已选 N 字符」的画布同款）。
test('selection count appears in the status row and clears with Esc', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  const count = page.getByTestId('visual-selected-count');
  // 未选中时不占位
  await expect(count).toHaveCount(0);

  // 单选 A → 已选 1 项；Ctrl+点击加选 B → 已选 2 项
  await page.locator('[data-node-id="A"]').click();
  await expect(count).toHaveText('已选 1 项');
  await page.keyboard.down('Control');
  await page.locator('[data-node-id="B"]').click();
  await page.keyboard.up('Control');
  await expect(count).toHaveText('已选 2 项');

  // Esc 取消选择 → 计数消失
  await page.keyboard.press('Escape');
  await expect(count).toHaveCount(0);
});

test('creating a link opens its label editor immediately (Enter commits, Esc skips)', async ({
  page
}) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 200, 'From');
  await addNode(page, box.x + 560, box.y + 200, 'To');

  const labelEditor = page.locator('input[type="text"].absolute');
  await expect(labelEditor).toHaveCount(0);

  // 选中 From 露出连线圆点，从右侧圆点拖到 To 节点。
  const from = await page.locator('[data-node-id="N1"]').boundingBox();
  const to = await page.locator('[data-node-id="N2"]').boundingBox();
  if (!from || !to) {
    throw new Error('nodes missing');
  }
  await page.mouse.click(from.x + 20, from.y + 10);
  await page.mouse.move(from.x + from.width, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();

  // 连线落定即开标签输入并聚焦（与新建节点同款）：直接键入回车提交。
  await expect(labelEditor).toBeVisible();
  await expect(labelEditor).toBeFocused();
  await labelEditor.fill('是');
  await page.keyboard.press('Enter');
  await expect(codeOut).toContainText('是');
  await expect(labelEditor).toHaveCount(0);

  // 反向再连一条，Esc 跳过——连线在、无标签。
  await page.mouse.click(to.x + 20, to.y + 10);
  await page.mouse.move(to.x, to.y + to.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(labelEditor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(labelEditor).toHaveCount(0);
  await expect(codeOut).toContainText('N2 --> N1');
});

test('linking over a valid target highlights it as drop affordance', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 200, 'Src');
  await addNode(page, box.x + 560, box.y + 200, 'Dst');

  const s = await page.locator('[data-node-id="N1"]').boundingBox();
  const d = await page.locator('[data-node-id="N2"]').boundingBox();
  if (!s || !d) {
    throw new Error('nodes missing');
  }
  await page.mouse.click(s.x + 20, s.y + 10);
  await page.mouse.move(s.x + s.width, s.y + s.height / 2); // 右侧连线圆点
  await page.mouse.down();

  // 悬停空白：无落点高亮
  await page.mouse.move(box.x + 380, box.y + 200, { steps: 4 });
  await expect(page.getByTestId('visual-link-hover')).toHaveCount(0);

  // 悬停目标节点：高亮圈出现
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 4 });
  await expect(page.getByTestId('visual-link-hover')).toBeVisible();

  // 悬停回源节点：自身不是合法目标，高亮消失
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 4 });
  await expect(page.getByTestId('visual-link-hover')).toHaveCount(0);

  // 拖到目标松手：连线落地（循环 159 的标签框随之弹出，Esc 收掉）
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 4 });
  await expect(page.getByTestId('visual-link-hover')).toBeVisible();
  await page.mouse.up();
  await expect(codeOut).toContainText('N1 --> N2');
  await expect(page.getByTestId('visual-link-hover')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('space+drag pans the canvas', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  const canvas = page.getByTestId('visual-canvas');
  const box = await canvasBox(page);

  // Click empty canvas first so space cannot activate a focused toolbar button.
  await page.mouse.click(box.x + 600, box.y + 500);
  const before = await canvas.evaluate((el) => el.scrollLeft);
  await page.keyboard.down(' ');
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  const after = await canvas.evaluate((el) => el.scrollLeft);
  expect(after).toBeGreaterThan(before);
});

test('orthogonal routing renders manhattan edges with rounded bends', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 160, 'A');
  await addNode(page, box.x + 600, box.y + 420, 'B');
  // Connect via the bottom handle of A dragged onto B.
  const a = await page.locator('[data-node-id="N1"]').boundingBox();
  const b = await page.locator('[data-node-id="N2"]').boundingBox();
  if (!a || !b) {
    throw new Error('nodes missing');
  }
  await page.mouse.click(a.x + 20, a.y + 10);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(codeOut).toContainText('N1 --> N2');

  // The rendered visual path is a routed manhattan with rounded bends.
  const path = page.locator('path[data-edge-id="E1"]');
  const d = await path.getAttribute('d');
  expect(d).toMatch(/^M/);
  expect((d?.match(/Q/g) ?? []).length).toBeGreaterThan(0);
});

test('resize handles change the node size and persist', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 240, box.y + 180, 'Resize');
  const node = page.locator('[data-node-id="N1"]');
  const before = await node.boundingBox();
  if (!before) {
    throw new Error('node missing');
  }
  await page.mouse.click(before.x + 20, before.y + 10);

  const se = page.getByTestId('visual-resize-se');
  const handle = await se.boundingBox();
  if (!handle) {
    throw new Error('handle missing');
  }
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 104, handle.y + 44, { steps: 4 });
  await page.mouse.up();

  const after = await node.boundingBox();
  expect(after?.width ?? 0).toBeGreaterThan(before.width + 80);
  expect(after?.height ?? 0).toBeGreaterThan(before.height + 20);
  // Size is editor-local: the generated code keeps the plain node syntax.
  await expect(codeOut).toContainText('N1[Resize]');

  // 重置尺寸 via the node context menu restores the default size.
  if (!after) {
    throw new Error('node box missing after resize');
  }
  await page.mouse.click(after.x + 20, after.y + 10, { button: 'right' });
  await page.getByTestId('visual-context-menu').getByRole('button', { name: '重置尺寸' }).click();
  const reset = await node.boundingBox();
  expect(Math.abs((reset?.width ?? 0) - before.width)).toBeLessThanOrEqual(1);
});

test('grouped-list kinds render on the board editor (not the canvas)', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'journey\n  title T\n  section S1\n    task: 5: Me');
  await enterVisual(page);

  // Grouped-list kinds moved to the board editor (2.0.119): the journey
  // section renders as a board column, not a canvas container.
  const board = page.getByTestId('visual-board');
  await expect(board).toBeVisible();
  await expect(board.getByLabel('分组名称')).toHaveValue('S1');
  await expect(board.getByTestId('visual-board-card').getByLabel('任务名称')).toHaveValue('task');
});

test('inline label editor keeps its size at any canvas zoom', async ({ page }) => {
  await openEditor(page);
  await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  const box = await canvasBox(page);
  await addNode(page, box.x + 260, box.y + 200, 'ZoomEdit');

  const node = page.locator('[data-node-id="N1"]');
  const nb = await node.boundingBox();
  if (!nb) {
    throw new Error('node missing');
  }

  const fontAt = async (): Promise<string> => {
    await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + 20);
    const input = page.locator('input[type="text"].absolute');
    const font = await input.evaluate((el) => getComputedStyle(el).fontSize);
    await page.keyboard.press('Escape');
    return font;
  };

  const before = await fontAt();

  // Zoom out twice (0.4x region) — the editor must not shrink with the canvas.
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 120);
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);

  const after = await fontAt();
  expect(after).toBe(before);
});

test('history restore reloads the visual canvas and resets undo', async ({ page }) => {
  await openEditor(page);
  const codeOut = await enterVisual(page);
  await page.getByTestId('visual-clear').click();

  // Diagram A: two nodes, connected.
  const box = await canvasBox(page);
  await addNode(page, box.x + 200, box.y + 200, 'Alpha');
  await addNode(page, box.x + 500, box.y + 200, 'Beta');
  await expect(codeOut).toContainText('N2[Beta]');

  // Open the history pane first — the save button lives inside it.
  await page.getByTitle('历史记录').click();
  await page.getByTitle('保存当前状态').waitFor({ state: 'visible' });
  await page.getByTitle('保存当前状态').click();
  await page.waitForTimeout(300);

  // Diagram B replaces A in the editor (visual mode never left — the
  // history pane opens beside it, the toggle stays pressed).
  await page.getByTestId('visual-clear').click();
  await addNode(page, box.x + 300, box.y + 300, 'Gamma');
  await expect(codeOut).toContainText('N1[Gamma]');
  await expect(codeOut).not.toContainText('N2[Beta]');

  // Restore diagram A from the history panel (external state change).
  await page.getByTitle('恢复此版本').first().click();
  await page.waitForTimeout(500);

  // The canvas must show the RESTORED diagram (visual mode never left —
  // the external code change reloads it through the state gateway)…
  await expect(codeOut).toContainText('N2[Beta]');
  await expect(codeOut).not.toContainText('Gamma');
  await expect(page.locator('[data-node-id="N2"]')).toBeVisible();

  // …and the undo stack must have been cleared by the external replacement
  // (undoing across a history restore is undefined history).
  await expect(page.getByTestId('visual-undo')).toBeDisabled();
});

test('editor survives the mobile boundary with state intact', async ({ page }) => {
  await openEditor(page);
  await page.setViewportSize({ height: 1080, width: 1920 });

  // Desktop Monaco: replace the diagram with something recognizable.
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph LR\n  Edge --> Boundary');
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(page.locator('#container')).toContainText('Boundary');

  // Cross the 640px boundary: the CodeMirror mobile editor mounts and must
  // carry the same state (it syncs from the gateway, not from Monaco).
  await page.setViewportSize({ height: 800, width: 400 });
  await page.waitForTimeout(600);
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  const cm = page.locator('.cm-editor');
  await expect(cm).toBeVisible();
  await expect(cm).toContainText('Boundary');

  // Round-trip back to desktop: Monaco must remount (dispose-before-create
  // across the boundary — duplicate model URIs would throw otherwise).
  await page.setViewportSize({ height: 1080, width: 1920 });
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.monaco-editor')).toContainText('Boundary');
  await page.setViewportSize({ height: 800, width: 400 });
  await page.waitForTimeout(600);

  // Editing on mobile still flows through the gateway and renders. Click the
  // content host directly (the cm-editor chrome intercepts plain clicks).
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('pie\n  "M": 1');
  await page.waitForTimeout(800);
  await expect(page.locator('#container')).toContainText('M');
});
