import { expect, test, type Page } from '@playwright/test';

// Same constraints as visualEditor.spec.ts: wider viewport for the canvas.
test.use({ viewport: { height: 1080, width: 1920 } });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

// Clipboard paste (typing special characters races Monaco's state sync).
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

test('visual editor imports journey diagrams into the board view', async ({ page }) => {
  await openEditor(page);
  await typeCode(
    page,
    'journey\n  title My day\n  section Go to work\n    Make tea: 5: Me\n    Do work: 1: Me'
  );
  const codeOut = await enterVisual(page);

  await expect(codeOut).toContainText('journey');
  await expect(codeOut).toContainText('Make tea: 5: Me');

  // Journey edits on the board: one column per section, one card per task.
  const board = page.getByTestId('visual-board');
  await expect(board).toBeVisible();
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
  await expect(board.getByLabel('分组名称')).toHaveCount(1);
  await expect(board.getByTestId('visual-board-card')).toHaveCount(2);

  // Adding a task under the section appends it after the existing tasks.
  await board.getByTestId('visual-board-add-card').first().click();
  const input = board.getByLabel('任务名称').last();
  await input.fill('Walk dog');
  await input.blur();
  const text = await codeOut.textContent();
  const sectionIdx = text?.indexOf('section Go to work') ?? -1;
  const taskIdx = text?.indexOf('Walk dog: 5') ?? -1;
  expect(taskIdx).toBeGreaterThan(sectionIdx);
  expect(sectionIdx).toBeGreaterThan(-1);

  // The journey renders after leaving visual mode (the task label appears in
  // both an HTML label and an SVG tspan — one match is enough).
  await page.getByTestId('visual-tab').click();
  await expect(
    page.locator('#container svg').getByText('Make tea', { exact: true }).first()
  ).toBeVisible();
});

test('visual editor edits git graphs as an operation list', async ({ page }) => {
  await openEditor(page);
  await typeCode(
    page,
    'gitGraph\n  commit id: "a1"\n  branch dev\n  commit id: "b1"\n  checkout main\n  merge dev id: "m1"'
  );
  const codeOut = await enterVisual(page);

  await expect(codeOut).toContainText('branch dev');
  await expect(codeOut).toContainText('checkout main');
  await expect(codeOut).toContainText('merge dev id: "m1"');

  // Git edits as an ordered operation list: commit / merge rows.
  const editor = page.getByTestId('visual-git');
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
  await expect(editor.locator('[data-operation-id]')).toHaveCount(3);

  // The merge row carries its source branch; commits carry id and branch.
  const mergeRow = editor.locator('[data-operation-id="C3"]');
  await expect(mergeRow.getByLabel('合并来源')).toHaveValue('dev');
  await expect(mergeRow.getByLabel('提交 ID')).toHaveValue('m1');

  // A new commit lands on the active branch (main).
  await editor.getByTestId('visual-git-add-commit').click();
  const newRow = editor.locator('[data-operation-id="N4"]');
  await newRow.getByLabel('提交 ID').fill('c9');
  await newRow.getByLabel('提交 ID').blur();
  await expect(codeOut).toContainText('commit id: "c9"');
  const text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('merge dev')).toBeLessThan(text.indexOf('commit id: "c9"'));
});

test('visual editor edits pie slices with values', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85');
  const codeOut = await enterVisual(page);

  await expect(codeOut).toContainText('pie title Pets');
  await expect(codeOut).toContainText('"Dogs": 386');

  // Pie edits on the sheet: one row per slice, name + value inline.
  const sheet = page.getByTestId('visual-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);

  const dogsRow = sheet.locator('[data-row-id="S1"]');
  await dogsRow.getByLabel('数值').fill('400');
  await dogsRow.getByLabel('数值').blur();
  await expect(codeOut).toContainText('"Dogs": 400');

  // The pie renders after leaving visual mode.
  await page.getByTestId('visual-tab').click();
  await expect(page.locator('#container').getByText('Dogs', { exact: true }).first()).toBeVisible();
});

test('compare mode shows the real mermaid preview beside code and canvas', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85');

  const codeOut = await enterVisual(page);

  // Plain mode (default): only the code editor + interactive canvas, no
  // separate mermaid preview pane.
  await expect(page.getByTestId('visual-preview')).toHaveCount(0);

  // 对比 mode: a third pane renders through the very same View pipeline.
  await page.getByTestId('visual-preview-toggle').click();
  const compare = page.getByTestId('visual-preview');
  await expect(compare).toBeVisible();
  await expect(compare.locator('svg[id^="graph-"]')).toBeVisible({ timeout: 10_000 });
  await expect(compare.getByText('Dogs', { exact: true }).first()).toBeVisible();

  // Sheet edits flow through the state gateway into the mermaid render.
  await page.getByTestId('visual-sheet-add-row').click();
  const nameInput = page.getByTestId('visual-sheet').getByLabel('切片名').last();
  await nameInput.fill('Birds');
  await nameInput.blur();
  await expect(codeOut).toContainText('"Birds": 1');
  await expect(compare.getByText('Birds', { exact: true }).first()).toBeVisible({
    timeout: 10_000
  });

  // The preference persists across re-entering the visual tab.
  await page.getByTestId('visual-tab').click();
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.getByTestId('visual-tab').click();
  await expect(page.getByTestId('visual-preview')).toBeVisible();
  await expect(page.getByTestId('visual-sheet')).toBeVisible();
});

test('visual editor drags quadrant points into new coordinates', async ({ page }) => {
  await openEditor(page);
  await typeCode(
    page,
    'quadrantChart\n  x-axis Low --> High\n  y-axis Low --> High\n  Point B: [0.45, 0.23]'
  );
  const codeOut = await enterVisual(page);

  await expect(codeOut).toContainText('Point B: [0.45, 0.23]');

  // Coordinate kinds are position-driven: dragging a node rewrites its [x, y]
  // in the generated code (snap grid 10px; 0.45*1840+80 = 908, +150 → 0.53).
  // The split preview pane narrows the canvas — scroll the node into view
  // first so its world coordinates stay over the canvas, not the preview.
  const nodeB = page.locator('[data-node-id="P1"]');
  await nodeB.scrollIntoViewIfNeeded();
  const box = await nodeB.boundingBox();
  if (!box) {
    throw new Error('quadrant point not found');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy, { steps: 6 });
  await page.mouse.up();

  await expect(codeOut).toContainText('Point B: [0.53, 0.23]');
});
