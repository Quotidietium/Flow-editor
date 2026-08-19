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

test('visual editor imports the existing flowchart code', async ({ page }) => {
  await openEditor(page);

  // The default sample is a 6-node flowchart.
  await expect(page.locator('#view')).toBeVisible();
  await page.getByTestId('visual-tab').click();

  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toContainText('flowchart TD');
  await expect(codeOut).toContainText('A[Christmas]');
  await expect(codeOut).toContainText('C{Let me think}');
  await expect(codeOut).toContainText('A -->|Get money| B');

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
  await expect(codeOut).toContainText('A(Christmas)');
});
