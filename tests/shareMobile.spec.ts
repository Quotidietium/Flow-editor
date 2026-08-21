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

  // History and plugin toggles are reachable from the same row.
  await page.getByTitle('历史记录').click();
  await expect(page.getByTitle('保存当前状态')).toBeVisible();
});

// Desktop layout must be unchanged: one action row, no duplicate buttons.
test('desktop navbar renders a single action row', async ({ page }) => {
  await page.setViewportSize({ height: 1080, width: 1920 });
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: '分享' })).toHaveCount(1);
  await expect(page.getByTitle('历史记录')).toHaveCount(1);
});
