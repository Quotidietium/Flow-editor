import { expect, test } from './test';

// Round 20: the navbar action row was hidden below md, leaving the Share
// dialog (a documented feature) with no entry point on mobile viewports.
test('share dialog is reachable on mobile viewports', async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 400 });
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: '分享' }).click();
  // The embed section is inline in the dialog (scrollable content).
  const snippet = page.getByTestId('embed-snippet');
  await expect(snippet).toBeVisible();
  await expect(snippet).toHaveValue(/iframe/, { timeout: 10_000 });

  // History and plugin toggles are reachable from the same row. The share
  // dialog is modal and rightly blocks background clicks — close it first
  // (clicking through it only worked while the overlay was still mounting).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: '历史记录' }).click();
  // Below sm the panel takes over the workspace as an overlay — it used to
  // mount invisibly (hidden sm:flex) while the toggle showed pressed.
  await expect(page.getByTitle('保存当前状态')).toBeVisible();
  await page.getByRole('button', { name: '历史记录' }).click();
  await expect(page.getByTitle('保存当前状态')).toBeHidden();
});

// Desktop layout must be unchanged: one action row, no duplicate buttons.
test('desktop navbar renders a single action row', async ({ page }) => {
  await page.setViewportSize({ height: 1080, width: 1920 });
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: '分享' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '历史记录' })).toHaveCount(1);
});

// Round 21: the fullscreen link in the COMPARE pane must target /view with
// the CURRENT diagram state (not a stale snapshot), and the plain-preview
// toolbar keeps its own correct target.
test('fullscreen link from compare pane carries current state', async ({ page }) => {
  await page.setViewportSize({ height: 1080, width: 1920 });
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });

  // Replace the diagram so the serialized state is distinguishable.
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph RL\n  Full --> Screen');
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(page.locator('#container')).toContainText('Screen');

  // Enter visual + compare mode; the compare pane's toolbar carries the link.
  await page.getByTestId('visual-tab').click();
  await page.getByTestId('visual-preview-toggle').click();
  const href = await page
    .getByTestId('visual-preview')
    .locator('a[title="全屏"]')
    .getAttribute('href');
  expect(href).toMatch(/\/view#(pako|base64):/);
  const hash = (href ?? '').split('#')[1] ?? '';
  // Decode in Node instead of importing app modules in the page context
  // (svelte-check would resolve the literal dynamic import as a module).
  const { deserializeState } = await import('../src/lib/util/serde');
  const state = deserializeState(hash);
  expect(state.code).toContain('Screen');
});
