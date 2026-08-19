import { expect, test } from '@playwright/test';

// The editor must not contact any external service on its own: no analytics,
// no promo/commercial endpoints, no CDN fonts, no schema fetches. The only
// network traffic is the app itself (localhost).
test('editor loads and edits without any external network request', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      external.push(request.url());
    }
  });

  // First visit against a cold dev server can trigger a Vite optimize reload.
  await page.goto('/edit');
  await expect(page.locator('#view')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await expect(page.locator('#view')).toBeVisible();
  // Trigger a code change → re-render pipeline via the visual editor.
  await page.getByTestId('visual-tab').click();
  await expect(page.getByTestId('visual-canvas')).toBeVisible();
  await page.getByTestId('visual-clear').click();
  await page.getByTestId('visual-add-node').click();
  await expect(page.getByTestId('visual-code-out')).toContainText('N1[N1]');
  await page.getByTestId('visual-tab').click();

  // Share dialog renders embed snippets locally.
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByTestId('embed-snippet')).toBeVisible();

  expect(external).toEqual([]);
});

test('embed page loads without any external network request', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      external.push(request.url());
    }
  });

  await page.goto('/embed#code:graph%20TD%0A%20%20A%20--%3E%20B');
  await expect(page.locator('#embed-container svg')).toBeVisible();

  expect(external).toEqual([]);
});
