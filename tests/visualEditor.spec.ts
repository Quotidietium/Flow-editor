import { expect, test, type Page } from '@playwright/test';

// The project config inherits devices['Desktop Chrome'] (1280×720); the visual
// canvas needs more room for the interactions below.
test.use({ viewport: { height: 1080, width: 1920 } });

// Canvas interactions use viewport coordinates derived from the canvas box
// (mouse-based, no element actionability checks) — the standard approach for
// drawing-canvas UIs.
const at = (box: { x: number; y: number }, x: number, y: number): { x: number; y: number } => ({
  x: box.x + x,
  y: box.y + y
});

// Navigate twice: on the very first visit against a cold dev server, Vite's
// dependency optimizer can trigger a full page reload that would swallow
// mid-test interactions (CI uses a production build and never reloads).
const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

test('visual editor generates flowchart code from canvas interactions', async ({ page }) => {
  await openEditor(page);

  // Enter WYSIWYG mode: the visual editor takes over the large preview pane.
  await page.getByTestId('visual-tab').click();

  const canvas = page.getByTestId('visual-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('canvas has no bounding box');
  }
  // The canvas lives in the right (preview) pane, not the narrow editor pane.
  expect(box.width).toBeGreaterThan(700);
  // Keep all points well inside the visible canvas area.
  const cx = Math.min(240, box.width * 0.35);
  const y1 = box.height * 0.3;
  const y2 = box.height * 0.75;

  // Start from an empty canvas (the default sample would otherwise be parsed in).
  await page.getByTestId('visual-clear').click();

  // Create two nodes by double-clicking the canvas; the label editor opens.
  const p1 = at(box, cx, y1);
  await page.mouse.dblclick(p1.x, p1.y);
  await page.keyboard.type('Start');
  await page.keyboard.press('Enter');

  const p2 = at(box, cx, y2);
  await page.mouse.dblclick(p2.x, p2.y);
  await page.keyboard.type('End');
  await page.keyboard.press('Enter');

  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toContainText('flowchart TD');
  await expect(codeOut).toContainText('N1[Start]');
  await expect(codeOut).toContainText('N2[End]');

  // Select the first node (click) to reveal its link handles, then drag the
  // bottom handle onto the second node to create an edge.
  const connect = async (): Promise<void> => {
    await page.mouse.click(p1.x, p1.y);
    const handle = at(box, cx, y1 + 22); // bottom handle of the first node
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 8 });
    await page.mouse.up();
    // 连线落定会自动打开标签输入（循环 159）——本用例不标注，Esc 收掉。
    await page.keyboard.press('Escape');
  };
  await connect();

  await expect(codeOut).toContainText('N1 --> N2');

  // Select the edge by clicking its midpoint and delete it with the keyboard.
  const mid = at(box, cx, (y1 + y2) / 2 + 11);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press('Delete');
  await expect(codeOut).not.toContainText('N1 --> N2');

  // Recreate the edge so the final diagram has both nodes connected.
  await connect();
  await expect(codeOut).toContainText('N1 --> N2');

  // Leave visual mode: the preview renders the generated code (WYSIWYG loop).
  await page.getByTestId('visual-tab').click();
  await expect(page.locator('#container').getByText('Start', { exact: true })).toBeVisible();
  await expect(page.locator('#container').getByText('End', { exact: true })).toBeVisible();

  // The state gateway persisted the generated source.
  const store = await page.evaluate(() => localStorage.getItem('codeStore'));
  expect(store).toContain('N1[Start]');
});

// Replace the editor content via the clipboard (a single atomic paste —
// typing `( )` char-by-char races Monaco's state sync and drops keys).
const typeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(code.split('\n')[1]?.trim() ?? '');
};

// boundingBox includes the selection stroke (2.5px vs 1.5px), so compare
// with a 1px tolerance instead of exact equality.
const sameSpot = (
  box: { height: number; width: number; x: number; y: number } | null,
  ref: { x: number; y: number }
): boolean => Math.abs((box?.x ?? -9999) - ref.x) <= 1 && Math.abs((box?.y ?? -9999) - ref.y) <= 1;

test('visual editor keeps node positions across mode switches and reloads', async ({ page }) => {
  await openEditor(page);
  await page.getByTestId('visual-tab').click();

  const nodeA = page.locator('[data-node-id="A"]');
  await expect(nodeA).toBeVisible();
  const before = await nodeA.boundingBox();
  if (!before) {
    throw new Error('node A not found in canvas');
  }

  // Drag node A to a clearly different place (snap grid = 10px).
  const cx = before.x + before.width / 2;
  const cy = before.y + before.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 6 });
  await page.mouse.up();
  const moved = await nodeA.boundingBox();
  if (!moved) {
    throw new Error('node A disappeared after drag');
  }
  expect(moved.x).not.toBe(before.x);

  // Leave and re-enter visual mode: the canvas must not visibly re-layout
  // (the whole point of WYSIWYG — positions are remembered per node id).
  await page.getByTestId('visual-tab').click();
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.getByTestId('visual-tab').click();
  await expect(nodeA).toBeVisible();
  expect(sameSpot(await nodeA.boundingBox(), moved)).toBe(true);

  // Positions survive a reload via localStorage.
  await page.reload();
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.getByTestId('visual-tab').click();
  await expect(nodeA).toBeVisible();
  expect(sameSpot(await nodeA.boundingBox(), moved)).toBe(true);
});

test('visual editor imports and edits sequence diagrams', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi');
  await page.getByTestId('visual-tab').click();

  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toContainText('participant Alice');
  await expect(codeOut).toContainText('Alice->>Bob: Hello');
  await expect(codeOut).toContainText('Bob-->>Alice: Hi');

  // Sequence edits on the sequence editor: adding a participant keeps the
  // minted id with the typed name as the display label.
  const editor = page.getByTestId('visual-sequence');
  await expect(editor).toBeVisible();
  await editor.getByTestId('visual-sequence-add-participant').click();
  await page.keyboard.type('Carol');
  await page.keyboard.press('Enter');
  await expect(codeOut).toContainText('participant N3 as Carol');

  // Leaving visual mode renders the generated sequence diagram.
  await page.getByTestId('visual-tab').click();
  await expect(page.locator('#container').getByText('Hello', { exact: true })).toBeVisible();
});

test('visual editor imports and edits class diagrams', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'classDiagram\n  class Foo {\n    +bar() void\n  }\n  Foo --> Bar : uses');
  await page.getByTestId('visual-tab').click();

  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toContainText('classDiagram');
  await expect(codeOut).toContainText('+bar() void');
  await expect(codeOut).toContainText('Foo --> Bar : uses');

  // Select Foo and edit its members through the detail editor.
  await page.locator('[data-node-id="Foo"]').click();
  await page.getByRole('button', { name: '编辑内容' }).click();
  const detail = page.getByTestId('visual-detail-editor');
  await detail.fill('+bar() void\n+baz() int');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(codeOut).toContainText('+baz() int');

  // Cycle the selected relation: 关联 (--) → 虚线关联 (..). The edge's hit
  // path has zero geometric width (vertical line), so click its midpoint
  // with absolute coordinates derived from the two node boxes.
  const fooBox = await page.locator('[data-node-id="Foo"]').boundingBox();
  const barBox = await page.locator('[data-node-id="Bar"]').boundingBox();
  if (!fooBox || !barBox) {
    throw new Error('class nodes not found in canvas');
  }
  await page.mouse.click(
    (fooBox.x + fooBox.width / 2 + barBox.x + barBox.width / 2) / 2,
    (fooBox.y + fooBox.height + barBox.y) / 2
  );
  await page.getByRole('button', { name: '线型: 箭头关联' }).click();
  await expect(codeOut).toContainText('Foo .. Bar');
});

test('visual editor imports the existing flowchart code', async ({ page }) => {
  await openEditor(page);

  // The default sample is a 6-node flowchart.
  await expect(page.locator('#view')).toBeVisible();
  await page.getByTestId('visual-tab').click();

  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toContainText('flowchart TD');
  await expect(codeOut).toContainText('A[圣诞节]');
  await expect(codeOut).toContainText('C{让我想想}');
  await expect(codeOut).toContainText('A -->|拿到压岁钱| B');

  // Shape cycling on a selected node round-trips into the generated code.
  // The first node's center is read from the rendered SVG, not hardcoded.
  const nodeACenter = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="visual-canvas"] svg');
    const rect = svg?.querySelector('g rect');
    if (!rect) {
      return null;
    }
    const canvas = document.querySelector('[data-testid="visual-canvas"]');
    const cb = canvas?.getBoundingClientRect();
    const rb = rect.getBoundingClientRect();
    return cb
      ? {
          x: cb.x + (rb.x - cb.x) + rb.width / 2,
          y: cb.y + (rb.y - cb.y) + rb.height / 2
        }
      : null;
  });
  if (!nodeACenter) {
    throw new Error('first node not found in canvas');
  }
  await page.mouse.click(nodeACenter.x, nodeACenter.y);
  await page.getByRole('button', { name: /形状/ }).click();
  await expect(codeOut).toContainText('A(圣诞节)');
});
